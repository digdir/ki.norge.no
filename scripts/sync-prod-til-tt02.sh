#!/usr/bin/env bash
# Mirror content from prod to tt02 for KI Norge.
#
# Moves the uSync content export pod to pod through your machine: v17/Content, and
# v17/Media with the media metadata when it exists. The schema files are not included.
# The schema lives in the image and is imported at startup, and an older schema export
# from prod could have rolled back a newer schema on tt02 and deleted fields.
#
# The image files are not included either. They live in Azure Blob, and there is no
# script that copies them from prod to tt02.
#
# The Export (prod) and Import (tt02) themselves are done in the backoffice. See docs/content-mirroring-tt02.md.
#
# Usage:
#   scripts/sync-prod-til-tt02.sh            copy the content, ask first
#   scripts/sync-prod-til-tt02.sh --sjekk    show what would be copied
#   scripts/sync-prod-til-tt02.sh -y         skip the confirmation
#
# Order: Export in the prod backoffice -> this script -> Import in tt02.
# Requires kubectl with the Altinn VPN, GNU find in the pod (Debian image) and permissions on the pods.

set -euo pipefail

PROD_CTX="${PROD_CTX:-dis-core-prod-aks}"
TT02_CTX="${TT02_CTX:-dis-core-tt02-aks}"
NS="${NS:-product-kinorgeportal}"
POD="${POD:-deploy/umbraco}"
CONTAINER="${CONTAINER:-umbraco}"
USYNC_DIR="/app/uSync/v17"

usage() {
  cat >&2 <<EOF
Usage: $0 [--sjekk] [-y]

  --sjekk   show what would be copied, copy nothing
  -y        skip the confirmation

Copies v17/Content, and v17/Media when it exists, from prod to tt02.
Order: Export in the prod backoffice -> this script -> Import in the tt02 backoffice.
EOF
  exit 1
}

ASSUME_YES=0; SJEKK=0
for arg in "$@"; do
  case "$arg" in
    --sjekk|--dry-run)  SJEKK=1 ;;
    -y|--yes)           ASSUME_YES=1 ;;
    *)                  usage ;;
  esac
done

command -v kubectl >/dev/null || { echo "Could not find kubectl in PATH." >&2; exit 1; }

kprod() { kubectl --context "$PROD_CTX" -n "$NS" "$@"; }
ktt02() { kubectl --context "$TT02_CTX" -n "$NS" "$@"; }

# Check that both pods are reachable (requires the Altinn VPN).
for pair in "PROD:$PROD_CTX" "TT02:$TT02_CTX"; do
  navn="${pair%%:*}"; ctx="${pair#*:}"
  if ! kubectl --context "$ctx" -n "$NS" get "$POD" -o name >/dev/null 2>&1; then
    echo "Cannot reach $navn ($ctx, $NS/$POD). Is the Altinn VPN on and the context right?" >&2
    exit 1
  fi
done

# The content folder has been persistent since #674, in both environments, so it can contain an
# old export. The media metadata lives on the container's write layer and disappears
# on restart. The time of the newest file shows whether Export has been run recently.
if ! kprod exec "$POD" -c "$CONTAINER" -- test -d "$USYNC_DIR/Content" 2>/dev/null; then
  echo "Found no content export on prod ($USYNC_DIR/Content is missing)." >&2
  echo "Run Export in the prod backoffice (Settings -> uSync -> Export) first, then this script." >&2
  exit 1
fi

MAPPER="Content"
if kprod exec "$POD" -c "$CONTAINER" -- test -d "$USYNC_DIR/Media" 2>/dev/null; then
  MAPPER="Content Media"
fi

echo "Source: $PROD_CTX  $NS/$POD:$CONTAINER"
echo "Target: $TT02_CTX  $NS/$POD:$CONTAINER"
for mappe in $MAPPER; do
  antall=$(kprod exec "$POD" -c "$CONTAINER" -- sh -c "find $USYNC_DIR/$mappe -type f | wc -l" | tr -d ' ')
  nyeste=$(kprod exec "$POD" -c "$CONTAINER" -- sh -c "find $USYNC_DIR/$mappe -type f -printf '%TY-%Tm-%Td %TH:%TM\n' | sort | tail -1")
  echo "  $mappe: $antall files, newest ${nyeste:-none}"
done
[ "$MAPPER" = "Content" ] && echo "  Media: no media metadata on prod. Run Export again if the content refers to images."
echo

if [ "$SJEKK" -eq 1 ]; then
  echo "Check mode, nothing is copied."
  exit 0
fi

echo "NB: assumes you have run Export in the prod backoffice. Remember Import in tt02 afterwards."
if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Continue? This overwrites the corresponding files on tt02. [y/N] " svar
  case "$svar" in j|J|y|Y) ;; *) echo "Aborted."; exit 0 ;; esac
fi

echo "Copying $MAPPER..."
# --no-overwrite-dir: Content is a mounted volume on tt02, and tar must not try
# to change the owner or times of the folder itself.
# shellcheck disable=SC2086
kprod exec "$POD" -c "$CONTAINER" -- tar czf - -C "$USYNC_DIR" $MAPPER \
  | ktt02 exec -i "$POD" -c "$CONTAINER" -- tar xzf - --no-overwrite-dir -C "$USYNC_DIR"

echo "Done."
echo "Next step: run Import in the tt02 backoffice (Settings -> uSync -> Import, never clean)."
