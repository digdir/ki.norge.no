#!/usr/bin/env bash
# Ta en lokal backup av prod-innholdet før en risikabel endring.
#
# Henter alt read-only fra prod-podden med kubectl exec. Skriver ingenting til prod.
# Speiler oppskriften som ble brukt manuelt før Umbraco 17.5-oppgraderingen i juli 2026.
#
# Bruk: bash scripts/backup-prod.sh <navn> [tt02]
#   navn   kort merkelapp, blir en del av mappenavnet (f.eks. "pre-usync-jobb2")
#   tt02   valgfritt, ta backup av tt02 i stedet for prod
#
# Krever: kubectl med Altinn-VPN (exit-node ts-exit-prod), rettigheter til podden.
#
# VIKTIG: uSync-eksporten må være kjørt i backoffice FØR scriptet kjøres. Podden har
# bare filer hvis noen har trykket Export (Settings -> uSync -> Export, både Content
# og Settings). Scriptet sjekker dette og stopper hvis mappa mangler.

set -uo pipefail

NAME="${1:-}"
ENVN="${2:-prod}"
[ -n "$NAME" ] || { echo "Bruk: bash scripts/backup-prod.sh <navn> [tt02]" >&2; exit 1; }

case "$ENVN" in
  prod) CTX="dis-core-prod-aks"; API="https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev" ;;
  tt02) CTX="dis-core-tt02-aks"; API="https://kinorgeportal.tt02.dis-core.altinn.cloud" ;;
  *) echo "Ukjent miljø '$ENVN'. Bruk prod eller tt02." >&2; exit 1 ;;
esac

NS="product-kinorgeportal"
POD="deploy/umbraco"
CONTAINER="umbraco"
DATE=$(date +%Y-%m-%d)
DEST="${BACKUP_ROOT:-$HOME/projects/ki.norge.no-backups}/${DATE}-${NAME}"

fail() { echo "FEIL: $*" >&2; exit 1; }
note() { echo "▸ $*"; }
k() { kubectl --context "$CTX" -n "$NS" "$@"; }

command -v kubectl >/dev/null || fail "kubectl mangler."
command -v python3 >/dev/null || fail "python3 mangler (brukes til fingerprint)."

note "Sjekker tilgang til ${ENVN}…"
k get pods --request-timeout=25s >/dev/null 2>&1 \
  || fail "Når ikke clusteret. Er Altinn-VPN/exit-node (ts-exit-$ENVN) på?"

IMAGE=$(k get pods -o jsonpath='{.items[0].spec.containers[?(@.name=="umbraco")].image}' --request-timeout=25s 2>/dev/null | sed 's/.*://')
note "Podden kjører image $IMAGE"

k exec "$POD" -c "$CONTAINER" --request-timeout=30s -- sh -c 'test -d /app/uSync/v17' 2>/dev/null \
  || fail "Fant ingen /app/uSync i podden. Kjør Export i backoffice først (Settings -> uSync -> Export, både Content og Settings), deretter dette scriptet."

mkdir -p "$DEST" || fail "Fikk ikke opprettet $DEST"

note "1/4 uSync-eksport (innhold, media-metadata, skjema)…"
k exec "$POD" -c "$CONTAINER" --request-timeout=180s -- tar czf - -C /app uSync > "$DEST/usync-export.tar.gz" 2>/dev/null
USYNC_N=$(tar tzf "$DEST/usync-export.tar.gz" 2>/dev/null | wc -l | tr -d ' ')
[ "${USYNC_N:-0}" -gt 1 ] || fail "uSync-arkivet ble tomt. Avbryter."
echo "   $(wc -c < "$DEST/usync-export.tar.gz") bytes, $USYNC_N oppføringer"

note "2/4 mediefiler…"
k exec "$POD" -c "$CONTAINER" --request-timeout=300s -- tar czf - -C /app/wwwroot media > "$DEST/media.tar.gz" 2>/dev/null
MEDIA_N=$(tar tzf "$DEST/media.tar.gz" 2>/dev/null | wc -l | tr -d ' ')
[ "${MEDIA_N:-0}" -gt 0 ] || echo "   ADVARSEL: media-arkivet er tomt"
echo "   $(wc -c < "$DEST/media.tar.gz") bytes, $MEDIA_N oppføringer"

note "3/4 Delivery API-dump (til verifisering)…"
curl -s -H "User-Agent: Mozilla/5.0" "$API/umbraco/delivery/api/v2/content?take=500" -o "$DEST/delivery-api-dump.json"
TOTAL=$(python3 -c "import json,sys; print(json.load(open('$DEST/delivery-api-dump.json')).get('total','?'))" 2>/dev/null || echo "?")
[ "$TOTAL" != "?" ] || fail "Fikk ikke gyldig JSON fra Delivery API."
echo "   $TOTAL noder"

note "4/4 fingerprint…"
cat > "$DEST/fingerprint.py" <<'PY'
# Fingerprint av et Delivery API-dump: per side en stabil hash av alt innhold,
# pluss alle lenke-attributter. Kjør på dump før og etter endringen og diff.
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
  || fail "Fingerprint feilet."
echo "   $(wc -l < "$DEST/fingerprint.txt" | tr -d ' ') linjer"

cat > "$DEST/README.md" <<EOF
# Backup av $ENVN — $NAME

Tatt $DATE fra image $IMAGE. Alt hentet read-only med \`kubectl exec\`, ingen skriving mot $ENVN.

| Fil | Hva | Kan gjenopprette? |
|---|---|---|
| \`usync-export.tar.gz\` | uSync-eksport: Content, Media-metadata, ContentTypes, DataTypes ($USYNC_N oppføringer) | JA, reinjiseringsfilene |
| \`media.tar.gz\` | Mediefiler fra \`/app/wwwroot/media\` ($MEDIA_N oppføringer) | JA, ren filkopi tilbake |
| \`delivery-api-dump.json\` | Publisert innhold slik API-et serverte det ($TOTAL noder) | NEI, kun verifisering |
| \`fingerprint.txt\` | Hash per side + lenke-attributter | NEI, kun verifisering |

## Dette er IKKE en databasegjenoppretting

uSync-filer er definisjoner og innholdsverdier, ikke en database. Slettes en property,
forsvinner innholdet som lå i den. Full gjenoppretting er Azure SQL point-in-time
restore. Databasen eies av Altinn (dis-core), restore bestilles via Team Plattform.

## Gjenoppretting av innhold

1. \`cat usync-export.tar.gz | kubectl --context $CTX -n $NS exec -i $POD -c $CONTAINER -- tar xzf - -C /app\`
2. Prod sitt uSync-sett \`Default\` tillater kun Export. Import krever midlertidig
   \`uSync__Settings__DefaultSet=Speiling\` som env-var.
3. Import i backoffice (Settings -> uSync -> Import, ALDRI «clean»). Import er upsert.
4. Media ved behov: \`cat media.tar.gz | kubectl ... exec -i $POD -c $CONTAINER -- tar xzf - -C /app/wwwroot\`

## Verifisering etterpå

\`\`\`
curl -s -H "User-Agent: Mozilla/5.0" "$API/umbraco/delivery/api/v2/content?take=500" -o etter.json
python3 fingerprint.py etter.json > etter.txt
diff fingerprint.txt etter.txt
\`\`\`

Tom diff = innholdet er bit-identisk. Kjent unntak: sider redigert etter $DATE.
EOF

echo ""
echo "================================================"
echo "Backup ferdig: $DEST"
echo "  uSync    $USYNC_N oppføringer"
echo "  media    $MEDIA_N oppføringer"
echo "  API      $TOTAL noder"
echo "  Husk: dette er ikke en databasegjenoppretting. Se README.md."
