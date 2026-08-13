#!/usr/bin/env bash
# Laster testfixturene i apps/cms-umbraco/uSync-testinnhold inn i tt02.
#
# Fixturene er artikler som presser skjemaet: alle blokktyper på én gang,
# bare påkrevde felt, fiendtlige strenger, og brutte referanser. De ligger i
# git nettopp fordi løse testnoder i et delt miljø råtner og blir feid vekk.
#
# Scriptet kopierer .config-filene inn i tt02-poddens uSync-mappe. Selve
# importen gjøres i backoffice, som for all annen uSync-import.
#
# Bruk:
#   scripts/last-testfixturer-tt02.sh              alle fixturer utenom brutte referanser
#   scripts/last-testfixturer-tt02.sh --alle       ogsaa brutte referanser
#   scripts/last-testfixturer-tt02.sh --sjekk      vis hva som ville blitt kopiert
#
# Krever kubectl med Altinn-VPN. Kjoerer aldri mot prod, se vakten under.

set -euo pipefail

TT02_CTX="${TT02_CTX:-dis-core-tt02-aks}"
NS="${NS:-product-kinorgeportal}"
POD="${POD:-deploy/umbraco}"
CONTAINER="${CONTAINER:-umbraco}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/apps/cms-umbraco/uSync-testinnhold/v17/Content"
BRUTTE="testfixtur-brutte-referanser.config"

ALLE=0; SJEKK=0
for arg in "$@"; do
  case "$arg" in
    --alle)            ALLE=1 ;;
    --sjekk|--dry-run) SJEKK=1 ;;
    *) echo "Ukjent flagg: $arg" >&2; exit 1 ;;
  esac
done

# Fixturene skal aldri naa prod. Prod kan uansett ikke importere innhold
# (Default-settet er eksport-only), men vi stoler ikke paa det alene.
case "$TT02_CTX" in
  *prod*) echo "Nekter aa kjoere mot en prod-kontekst ($TT02_CTX)." >&2; exit 1 ;;
esac

command -v kubectl >/dev/null || { echo "Fant ikke kubectl i PATH." >&2; exit 1; }
[ -d "$SRC" ] || { echo "Fant ikke fixturmappa: $SRC" >&2; exit 1; }

filer=()
while IFS= read -r f; do
  navn="$(basename "$f")"
  if [ "$navn" = "$BRUTTE" ] && [ "$ALLE" -eq 0 ]; then continue; fi
  filer+=("$f")
done < <(find "$SRC" -name "*.config" | sort)

[ "${#filer[@]}" -gt 0 ] || { echo "Ingen fixturer aa laste." >&2; exit 1; }

echo "Maal:  $TT02_CTX  $NS/$POD:$CONTAINER"
echo "Filer:"
for f in "${filer[@]}"; do echo "  $(basename "$f")"; done
if [ "$ALLE" -eq 0 ]; then
  echo "  (hopper over $BRUTTE, bruk --alle for aa ta den med)"
fi
echo

if [ "$SJEKK" -eq 1 ]; then echo "Sjekk-modus, ingenting kopiert."; exit 0; fi

kubectl --context "$TT02_CTX" -n "$NS" get "$POD" -o name >/dev/null 2>&1 || {
  echo "Naar ikke tt02 ($TT02_CTX, $NS/$POD). Er Altinn-VPN paa?" >&2; exit 1; }

kubectl --context "$TT02_CTX" -n "$NS" exec "$POD" -c "$CONTAINER" -- \
  mkdir -p /app/uSync/v17/Content

for f in "${filer[@]}"; do
  kubectl --context "$TT02_CTX" -n "$NS" exec -i "$POD" -c "$CONTAINER" -- \
    sh -c "cat > /app/uSync/v17/Content/$(basename "$f")" < "$f"
  echo "  kopiert $(basename "$f")"
done

echo
echo "Ferdig. Neste steg: Import i tt02-backoffice (Settings -> uSync -> Import, sett Speiling, aldri Clean)."
