#!/usr/bin/env bash
# Speil innhold (og eventuelt media) fra prod til tt02 for KI Norge.
#
# Flytter uSync-eksportfiler og/eller media-binærfiler mellom dis-core-poddene.
# Selve uSync Export (prod) og Import (tt02) gjøres manuelt i backoffice. Dette
# scriptet er kun transport-steget mellom miljøene, og kopierer pod-til-pod
# gjennom din maskin.
#
# Bruk:
#   scripts/sync-prod-til-tt02.sh innhold   kun uSync-innhold (dokumenter + media-metadata), ingen bildefiler
#   scripts/sync-prod-til-tt02.sh media     kun bildefiler (media-binærfiler), ingen innhold
#   scripts/sync-prod-til-tt02.sh alt       innhold + bildefiler
#   scripts/sync-prod-til-tt02.sh alt -y    hopp over bekreftelsen
#
# Rekkefølge for innhold/alt:
#   1. Kjør Export i PROD-backoffice (Settings -> uSync -> Export)
#   2. Kjør dette scriptet
#   3. Kjør Import i TT02-backoffice (Settings -> uSync -> Import, aldri clean)
#
# Krever kubectl med Altinn-VPN, kontekstene under og rettigheter til poddene.

set -euo pipefail

PROD_CTX="${PROD_CTX:-dis-core-prod-aks}"
TT02_CTX="${TT02_CTX:-dis-core-tt02-aks}"
NS="${NS:-product-kinorgeportal}"
POD="${POD:-deploy/umbraco}"
CONTAINER="${CONTAINER:-umbraco}"

# Stier relativt til /app i podden.
USYNC_PATH="uSync"
MEDIA_PATH="wwwroot/media"

usage() {
  cat >&2 <<EOF
Bruk: $0 <innhold|media|alt> [-y]

  innhold   kun uSync-innhold (dokumenter + media-metadata), ingen bildefiler
  media     kun bildefiler (media-binærfiler), ingen innhold
  alt       innhold + bildefiler

  -y        hopp over bekreftelsen

Rekkefølge for innhold/alt: Export i prod-backoffice -> dette scriptet -> Import i tt02-backoffice.
EOF
  exit 1
}

MODE=""
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    innhold|media|alt) MODE="$arg" ;;
    -y|--yes)          ASSUME_YES=1 ;;
    *)                 usage ;;
  esac
done
[ -n "$MODE" ] || usage

case "$MODE" in
  innhold) PATHS=("$USYNC_PATH") ;;
  media)   PATHS=("$MEDIA_PATH") ;;
  alt)     PATHS=("$USYNC_PATH" "$MEDIA_PATH") ;;
esac

command -v kubectl >/dev/null || { echo "Fant ikke kubectl i PATH." >&2; exit 1; }

# Sjekk at begge poddene er nåbare (krever Altinn-VPN).
for pair in "PROD:$PROD_CTX" "TT02:$TT02_CTX"; do
  navn="${pair%%:*}"; ctx="${pair#*:}"
  if ! kubectl --context "$ctx" -n "$NS" get "$POD" -o name >/dev/null 2>&1; then
    echo "Når ikke $navn ($ctx, $NS/$POD). Er Altinn-VPN på og konteksten riktig?" >&2
    exit 1
  fi
done

echo "Modus:  $MODE"
echo "Kilde:  $PROD_CTX  $NS/$POD:$CONTAINER  /app/{${PATHS[*]}}"
echo "Mål:    $TT02_CTX  $NS/$POD:$CONTAINER  /app/"
echo
case "$MODE" in
  innhold|alt) echo "NB: forutsetter at du har kjørt Export i prod-backoffice. Husk Import i tt02 etterpå." ;;
  media)       echo "NB: kopierer kun bildefiler. Media-NODER kommer via uSync-innhold (innhold/alt)." ;;
esac
echo

if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Fortsette? Dette overskriver tilsvarende filer på tt02. [j/N] " svar
  case "$svar" in
    j|J|y|Y) ;;
    *) echo "Avbrutt."; exit 0 ;;
  esac
fi

echo "Overfører (kan ta tid for media)..."
kubectl --context "$PROD_CTX" -n "$NS" exec "$POD" -c "$CONTAINER" -- \
    tar czf - -C /app "${PATHS[@]}" \
  | kubectl --context "$TT02_CTX" -n "$NS" exec -i "$POD" -c "$CONTAINER" -- \
    tar xzf - -C /app

echo "Ferdig."
case "$MODE" in
  innhold|alt) echo "Neste steg: kjør Import i tt02-backoffice (Settings -> uSync -> Import, aldri clean)." ;;
  media)       echo "Bildefilene ligger nå på tt02." ;;
esac
