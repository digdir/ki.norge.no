#!/usr/bin/env bash
# Speil innhold (og eventuelt media) fra prod til tt02 for KI Norge.
#
# Flytter uSync-eksportfiler og/eller media-binærfiler pod-til-pod gjennom din
# maskin. Selve uSync Export (prod) og Import (tt02) gjøres manuelt i backoffice.
#
# Media overføres inkrementelt: scriptet sammenligner filstier på prod og tt02
# og kopierer bare det som mangler på tt02. Det er trygt fordi Umbraco lagrer
# media under unike nøkkel-mapper (nytt/erstattet bilde = ny sti, ingen endring
# på stedet). Bruk --full for å kopiere alt på nytt.
#
# Bruk:
#   scripts/sync-prod-til-tt02.sh innhold        kun uSync-innhold, ingen bildefiler
#   scripts/sync-prod-til-tt02.sh media          kun nye bildefiler (inkrementelt)
#   scripts/sync-prod-til-tt02.sh alt            innhold + nye bildefiler
#   scripts/sync-prod-til-tt02.sh media --sjekk  vis hva som mangler, overfør ingenting
#   scripts/sync-prod-til-tt02.sh media --full   kopier ALL media (overskriv)
#   scripts/sync-prod-til-tt02.sh alt -y         hopp over bekreftelsen
#
# Rekkefølge for innhold/alt: Export i prod-backoffice -> dette scriptet -> Import i tt02.
# Krever kubectl med Altinn-VPN, GNU find i podden (Debian-image) og rettigheter til poddene.

set -euo pipefail

PROD_CTX="${PROD_CTX:-dis-core-prod-aks}"
TT02_CTX="${TT02_CTX:-dis-core-tt02-aks}"
NS="${NS:-product-kinorgeportal}"
POD="${POD:-deploy/umbraco}"
CONTAINER="${CONTAINER:-umbraco}"

usage() {
  cat >&2 <<EOF
Bruk: $0 <innhold|media|alt> [--sjekk] [--full] [-y]

  innhold   kun uSync-innhold (dokumenter + media-metadata), ingen bildefiler
  media     kun bildefiler, inkrementelt (bare det som mangler på tt02)
  alt       innhold + nye bildefiler

  --sjekk   vis hva som ville blitt overført, overfør ingenting
  --full    kopier ALL media på nytt (overskriv), ikke bare det som mangler
  -y        hopp over bekreftelsen

Rekkefølge for innhold/alt: Export i prod-backoffice -> dette scriptet -> Import i tt02-backoffice.
EOF
  exit 1
}

MODE=""; ASSUME_YES=0; FULL=0; SJEKK=0
for arg in "$@"; do
  case "$arg" in
    innhold|media|alt)  MODE="$arg" ;;
    --sjekk|--dry-run)  SJEKK=1 ;;
    --full)             FULL=1 ;;
    -y|--yes)           ASSUME_YES=1 ;;
    *)                  usage ;;
  esac
done
[ -n "$MODE" ] || usage

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

do_usync=0; do_media=0
case "$MODE" in
  innhold) do_usync=1 ;;
  media)   do_media=1 ;;
  alt)     do_usync=1; do_media=1 ;;
esac

MISSING_FILE=""
miss_count=0
hsize="0 B"
trap '[ -n "$MISSING_FILE" ] && rm -f "$MISSING_FILE"' EXIT

echo "Modus:  $MODE"
echo "Kilde:  $PROD_CTX  $NS/$POD:$CONTAINER"
echo "Mål:    $TT02_CTX  $NS/$POD:$CONTAINER"
echo

# Inkrementell media: finn filer som mangler på tt02.
if [ "$do_media" -eq 1 ] && [ "$FULL" -eq 0 ]; then
  echo "Sammenligner media mellom prod og tt02..."
  prodf=$(mktemp); tt02f=$(mktemp); MISSING_FILE=$(mktemp)
  kprod exec "$POD" -c "$CONTAINER" -- sh -c 'cd /app/wwwroot && find media -type f -printf "%s\t%p\n"' > "$prodf"
  ktt02 exec "$POD" -c "$CONTAINER" -- sh -c 'cd /app/wwwroot && find media -type f' > "$tt02f"
  bytes=$(awk -F'\t' -v mf="$MISSING_FILE" 'NR==FNR{seen[$0]=1; next} !($2 in seen){print $2 > mf; b+=$1} END{printf "%d", b+0}' "$tt02f" "$prodf")
  prod_count=$(grep -c . "$prodf" || true)
  tt02_count=$(grep -c . "$tt02f" || true)
  miss_count=$(grep -c . "$MISSING_FILE" || true)
  hsize=$(awk -v b="$bytes" 'BEGIN{u="B"; s=b; n=split("KB MB GB TB",U," "); for(i=1;i<=n && s>=1024;i++){s/=1024; u=U[i]} printf "%.1f %s", s, u}')
  rm -f "$prodf" "$tt02f"
  echo "  prod: $prod_count filer   tt02: $tt02_count filer"
  echo "  mangler på tt02: $miss_count filer ($hsize)"
  echo
fi

if [ "$SJEKK" -eq 1 ]; then
  echo "Sjekk-modus, ingenting overføres. Plan:"
  [ "$do_usync" -eq 1 ] && echo "  - uSync-innhold: full kopi"
  if [ "$do_media" -eq 1 ]; then
    if [ "$FULL" -eq 1 ]; then echo "  - media: FULL kopi (overskriver alt på tt02)"
    else echo "  - media: $miss_count nye filer ($hsize)"; fi
  fi
  exit 0
fi

case "$MODE" in
  innhold|alt) echo "NB: forutsetter at du har kjørt Export i prod-backoffice. Husk Import i tt02 etterpå." ;;
esac

if [ "$ASSUME_YES" -ne 1 ]; then
  read -r -p "Fortsette? Dette overskriver tilsvarende filer på tt02. [j/N] " svar
  case "$svar" in j|J|y|Y) ;; *) echo "Avbrutt."; exit 0 ;; esac
fi

if [ "$do_usync" -eq 1 ]; then
  echo "Overfører uSync-innhold..."
  kprod exec "$POD" -c "$CONTAINER" -- tar czf - -C /app uSync \
    | ktt02 exec -i "$POD" -c "$CONTAINER" -- tar xzf - -C /app
fi

if [ "$do_media" -eq 1 ]; then
  if [ "$FULL" -eq 1 ]; then
    echo "Overfører ALL media (full kopi)..."
    kprod exec "$POD" -c "$CONTAINER" -- tar czf - -C /app/wwwroot media \
      | ktt02 exec -i "$POD" -c "$CONTAINER" -- tar xzf - -C /app/wwwroot
  elif [ "$miss_count" -gt 0 ]; then
    echo "Overfører $miss_count nye media-filer ($hsize)..."
    tr '\n' '\0' < "$MISSING_FILE" \
      | kprod exec -i "$POD" -c "$CONTAINER" -- tar czf - -C /app/wwwroot --null -T - \
      | ktt02 exec -i "$POD" -c "$CONTAINER" -- tar xzf - -C /app/wwwroot
  else
    echo "Media: ingen nye filer, hopper over."
  fi
fi

echo "Ferdig."
case "$MODE" in
  innhold|alt) echo "Neste steg: kjør Import i tt02-backoffice (Settings -> uSync -> Import, aldri clean)." ;;
  media)       echo "Bildefilene ligger nå på tt02." ;;
esac
