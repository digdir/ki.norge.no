#!/usr/bin/env bash
# Vokter de committede uSync-skjemafilene.
#
# Fanger den ene endringen som kan velte prod: en skjemaeksport tatt fra en ANNEN
# database enn prod. uSync re-noekler ved import, og content-typene har tilfeldige
# GUID-er per database, saa en fremmed eksport gir prod-typene nye noekler og gjoer
# alt blokkinnhold «Unsupported». Se apps/cms-umbraco/uSync/README.md.
#
# Sjekker:
#   1. Ingen EKSISTERENDE type har faatt ny Key (en fremmed eksport endrer alle paa en gang)
#   2. Antall typer har ikke falt (fanger avkuttet eller delvis eksport)
#   3. Hvis .origin finnes, maa den si prod
#
# Bruk: bash scripts/check-usync-schema.sh [base-ref]
#   base-ref  hva som sammenlignes mot, default origin/main
#
# Bevisst re-noekling slippes gjennom med env USYNC_REKEY_APPROVED=true
# (i CI settes den av PR-labelen schema-rekey-approved).

set -uo pipefail

BASE="${1:-origin/main}"
DIR="apps/cms-umbraco/uSync/v17"
FAIL=0

note() { echo "▸ $*"; }
fail() { echo "  FEIL: $*" >&2; FAIL=1; }

git rev-parse --verify -q "$BASE" >/dev/null 2>&1 || { echo "Fant ikke base-ref '$BASE'."; exit 1; }

# Ingen skjemaendringer = ingenting aa sjekke.
if git diff --quiet "$BASE"...HEAD -- "$DIR" 2>/dev/null; then
  note "Ingen endringer i $DIR. Hopper over."
  exit 0
fi

note "Skjemafiler er endret. Kjorer vakt-sjekkene…"

# ---- 1. Noekkelendringer paa eksisterende typer ----------------------------
key_of() { grep -oE 'Key="[^"]+"' <<<"$1" | head -1 | sed 's/Key="//;s/"//'; }

REKEYED=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  # Bare filer som finnes i BEGGE. Nye filer kan ikke re-noekle noe.
  old=$(git show "$BASE:$f" 2>/dev/null) || continue
  new=$(git show "HEAD:$f" 2>/dev/null) || continue
  # tr, ikke ${x,,}: macOS har bash 3.2 der den utvidelsen ikke finnes, og
  # scriptet ville da stille passert i stedet for aa feile.
  ko=$(key_of "$old" | tr 'A-Z' 'a-z'); kn=$(key_of "$new" | tr 'A-Z' 'a-z')
  [ -n "$ko" ] && [ -n "$kn" ] || continue
  if [ "$ko" != "$kn" ]; then
    REKEYED=$((REKEYED+1))
    [ "$REKEYED" -le 8 ] && echo "    $(basename "$f"): $ko -> $kn"
  fi
done < <(git diff --name-only "$BASE"...HEAD -- "$DIR" | grep '\.config$')

if [ "$REKEYED" -gt 0 ]; then
  [ "$REKEYED" -gt 8 ] && echo "    … og $((REKEYED-8)) til"
  if [ "${USYNC_REKEY_APPROVED:-}" = "true" ]; then
    note "$REKEYED typer re-noekles, men det er eksplisitt godkjent."
  else
    fail "$REKEYED eksisterende typer ville faatt NY noekkel."
    {
      echo ""
      echo "  Dette skjer naar skjemafilene er eksportert fra en annen database enn prod."
      echo "  Importeres de i prod, re-noekles typene og ALT blokkinnhold blir «Unsupported»."
      echo "  Eksporten skal alltid tas fra prod. Se apps/cms-umbraco/uSync/README.md."
      echo ""
      echo "  Er re-noeklingen tilsiktet, sett PR-labelen: schema-rekey-approved"
    } >&2
  fi
else
  note "Ingen eksisterende type har endret noekkel."
fi

# ---- 2. Antall typer har ikke falt ----------------------------------------
count_in() { git ls-tree -r --name-only "$1" -- "$DIR/$2" 2>/dev/null | grep -c '\.config$'; }
for sub in ContentTypes DataTypes; do
  before=$(count_in "$BASE" "$sub"); after=$(count_in HEAD "$sub")
  if [ "${after:-0}" -lt "${before:-0}" ]; then
    fail "$sub gikk fra $before til $after filer. Delvis eller avkuttet eksport?"
  else
    note "$sub: $before -> $after filer."
  fi
done

# ---- 3. Opprinnelsesmerket ------------------------------------------------
ORIGIN_FILE="$DIR/.origin"
if git cat-file -e "HEAD:$ORIGIN_FILE" 2>/dev/null; then
  env_name=$(git show "HEAD:$ORIGIN_FILE" | grep -oE '"environment"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
  if [ "$env_name" = "prod" ]; then
    note "Opprinnelse: prod."
  else
    fail "Opprinnelsesmerket sier '$env_name', ikke 'prod'. Eksporten er tatt feil sted."
  fi
else
  note "Ingen .origin-fil enda (skrives ved neste prod-eksport). Hopper over."
fi

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "================ SKJEMAVAKT: AVVIST ================" >&2
  exit 1
fi
echo "================ SKJEMAVAKT: OK ===================="
exit 0
