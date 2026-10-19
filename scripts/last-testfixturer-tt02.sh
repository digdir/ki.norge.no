#!/usr/bin/env bash
# Loads the test fixtures in apps/cms-umbraco/uSync-testinnhold into tt02.
#
# The fixtures are articles that push the schema: all block types at once,
# only required fields, and hostile strings. They live in git precisely because
# loose test nodes in a shared environment rot and get swept away.
#
# The script copies the .config files into the tt02 pod's uSync folder. The
# import itself is done in the backoffice, as for every other uSync import.
#
# Usage:
#   scripts/last-testfixturer-tt02.sh              load the fixtures
#   scripts/last-testfixturer-tt02.sh --sjekk      show what would be copied
#
# Requires kubectl with the Altinn VPN. Never runs against prod, see the guard below.

set -euo pipefail

TT02_CTX="${TT02_CTX:-dis-core-tt02-aks}"
NS="${NS:-product-kinorgeportal}"
POD="${POD:-deploy/umbraco}"
CONTAINER="${CONTAINER:-umbraco}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/apps/cms-umbraco/uSync-testinnhold/v17/Content"

SJEKK=0
for arg in "$@"; do
  case "$arg" in
    --sjekk|--dry-run) SJEKK=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

# The fixtures must never reach prod. Prod cannot import content anyway
# (the Default set is export-only), but we do not rely on that alone.
case "$TT02_CTX" in
  *prod*) echo "Refusing to run against a prod context ($TT02_CTX)." >&2; exit 1 ;;
esac

command -v kubectl >/dev/null || { echo "Could not find kubectl in PATH." >&2; exit 1; }
[ -d "$SRC" ] || { echo "Could not find the fixture folder: $SRC" >&2; exit 1; }

filer=()
while IFS= read -r f; do
  filer+=("$f")
done < <(find "$SRC" -name "*.config" | sort)

[ "${#filer[@]}" -gt 0 ] || { echo "No fixtures to load." >&2; exit 1; }

echo "Target: $TT02_CTX  $NS/$POD:$CONTAINER"
echo "Files:"
for f in "${filer[@]}"; do echo "  $(basename "$f")"; done
echo

if [ "$SJEKK" -eq 1 ]; then echo "Check mode, nothing copied."; exit 0; fi

kubectl --context "$TT02_CTX" -n "$NS" get "$POD" -o name >/dev/null 2>&1 || {
  echo "Cannot reach tt02 ($TT02_CTX, $NS/$POD). Is the Altinn VPN on?" >&2; exit 1; }

kubectl --context "$TT02_CTX" -n "$NS" exec "$POD" -c "$CONTAINER" -- \
  mkdir -p /app/uSync/v17/Content

for f in "${filer[@]}"; do
  kubectl --context "$TT02_CTX" -n "$NS" exec -i "$POD" -c "$CONTAINER" -- \
    sh -c "cat > /app/uSync/v17/Content/$(basename "$f")" < "$f"
  echo "  copied $(basename "$f")"
done

echo
echo "Done. Next step: Import in the tt02 backoffice (Settings -> uSync -> Import, set Speiling, never Clean)."
