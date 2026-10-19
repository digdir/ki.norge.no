#!/usr/bin/env bash
# Take a local backup of the prod content before a risky change.
#
# Fetches everything read-only from the prod pod with kubectl exec. Writes nothing to prod.
# Mirrors the recipe that was used manually before the Umbraco 17.5 upgrade in July 2026.
#
# Usage: bash scripts/backup-prod.sh <name> [tt02]
#   name   short label, becomes part of the folder name (e.g. "pre-usync-jobb2")
#   tt02   optional, back up tt02 instead of prod
#
# Requires: kubectl with the Altinn VPN (exit node ts-exit-prod), permissions on the pod.
#
# IMPORTANT: run the uSync export in the backoffice BEFORE the script (Settings -> uSync -> Export,
# both Content and Settings). The content folder has been persistent since #674, and the schema lives in
# the image, so the folders exist even without a new export. The script shows the time of the
# newest content file, so you can see whether the export is fresh.
#
# The image files are not included. They live in Azure Blob, not in the pod.

set -uo pipefail

NAME="${1:-}"
ENVN="${2:-prod}"
[ -n "$NAME" ] || { echo "Usage: bash scripts/backup-prod.sh <name> [tt02]" >&2; exit 1; }

case "$ENVN" in
  prod) CTX="dis-core-prod-aks"; API="https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev" ;;
  tt02) CTX="dis-core-tt02-aks"; API="https://kinorgeportal.tt02.dis-core.altinn.cloud" ;;
  *) echo "Unknown environment '$ENVN'. Use prod or tt02." >&2; exit 1 ;;
esac

NS="product-kinorgeportal"
POD="deploy/umbraco"
CONTAINER="umbraco"
DATE=$(date +%Y-%m-%d)
DEST="${BACKUP_ROOT:-$HOME/projects/ki.norge.no-backups}/${DATE}-${NAME}"

fail() { echo "ERROR: $*" >&2; exit 1; }
note() { echo "▸ $*"; }
k() { kubectl --context "$CTX" -n "$NS" "$@"; }

command -v kubectl >/dev/null || fail "kubectl is missing."
command -v python3 >/dev/null || fail "python3 is missing (used for the fingerprint)."

note "Checking access to ${ENVN}…"
k get pods --request-timeout=25s >/dev/null 2>&1 \
  || fail "Cannot reach the cluster. Is the Altinn VPN/exit node (ts-exit-$ENVN) on?"

IMAGE=$(k get pods -o jsonpath='{.items[0].spec.containers[?(@.name=="umbraco")].image}' --request-timeout=25s 2>/dev/null | sed 's|.*/||')
note "The pod runs image $IMAGE"

k exec "$POD" -c "$CONTAINER" --request-timeout=30s -- sh -c 'test -d /app/uSync/v17/Content' 2>/dev/null \
  || fail "Found no content export in the pod. Run Export in the backoffice first (Settings -> uSync -> Export, both Content and Settings), then this script."
NYESTE=$(k exec "$POD" -c "$CONTAINER" --request-timeout=30s -- sh -c "find /app/uSync/v17/Content -type f -printf '%TY-%Tm-%Td %TH:%TM\n' | sort | tail -1" 2>/dev/null)
note "Newest file in the content export: ${NYESTE:-none}"

mkdir -p "$DEST" || fail "Could not create $DEST"

note "1/3 uSync export (content, media metadata, schema)…"
k exec "$POD" -c "$CONTAINER" --request-timeout=180s -- tar czf - -C /app uSync > "$DEST/usync-export.tar.gz" 2>/dev/null
USYNC_N=$(tar tzf "$DEST/usync-export.tar.gz" 2>/dev/null | wc -l | tr -d ' ')
[ "${USYNC_N:-0}" -gt 1 ] || fail "The uSync archive was empty. Aborting."
echo "   $(wc -c < "$DEST/usync-export.tar.gz") bytes, $USYNC_N entries"

note "2/3 Delivery API dump (for verification)…"
curl -s -H "User-Agent: Mozilla/5.0" "$API/umbraco/delivery/api/v2/content?take=500" -o "$DEST/delivery-api-dump.json"
TOTAL=$(python3 -c "import json,sys; print(json.load(open('$DEST/delivery-api-dump.json')).get('total','?'))" 2>/dev/null || echo "?")
[ "$TOTAL" != "?" ] || fail "Did not get valid JSON from the Delivery API."
echo "   $TOTAL nodes"

note "3/3 fingerprint…"
cat > "$DEST/fingerprint.py" <<'PY'
# Fingerprint of a Delivery API dump: per page a stable hash of all content,
# plus all link attributes. Run on a dump before and after the change and diff.
import json, sys, hashlib

def walk(n, anchors):
    if isinstance(n, dict):
        if n.get('tag') == 'a':
            anchors.append(n.get('attributes') or {})
        for v in n.values():
            walk(v, anchors)
    elif isinstance(n, list):
        for x in n:
            walk(x, anchors)

d = json.load(open(sys.argv[1]))
for it in sorted(d['items'], key=lambda i: i['id']):
    anchors = []
    walk(it.get('properties'), anchors)
    blob = json.dumps(it, sort_keys=True, ensure_ascii=False)
    h = hashlib.sha256(blob.encode()).hexdigest()[:16]
    print(f"{it['id']} {h} {it.get('contentType','?')} {it.get('name','?')}")
    for a in anchors:
        print(f"   a: {json.dumps(a, sort_keys=True, ensure_ascii=False)}")
PY
python3 "$DEST/fingerprint.py" "$DEST/delivery-api-dump.json" > "$DEST/fingerprint.txt" \
  || fail "Fingerprint failed."
echo "   $(wc -l < "$DEST/fingerprint.txt" | tr -d ' ') lines"

cat > "$DEST/README.md" <<EOF
# Backup of $ENVN: $NAME

Taken $DATE from image $IMAGE. Everything fetched read-only with \`kubectl exec\`, no writes to $ENVN.

| File | What | Can restore? |
|---|---|---|
| \`usync-export.tar.gz\` | uSync export: Content, Media metadata, ContentTypes, DataTypes ($USYNC_N entries) | YES, the reinjection files |
| \`delivery-api-dump.json\` | Published content as the API served it ($TOTAL nodes) | NO, verification only |
| \`fingerprint.txt\` | Hash per page + link attributes | NO, verification only |

The image files are not included. They live in Azure Blob, not in the pod.

## This is NOT a database restore

uSync files are definitions and content values, not a database. If a property is deleted,
the content that was in it disappears. A full restore is Azure SQL point-in-time
restore. The database is owned by Altinn (dis-core), restore is ordered via Team Plattform.

## Restoring content

1. \`cat usync-export.tar.gz | kubectl --context $CTX -n $NS exec -i $POD -c $CONTAINER -- tar xzf - -C /app\`
2. Prod's uSync set \`Default\` only allows Export. Import temporarily requires
   \`uSync__Settings__DefaultSet=Speiling\` as an env var.
3. Import in the backoffice (Settings -> uSync -> Import, NEVER "clean"). Import is an upsert.

## Verification afterwards

\`\`\`
curl -s -H "User-Agent: Mozilla/5.0" "$API/umbraco/delivery/api/v2/content?take=500" -o after.json
python3 fingerprint.py after.json > after.txt
diff fingerprint.txt after.txt
\`\`\`

Empty diff = the content is bit-identical. Known exception: pages edited after $DATE.
EOF

echo ""
echo "================================================"
echo "Backup done: $DEST"
echo "  uSync    $USYNC_N entries"
echo "  API      $TOTAL nodes"
echo "  Remember: this is not a database restore. See README.md."
