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
  *) echo "Bruk: bash scripts/deploy-cms.sh <tt02|prod> [image-tag]"; exit 1 ;;
esac
KNS="product-kinorgeportal"
fail() { echo "FEIL: $*" >&2; exit 1; }
note() { echo "▸ $*"; }

command -v gh >/dev/null || fail "gh (GitHub CLI) mangler."
[ -z "$(git status --porcelain)" ] || fail "Arbeidstreet er ikke rent. Commit/stash først."
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "HEAD != origin/main. Deployet bygger fra main — synk først."

if [ -z "$TAG" ]; then
  LAST=$(gh run list --workflow=publish-syncroot-main.yaml --limit 20 --json displayTitle --jq '.[].displayTitle' 2>/dev/null \
    | grep -oE 'Deploy [0-9]+' | grep -oE '[0-9]+' | sort -n | tail -1)
  TAG=$(( ${LAST:-0} + 1 ))
  note "Auto-tag: forrige = ${LAST:-ingen} -> ny image-tag = $TAG"
fi
[[ "$TAG" =~ ^[0-9]+$ ]] || fail "image-tag maa vaere et heltall (fikk '$TAG')."

echo "Deployer CMS-image $TAG til $ENV (database=AzureSQL) fra main $(git rev-parse --short HEAD)."
if [ "$ENV" = "prod" ]; then
  read -r -p "Dette er PROD (live). Skriv 'prod' for aa fortsette: " c
  [ "$c" = "prod" ] || fail "Avbrutt."
fi

# Poll a just-dispatched run of $1 to completion; non-zero exit if it failed.
watch_run() {
  sleep 8
  local id st concl
  id=$(gh run list --workflow="$1" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)
  [ -n "$id" ] || fail "Fant ikke kjoringen for $1."
  for _ in $(seq 1 90); do
    st=$(gh run view "$id" --json status --jq '.status' 2>/dev/null)
    [ "$st" = "completed" ] && break
    sleep 20
  done
  concl=$(gh run view "$id" --json conclusion --jq '.conclusion' 2>/dev/null)
  echo "  $2: ${concl:-timeout} (https://github.com/digdir/ki.norge.no/actions/runs/$id)"
  [ "$concl" = "success" ]
}

note "1/3 Bygger image $TAG (docker-publish)…"
gh workflow run docker-publish.yaml --field tag="$TAG" || fail "docker-publish start feilet."
watch_run docker-publish.yaml "image-bygg" || fail "Image-bygg feilet."

note "2/3 Publiserer syncroot ($ENV)…"
gh workflow run publish-syncroot-main.yaml --field environment="$ENV" --field image-tag="$TAG" --field database=AzureSQL \
  || fail "syncroot start feilet."
watch_run publish-syncroot-main.yaml "syncroot" || fail "Syncroot-publisering feilet."

# Flux henter syncroot-artefakten paa intervall (5 min), saa den nye taggen er
# IKKE ute i det oyeblikket publish-jobben er gronn. Uten dette sjekket rapporterte
# scriptet suksess mens klyngen fortsatt kjorte forrige image.
note "3/3 Venter paa at image $TAG faktisk kjorer…"
if command -v kubectl >/dev/null && kubectl --context "$KCTX" -n "$KNS" get pods --request-timeout=20s >/dev/null 2>&1; then
  ROLLED=0
  for i in $(seq 1 60); do
    running=$(kubectl --context "$KCTX" -n "$KNS" get pods \
      -o jsonpath='{.items[0].spec.containers[?(@.name=="umbraco")].image}' \
      --request-timeout=20s 2>/dev/null | sed 's/.*://')
    ready=$(kubectl --context "$KCTX" -n "$KNS" get pods \
      -o jsonpath='{.items[0].status.containerStatuses[?(@.name=="umbraco")].ready}' \
      --request-timeout=20s 2>/dev/null)
    echo "  [$i] kjorende image=${running:-?} ready=${ready:-?}"
    if [ "$running" = "$TAG" ] && [ "$ready" = "true" ]; then ROLLED=1; break; fi
    sleep 15
  done
  [ "$ROLLED" = "1" ] || fail "Image $TAG kjorer fortsatt ikke i $ENV etter ~15 min. Sjekk flux: kubectl --context $KCTX -n $KNS get ocirepository,kustomization"
  note "Image $TAG bekreftet kjorende."
else
  echo "  ADVARSEL: naar ikke klyngen (kubectl/VPN), kan IKKE bekrefte at image $TAG faktisk kjorer."
  echo "  Helsesjekken under sier bare at NOE svarer, ikke at det er den nye versjonen."
fi

note "Verifiserer helse…"
for i in $(seq 1 40); do
  fe=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$FE/" 2>/dev/null)
  total=$(curl -s --max-time 15 "$CMS/umbraco/delivery/api/v2/content?filter=contentType:artikkel&take=1" \
    -H "Accept: application/json" 2>/dev/null | grep -oE '"total":[0-9]+' | grep -oE '[0-9]+' | head -1)
  echo "  [$i] frontend=$fe  delivery-api-total=${total:-?}"
  if [ "$fe" = "200" ] && [ -n "$total" ]; then
    # uSync skal reconcilere skjemaet til NULL endringer. Endret den noe, er filene
    # ute av sync med databasen, og i verste fall er typene re-noeklet. Se
    # apps/cms-umbraco/uSync/README.md.
    if command -v kubectl >/dev/null && kubectl --context "$KCTX" -n "$KNS" get pods --request-timeout=20s >/dev/null 2>&1; then
      changed=$(kubectl --context "$KCTX" -n "$KNS" logs deploy/umbraco -c umbraco --tail=400 --request-timeout=25s 2>/dev/null \
        | grep -c "uSync-import endret skjema" || true)
      if [ "${changed:-0}" -gt 0 ]; then
        echo "" >&2
        kubectl --context "$KCTX" -n "$KNS" logs deploy/umbraco -c umbraco --tail=400 --request-timeout=25s 2>/dev/null \
          | grep "uSync-import endret skjema" | tail -2 >&2
        fail "uSync-importen ENDRET skjemaet i $ENV. Forventet 0 endringer. Sjekk om filene i uSync/v17 kommer fra riktig database."
      fi
      note "uSync-import: ingen skjemaendringer."
    fi
    note "OK: $ENV frisk etter rollout (image $TAG). Bekreft selve endringen mot Delivery API, og kjor evt: bash scripts/smoke-test.sh"
    exit 0
  fi
  sleep 15
done
fail "Rollout ikke bekreftet frisk innen tidsavbrudd — sjekk $FE og $CMS manuelt."
