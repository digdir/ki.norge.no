#!/usr/bin/env bash
# Speil innhold fra prod til tt02 for KI Norge.
#
# Flytter uSync-innholdseksporten pod-til-pod gjennom din maskin: v17/Content, og
# v17/Media med media-metadataene når den finnes. Skjemafilene følger ikke med.
# Skjemaet ligger i imaget og importeres ved oppstart, og en eldre skjemaeksport
# fra prod kunne rullet tilbake nyere skjema på tt02 og slettet felt.
#
# Bildefilene følger heller ikke med. De ligger i Azure Blob, og det finnes ikke
# noe skript som kopierer dem fra prod til tt02.
#
# Selve Export (prod) og Import (tt02) gjøres i backoffice. Se docs/innholdsspeiling-tt02.md.
#
# Bruk:
#   scripts/sync-prod-til-tt02.sh            kopier innholdet, spør først
#   scripts/sync-prod-til-tt02.sh --sjekk    vis hva som ville blitt kopiert
#   scripts/sync-prod-til-tt02.sh -y         hopp over bekreftelsen
#
# Rekkefølge: Export i prod-backoffice -> dette scriptet -> Import i tt02.
# Krever kubectl med Altinn-VPN, GNU find i podden (Debian-image) og rettigheter til poddene.

set -euo pipefail

PROD_CTX="${PROD_CTX:-dis-core-prod-aks}"
TT02_CTX="${TT02_CTX:-dis-core-tt02-aks}"
NS="${NS:-product-kinorgeportal}"
POD="${POD:-deploy/umbraco}"
CONTAINER="${CONTAINER:-umbraco}"
USYNC_DIR="/app/uSync/v17"

usage() {
  cat >&2 <<EOF
Bruk: $0 [--sjekk] [-y]

  --sjekk   vis hva som ville blitt kopiert, kopier ingenting
  -y        hopp over bekreftelsen

Kopierer v17/Content, og v17/Media når den finnes, fra prod til tt02.
Rekkefølge: Export i prod-backoffice -> dette scriptet -> Import i tt02-backoffice.
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

command -v kubectl >/dev/null || { echo "Fant ikke kubectl i PATH." >&2; exit 1; }

kprod() { kubectl --context "$PROD_CTX" -n "$NS" "$@"; }
ktt02() { kubectl --context "$TT02_CTX" -n "$NS" "$@"; }

# Sjekk at begge poddene er nåbare (krever Altinn-VPN).
for pair in "PROD:$PROD_CTX" "TT02:$TT02_CTX"; do
  navn="${pair%%:*}"; ctx="${pair#*:}"
  if ! kubectl --context "$ctx" -n "$NS" get "$POD" -o name >/dev/null 2>&1; then
    echo "Når ikke $navn ($ctx, $NS/$POD). Er Altinn-VPN på og konteksten riktig?" >&2
    exit 1
  fi
done

# Innholdsmappa er varig siden #674, i begge miljøene, så den kan inneholde en
# gammel eksport. Media-metadataene ligger på containerens skrivelag og forsvinner
# ved restart. Tidspunktet for nyeste fil viser om Export er kjørt nylig.
if ! kprod exec "$POD" -c "$CONTAINER" -- test -d "$USYNC_DIR/Content" 2>/dev/null; then
  echo "Fant ingen innholdseksport på prod ($USYNC_DIR/Content mangler)." >&2
  echo "Kjør Export i prod-backoffice (Settings -> uSync -> Export) først, så dette scriptet." >&2
  exit 1
fi

MAPPER="Content"
if kprod exec "$POD" -c "$CONTAINER" -- test -d "$USYNC_DIR/Media" 2>/dev/null; then
  MAPPER="Content Media"
fi

echo "Kilde:  $PROD_CTX  $NS/$POD:$CONTAINER"
echo "Mål:    $TT02_CTX  $NS/$POD:$CONTAINER"
for mappe in $MAPPER; do
  antall=$(kprod exec "$POD" -c "$CONTAINER" -- sh -c "find $USYNC_DIR/$mappe -type f | wc -l" | tr -d ' ')
  nyeste=$(kprod exec "$POD" -c "$CONTAINER" -- sh -c "find $USYNC_DIR/$mappe -type f -printf '%TY-%Tm-%Td %TH:%TM\n' | sort | tail -1")
  echo "  $mappe: $antall filer, nyeste ${nyeste:-ingen}"
done
[ "$MAPPER" = "Content" ] && echo "  Media: ingen media-metadata på prod. Kjør Export på nytt hvis innholdet viser til bilder."
echo

if [ "$SJEKK" -eq 1 ]; then
  echo "Sjekk-modus, ingenting kopieres."
  exit 0
fi

echo "NB: forutsetter at du har kjørt Export i prod-backoffice. Husk Import i tt02 etterpå."
if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Fortsette? Dette overskriver tilsvarende filer på tt02. [j/N] " svar
  case "$svar" in j|J|y|Y) ;; *) echo "Avbrutt."; exit 0 ;; esac
fi

echo "Kopierer $MAPPER..."
# --no-overwrite-dir: Content er et montert volum på tt02, og tar skal ikke prøve
# å endre eier eller tider på selve mappa.
# shellcheck disable=SC2086
kprod exec "$POD" -c "$CONTAINER" -- tar czf - -C "$USYNC_DIR" $MAPPER \
  | ktt02 exec -i "$POD" -c "$CONTAINER" -- tar xzf - --no-overwrite-dir -C "$USYNC_DIR"

echo "Ferdig."
echo "Neste steg: kjør Import i tt02-backoffice (Settings -> uSync -> Import, aldri clean)."
