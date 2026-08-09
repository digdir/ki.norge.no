#!/usr/bin/env bash
# Smoke test: hit every public frontend URL + critical Delivery API endpoints,
# fail loud on non-2xx or empty body. Run after deploys, optionally in CI.
#
# Usage: bash scripts/smoke-test.sh [--prod | --local]
#   --prod (default): tests https://ki-norge-frontend... and the prod CMS
#   --local:           tests http://localhost:4321 + http://localhost:5000

set -uo pipefail

MODE="${1:---prod}"

if [ "$MODE" = "--local" ]; then
  FRONTEND="http://localhost:4321"
  CMS="http://localhost:5000"
else
  FRONTEND="https://ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev"
  # Proxy-hosten, ikke dis-core direkte: dis-core krever Altinn-VPN og er derfor
  # ikke nabar fra en GitHub-runner. Proxyen star foran samme instans.
  CMS="https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev"
fi

API_KEY="ki-norge-delivery-key-2025"

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

# En sjekk som ikke lot seg kjore er IKKE en bestatt sjekk. Teller som feil,
# ellers leses en tom testkjoring som gronn.
skip() {
  echo "  SKIP  $1  ($2)"
  FAIL=$((FAIL+1))
  FAILURES+=("$1: hoppet over ($2)")
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
SLUG=$(curl -s "$CMS/umbraco/delivery/api/v2/content?filter=contentType:artikkel&take=1" -H "Api-Key: $API_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('items',[]); print(items[0]['properties'].get('slug','') if items else '')" 2>/dev/null)
if [ -n "$SLUG" ]; then check "Artikkel detail"  "$FRONTEND/artikler/$SLUG"; else skip "Artikkel detail" "fant ingen slug via Delivery API"; fi

SLUG=$(curl -s "$CMS/umbraco/delivery/api/v2/content?filter=contentType:eksempel&take=1" -H "Api-Key: $API_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('items',[]); print(items[0]['properties'].get('slug','') if items else '')" 2>/dev/null)
if [ -n "$SLUG" ]; then check "Eksempel detail"  "$FRONTEND/eksempler/$SLUG"; else skip "Eksempel detail" "fant ingen slug via Delivery API"; fi

echo ""
echo "=== Regresjonsvakter ==="
# En ukjent kalender-slug rendret tidligere et oppdiktet arrangement (#636).
# Skal redirecte til oversikten, ikke svare 200 med innhold.
check "Ukjent kalender-slug redirecter" "$FRONTEND/kalender/finnes-ikke-smoke-test" "302" "0"

echo ""
echo "=== Delivery API ($CMS) ==="
HEADER="-H 'Api-Key: $API_KEY'"
check "DeliveryAPI: artikkel"        "$CMS/umbraco/delivery/api/v2/content?filter=contentType:artikkel&take=1"  "2xx" "200" -H "Api-Key: $API_KEY"
check "DeliveryAPI: eksempel"        "$CMS/umbraco/delivery/api/v2/content?filter=contentType:eksempel&take=1"  "2xx" "200" -H "Api-Key: $API_KEY"
check "DeliveryAPI: omOss"           "$CMS/umbraco/delivery/api/v2/content?filter=contentType:omOss&take=1"      "2xx" "200" -H "Api-Key: $API_KEY"
check "DeliveryAPI: forside"         "$CMS/umbraco/delivery/api/v2/content?filter=contentType:forside&take=1"    "2xx" "200" -H "Api-Key: $API_KEY"

# Sort sanity — would have caught the publishedAt:desc bug
check "DeliveryAPI: sort=updateDate" "$CMS/umbraco/delivery/api/v2/content?filter=contentType:eksempel&take=1&sort=updateDate:desc" "2xx" "200" -H "Api-Key: $API_KEY"

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
