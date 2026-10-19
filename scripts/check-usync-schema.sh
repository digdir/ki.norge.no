#!/usr/bin/env bash
# Guards the committed uSync schema files.
#
# Catches the one change that can bring down prod: a schema export taken from a DIFFERENT
# database than prod. uSync re-keys on import, and the content types have random
# GUIDs per database, so a foreign export gives the prod types new keys and makes
# all block content "Unsupported". See apps/cms-umbraco/uSync/README.md.
#
# Checks:
#   1. No EXISTING type has got a new Key (a foreign export changes all of them at once)
#   2. The number of types has not dropped (catches a truncated or partial export)
#   3. If .origin exists, it must say prod
#
# Usage: bash scripts/check-usync-schema.sh [base-ref]
#   base-ref  what to compare against, default origin/main
#
# Deliberate re-keying is let through with env USYNC_REKEY_APPROVED=true
# (in CI it is set by the PR label schema-rekey-approved).

set -uo pipefail

BASE="${1:-origin/main}"
DIR="apps/cms-umbraco/uSync/v17"
FAIL=0

note() { echo "▸ $*"; }
fail() { echo "  ERROR: $*" >&2; FAIL=1; }

git rev-parse --verify -q "$BASE" >/dev/null 2>&1 || { echo "Could not find base-ref '$BASE'."; exit 1; }

# No schema changes = nothing to check.
if git diff --quiet "$BASE"...HEAD -- "$DIR" 2>/dev/null; then
  note "No changes in $DIR. Skipping."
  exit 0
fi

note "Schema files have changed. Running the guard checks…"

# ---- 1. Key changes on existing types ----------------------------------
key_of() { grep -oE 'Key="[^"]+"' <<<"$1" | head -1 | sed 's/Key="//;s/"//'; }

REKEYED=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  # Only files that exist in BOTH. New files cannot re-key anything.
  old=$(git show "$BASE:$f" 2>/dev/null) || continue
  new=$(git show "HEAD:$f" 2>/dev/null) || continue
  # tr, not ${x,,}: macOS has bash 3.2 where that expansion does not exist, and
  # the script would then silently pass instead of failing.
  ko=$(key_of "$old" | tr 'A-Z' 'a-z'); kn=$(key_of "$new" | tr 'A-Z' 'a-z')
  [ -n "$ko" ] && [ -n "$kn" ] || continue
  if [ "$ko" != "$kn" ]; then
    REKEYED=$((REKEYED+1))
    [ "$REKEYED" -le 8 ] && echo "    $(basename "$f"): $ko -> $kn"
  fi
done < <(git diff --name-only "$BASE"...HEAD -- "$DIR" | grep '\.config$')

if [ "$REKEYED" -gt 0 ]; then
  [ "$REKEYED" -gt 8 ] && echo "    … and $((REKEYED-8)) more"
  if [ "${USYNC_REKEY_APPROVED:-}" = "true" ]; then
    note "$REKEYED types are re-keyed, but that is explicitly approved."
  else
    fail "$REKEYED existing types would get a NEW key."
    {
      echo ""
      echo "  This happens when the schema files are exported from a different database than prod."
      echo "  If they are imported in prod, the types are re-keyed and ALL block content becomes \"Unsupported\"."
      echo "  The export must always be taken from prod. See apps/cms-umbraco/uSync/README.md."
      echo ""
      echo "  If the re-keying is intended, set the PR label: schema-rekey-approved"
    } >&2
  fi
else
  note "No existing type has changed key."
fi

# ---- 2. The number of types has not dropped ------------------------------
count_in() { git ls-tree -r --name-only "$1" -- "$DIR/$2" 2>/dev/null | grep -c '\.config$'; }
for sub in ContentTypes DataTypes; do
  before=$(count_in "$BASE" "$sub"); after=$(count_in HEAD "$sub")
  if [ "${after:-0}" -lt "${before:-0}" ]; then
    fail "$sub went from $before to $after files. Partial or truncated export?"
  else
    note "$sub: $before -> $after files."
  fi
done

# ---- 3. The origin marker --------------------------------------------------
ORIGIN_FILE="$DIR/.origin"
if git cat-file -e "HEAD:$ORIGIN_FILE" 2>/dev/null; then
  env_name=$(git show "HEAD:$ORIGIN_FILE" | grep -oE '"environment"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/')
  if [ "$env_name" = "prod" ]; then
    note "Origin: prod."
  else
    fail "The origin marker says '$env_name', not 'prod'. The export was taken from the wrong place."
  fi
else
  note "No .origin file yet (written at the next prod export). Skipping."
fi

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo "================ SCHEMA GUARD: REJECTED ============" >&2
  exit 1
fi
echo "================ SCHEMA GUARD: OK =================="
exit 0
