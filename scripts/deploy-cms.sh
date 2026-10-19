#!/usr/bin/env bash
# Deploy the Umbraco CMS to dis-core in one command: build image -> publish
# syncroot -> wait for flux rollout -> health-check. Wraps the two GitHub Actions
# (docker-publish + publish-syncroot-main) that otherwise need six manual steps,
# so the CMS deploy matches the one-command frontend deploy (pnpm frontend:deploy:prod).
#
# Usage: bash scripts/deploy-cms.sh <tt02|prod> [image-tag]
#   image-tag optional; default = highest "Deploy N" seen + 1. Pass an integer to override.
#
# Requires: gh (authenticated, prod-dispatch rights), on main synced with origin/main.
# Verifies the CMS is healthy after rollout; the specific schema/content change is
# confirmed per-deploy (e.g. the Delivery API property you expect).

set -uo pipefail

ENV="${1:-}"; TAG="${2:-}"
case "$ENV" in
  tt02) KCTX="dis-core-tt02-aks"; CMS="https://kinorgeportal.tt02.dis-core.altinn.cloud"; FE="https://ki-norge-frontend-tt02.digitaliseringsdirektoratet.workers.dev" ;;
  prod) KCTX="dis-core-prod-aks"; CMS="https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev"; FE="https://ki.norge.no" ;;
  *) echo "Usage: bash scripts/deploy-cms.sh <tt02|prod> [image-tag]"; exit 1 ;;
esac
KNS="product-kinorgeportal"
fail() { echo "ERROR: $*" >&2; exit 1; }
note() { echo "▸ $*"; }

command -v gh >/dev/null || fail "gh (GitHub CLI) is missing."
[ -z "$(git status --porcelain)" ] || fail "The working tree is not clean. Commit/stash first."
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "HEAD != origin/main. The deploy builds from main, sync first."

if [ -z "$TAG" ]; then
  LAST=$(gh run list --workflow=publish-syncroot-main.yaml --limit 20 --json displayTitle --jq '.[].displayTitle' 2>/dev/null \
    | grep -oE 'Deploy [0-9]+' | grep -oE '[0-9]+' | sort -n | tail -1)
  TAG=$(( ${LAST:-0} + 1 ))
  note "Auto-tag: previous = ${LAST:-none} -> new image tag = $TAG"
fi
[[ "$TAG" =~ ^[0-9]+$ ]] || fail "image-tag must be an integer (got '$TAG')."

echo "Deploying CMS image $TAG to $ENV from main $(git rev-parse --short HEAD)."
if [ "$ENV" = "prod" ]; then
  read -r -p "This is PROD (live). Type 'prod' to continue: " c
  [ "$c" = "prod" ] || fail "Aborted."
fi

# Poll a just-dispatched run of $1 to completion; non-zero exit if it failed.
watch_run() {
  sleep 8
  local id st concl
  id=$(gh run list --workflow="$1" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)
  [ -n "$id" ] || fail "Could not find the run for $1."
  for _ in $(seq 1 90); do
    st=$(gh run view "$id" --json status --jq '.status' 2>/dev/null)
    [ "$st" = "completed" ] && break
    sleep 20
  done
  concl=$(gh run view "$id" --json conclusion --jq '.conclusion' 2>/dev/null)
  echo "  $2: ${concl:-timeout} (https://github.com/digdir/ki.norge.no/actions/runs/$id)"
  [ "$concl" = "success" ]
}

note "1/3 Building image $TAG (docker-publish)…"
gh workflow run docker-publish.yaml --field tag="$TAG" || fail "docker-publish start failed."
watch_run docker-publish.yaml "image build" || fail "Image build failed."

note "2/3 Publishing syncroot ($ENV)…"
gh workflow run publish-syncroot-main.yaml --field environment="$ENV" --field image-tag="$TAG" \
  || fail "syncroot start failed."
watch_run publish-syncroot-main.yaml "syncroot" || fail "Syncroot publish failed."

# Flux fetches the syncroot artifact on an interval (5 min), so the new tag is
# NOT out the moment the publish job is green. Without this check the script
# reported success while the cluster was still running the previous image.
note "3/3 Waiting for image $TAG to actually run…"
if command -v kubectl >/dev/null && kubectl --context "$KCTX" -n "$KNS" get pods --request-timeout=20s >/dev/null 2>&1; then
  ROLLED=0
  for i in $(seq 1 60); do
    running=$(kubectl --context "$KCTX" -n "$KNS" get pods \
      -o jsonpath='{.items[0].spec.containers[?(@.name=="umbraco")].image}' \
      --request-timeout=20s 2>/dev/null | sed 's|.*/||')
    ready=$(kubectl --context "$KCTX" -n "$KNS" get pods \
      -o jsonpath='{.items[0].status.containerStatuses[?(@.name=="umbraco")].ready}' \
      --request-timeout=20s 2>/dev/null)
    echo "  [$i] running image=${running:-?} ready=${ready:-?}"
    if [[ "$running" == "umbraco:$TAG@sha256:"* ]] && [ "$ready" = "true" ]; then ROLLED=1; break; fi
    sleep 15
  done
  [ "$ROLLED" = "1" ] || fail "Image $TAG is still not running in $ENV after ~15 min. Check flux: kubectl --context $KCTX -n $KNS get ocirepository,kustomization"
  note "Image $TAG confirmed running."
else
  echo "  WARNING: cannot reach the cluster (kubectl/VPN), can NOT confirm that image $TAG is actually running."
  echo "  The health check below only says that SOMETHING answers, not that it is the new version."
fi

note "Verifying health…"
for i in $(seq 1 40); do
  fe=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$FE/" 2>/dev/null)
  total=$(curl -s --max-time 15 "$CMS/umbraco/delivery/api/v2/content?filter=contentType:artikkel&take=1" \
    -H "Accept: application/json" 2>/dev/null | grep -oE '"total":[0-9]+' | grep -oE '[0-9]+' | head -1)
  echo "  [$i] frontend=$fe  delivery-api-total=${total:-?}"
  if [ "$fe" = "200" ] && [ -n "$total" ]; then
    # uSync should reconcile the schema with ZERO changes. If it changed anything, the files
    # are out of sync with the database, and at worst the types are re-keyed. See
    # apps/cms-umbraco/uSync/README.md.
    if command -v kubectl >/dev/null && kubectl --context "$KCTX" -n "$KNS" get pods --request-timeout=20s >/dev/null 2>&1; then
      changed=$(kubectl --context "$KCTX" -n "$KNS" logs deploy/umbraco -c umbraco --tail=400 --request-timeout=25s 2>/dev/null \
        | grep -c "uSync-import endret skjema" || true)
      if [ "${changed:-0}" -gt 0 ]; then
        echo "" >&2
        kubectl --context "$KCTX" -n "$KNS" logs deploy/umbraco -c umbraco --tail=400 --request-timeout=25s 2>/dev/null \
          | grep "uSync-import endret skjema" | tail -2 >&2
        fail "The uSync import CHANGED the schema in $ENV. Expected 0 changes. Check whether the files in uSync/v17 come from the right database."
      fi
      note "uSync import: no schema changes."
    fi
    note "OK: $ENV healthy after rollout (image $TAG). Confirm the change itself against the Delivery API, and optionally run: bash scripts/smoke-test.sh"
    exit 0
  fi
  sleep 15
done
fail "Rollout not confirmed healthy before timeout, check $FE and $CMS manually."
