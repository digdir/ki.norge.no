#!/usr/bin/env bash
# Smoke test: hit every public frontend URL + critical Delivery API endpoints,
# fail loud on non-2xx or empty body. Run after deploys, optionally in CI.
#
# Usage: bash scripts/smoke-test.sh [--prod | --tt02 | --local]
#   --prod (default): tests https://ki-norge-frontend... and the prod CMS
#   --tt02:            tests ki.test.norge.no + the tt02 CMS, requires the Altinn VPN.
#                      Run this after a mirroring: check_blocks catches content
#                      that has fallen to Unsupported on the way over.
#   --local:           tests http://localhost:4321 + http://localhost:5000

set -uo pipefail

MODE="${1:---prod}"

if [ "$MODE" = "--local" ]; then
  FRONTEND="http://localhost:4321"
  CMS="http://localhost:5000"
elif [ "$MODE" = "--tt02" ]; then
  FRONTEND="https://ki.test.norge.no"
  # No proxy in front of tt02, so this mode only works over the Altinn VPN.
  CMS="https://kinorgeportal.tt02.dis-core.altinn.cloud"
else
  FRONTEND="https://ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev"
  # The proxy host, not dis-core directly: dis-core requires the Altinn VPN and is therefore
  # not reachable from a GitHub runner. The proxy sits in front of the same instance.
  CMS="https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev"
fi

# The Delivery API runs with PublicAccess: true (appsettings.json), so published
# content answers the same with no key, with a key, and with a wrong key.
# Verified against prod, where all three returned byte-identical responses. The
# key here was decoration, and a hardcoded string that looks like a secret
# invites reuse somewhere it is real. This test only covers published content.
#
# If draft content ever needs smoke testing, pass the key through the
# environment instead of writing it in here:
#   SMOKE_API_KEY=... bash scripts/smoke-test.sh
API_KEY="${SMOKE_API_KEY:-}"

# An empty key must not turn into "Api-Key: ", which is an empty but present
# header. The expansion is written ${arr[@]+"${arr[@]}"} rather than
# "${arr[@]}" because bash 3.2, which macOS still ships, treats an empty array
# as unbound under set -u.
api_key_header=()
if [ -n "$API_KEY" ]; then
  api_key_header=(-H "Api-Key: $API_KEY")
fi

PASS=0
FAIL=0
FAILURES=()

check() {
  local label="$1"
  local url="$2"
  local expected_status="${3:-2xx}"
  local min_body="${4:-50}"
  shift $(( $# < 4 ? $# : 4 ))
  # Remaining args are curl options

  local status body_size
  status=$(curl -sS -o /tmp/smoke-body -w "%{http_code}" --max-time 15 "$@" "$url")
  body_size=$(wc -c < /tmp/smoke-body 2>/dev/null || echo 0)

  local status_ok=false
  if [ "$expected_status" = "2xx" ] && [[ "$status" =~ ^2 ]]; then status_ok=true; fi
  if [ "$expected_status" = "$status" ]; then status_ok=true; fi

  if $status_ok && [ "$body_size" -ge "$min_body" ]; then
    echo "  PASS  $label  ($status, ${body_size}B)"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $label  (got $status, ${body_size}B; expected $expected_status, >=${min_body}B)  $url"
    FAIL=$((FAIL+1))
    FAILURES+=("$label: HTTP $status (expected $expected_status)")
  fi
}

# A check that could not run is NOT a passed check. Counts as a failure,
# otherwise an empty test run reads as green.
skip() {
  echo "  SKIP  $1  ($2)"
  FAIL=$((FAIL+1))
  FAILURES+=("$1: skipped ($2)")
}

# Block regression guard. If the content types are re-keyed (e.g. by a uSync import
# with schema files from the wrong database) all block content falls to "Unsupported".
# The Delivery API then still answers 200, and every page still renders, just without
# content. A plain status code check would thus have been green through the whole outage.
# So we count the blocks and require each one to have a contentType.
check_blocks() {
  local label="$1" ct="$2" prop="$3"
  local out
  out=$(curl -sS --max-time 15 ${api_key_header[@]+"${api_key_header[@]}"} \
    "$CMS/umbraco/delivery/api/v2/content?filter=contentType:$ct&take=10" 2>/dev/null \
    | python3 -c "
import sys, json
try:
    items = json.load(sys.stdin).get('items', [])
except Exception:
    print('PARSE_ERROR'); raise SystemExit
total = bad = 0
for it in items:
    for b in (it.get('properties', {}).get('$prop') or {}).get('items', []):
        total += 1
        if not (b.get('content') or {}).get('contentType'):
            bad += 1
print(total, bad)
" 2>/dev/null)

  if [ -z "$out" ] || [ "$out" = "PARSE_ERROR" ]; then
    skip "$label" "could not read the Delivery API"
    return
  fi

  local total bad
  total=$(echo "$out" | cut -d' ' -f1)
  bad=$(echo "$out" | cut -d' ' -f2)

  if [ "$total" -eq 0 ]; then
    echo "  FAIL  $label  (found zero blocks in $ct.$prop)"
    FAIL=$((FAIL+1))
    FAILURES+=("$label: zero blocks, the schema may be re-keyed")
  elif [ "$bad" -gt 0 ]; then
    echo "  FAIL  $label  ($bad of $total blocks lack contentType)"
    FAIL=$((FAIL+1))
    FAILURES+=("$label: $bad of $total blocks are Unsupported")
  else
    echo "  PASS  $label  ($total blocks, all with contentType)"
    PASS=$((PASS+1))
  fi
}

echo "=== Frontend pages ($FRONTEND) ==="
check "Forside"           "$FRONTEND/"
check "Artikler list"     "$FRONTEND/artikler"
check "Eksempler list"    "$FRONTEND/eksempler"
check "Veiledning"        "$FRONTEND/veiledning"
check "Om oss"            "$FRONTEND/om-oss"
check "Sandkasse"         "$FRONTEND/sandkasse"

echo ""
echo "=== Frontend detail pages (sample one of each) ==="
# Find a real article slug from the API and hit its page
SLUG=$(curl -s "$CMS/umbraco/delivery/api/v2/content?filter=contentType:artikkel&take=1" ${api_key_header[@]+"${api_key_header[@]}"} | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('items',[]); print(items[0]['properties'].get('slug','') if items else '')" 2>/dev/null)
if [ -n "$SLUG" ]; then check "Artikkel detail"  "$FRONTEND/artikler/$SLUG"; else skip "Artikkel detail" "found no slug via the Delivery API"; fi

SLUG=$(curl -s "$CMS/umbraco/delivery/api/v2/content?filter=contentType:eksempel&take=1" ${api_key_header[@]+"${api_key_header[@]}"} | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('items',[]); print(items[0]['properties'].get('slug','') if items else '')" 2>/dev/null)
if [ -n "$SLUG" ]; then check "Eksempel detail"  "$FRONTEND/eksempler/$SLUG"; else skip "Eksempel detail" "found no slug via the Delivery API"; fi

echo ""
echo "=== Regression guards ==="
# An unknown kalender slug used to render a made-up event (#636).
# Should redirect to the overview, not answer 200 with content.
check "Unknown kalender slug redirects" "$FRONTEND/kalender/finnes-ikke-smoke-test" "302" "0"

check_blocks "Artikkel blocks have contentType" "artikkel"  "innhold"
check_blocks "Eksempel blocks have contentType" "eksempel"  "innhold"

echo ""
echo "=== Delivery API ($CMS) ==="
check "DeliveryAPI: artikkel"        "$CMS/umbraco/delivery/api/v2/content?filter=contentType:artikkel&take=1"  "2xx" "200" ${api_key_header[@]+"${api_key_header[@]}"}
check "DeliveryAPI: eksempel"        "$CMS/umbraco/delivery/api/v2/content?filter=contentType:eksempel&take=1"  "2xx" "200" ${api_key_header[@]+"${api_key_header[@]}"}
check "DeliveryAPI: omOss"           "$CMS/umbraco/delivery/api/v2/content?filter=contentType:omOss&take=1"      "2xx" "200" ${api_key_header[@]+"${api_key_header[@]}"}
check "DeliveryAPI: forside"         "$CMS/umbraco/delivery/api/v2/content?filter=contentType:forside&take=1"    "2xx" "200" ${api_key_header[@]+"${api_key_header[@]}"}

# Sort sanity — would have caught the publishedAt:desc bug
check "DeliveryAPI: sort=updateDate" "$CMS/umbraco/delivery/api/v2/content?filter=contentType:eksempel&take=1&sort=updateDate:desc" "2xx" "200" ${api_key_header[@]+"${api_key_header[@]}"}

echo ""
echo "=== CMS health ==="
check "CMS root"   "$CMS/umbraco"

echo ""
echo "================================================"
echo "PASS: $PASS    FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "Failures:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  exit 1
fi
exit 0
