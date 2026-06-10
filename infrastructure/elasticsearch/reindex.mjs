// Trigger a full ki-content reindex by calling the CMS's authoritative endpoint
// (POST /search/reindex), then poll until it finishes. This does NOT re-implement
// indexing — the C# ReindexBackgroundJob + ContentTextExtractor remain the single
// source of truth; this is just a remote trigger you can run from your laptop.
//
//   pnpm run search:reindex
//
// Auth uses an Umbraco Management API user (client_credentials), so no browser
// login. Create one once: Umbraco backoffice → Users → API Users → add user with
// access, copy the client id + secret into infrastructure/elasticsearch/.env:
//
//   CMS_URL=https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev
//   UMBRACO_CLIENT_ID=umbraco-back-office-<name>
//   UMBRACO_CLIENT_SECRET=<secret>
//   # TOKEN_URL is optional — only set it if your instance exposes the OpenIddict
//   # token endpoint at a non-default path (the script discovers it otherwise).

const CMS = (process.env.CMS_URL || '').replace(/\/$/, '');
const CLIENT_ID = process.env.UMBRACO_CLIENT_ID || '';
const CLIENT_SECRET = process.env.UMBRACO_CLIENT_SECRET || '';
const MGMT = `${CMS}/umbraco/management/api/v1`;

if (!CMS || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing CMS_URL / UMBRACO_CLIENT_ID / UMBRACO_CLIENT_SECRET — see .env.example');
  process.exit(1);
}

async function tokenEndpoint() {
  if (process.env.TOKEN_URL) return process.env.TOKEN_URL;
  // Discover from the backoffice OpenID configuration; fall back to the documented default.
  const fallback = `${MGMT}/security/back-office/token`;
  try {
    const res = await fetch(`${MGMT}/security/back-office/.well-known/openid-configuration`);
    if (res.ok) {
      const cfg = await res.json();
      if (typeof cfg.token_endpoint === 'string') return cfg.token_endpoint;
    }
  } catch { /* fall through */ }
  return fallback;
}

async function getToken() {
  const url = await tokenEndpoint();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`token ${res.status} @ ${url}: ${await res.text()}`);
  const { access_token } = await res.json();
  if (!access_token) throw new Error('token response had no access_token');
  return access_token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const token = await getToken();
const auth = { Authorization: `Bearer ${token}` };

console.log(`→ triggering reindex on ${CMS} …`);
const start = await fetch(`${MGMT}/search/reindex`, { method: 'POST', headers: auth });
if (start.status === 409) {
  console.log('  a reindex is already running — polling its progress instead.');
} else if (start.status !== 202 && !start.ok) {
  throw new Error(`reindex start ${start.status}: ${await start.text()}`);
}

for (;;) {
  await sleep(2000);
  const res = await fetch(`${MGMT}/search/reindex/status`, { headers: auth });
  if (!res.ok) throw new Error(`status ${res.status}: ${await res.text()}`);
  const s = await res.json();
  console.log(`  ${s.status} — ${s.processedItems}/${s.totalItems} (${s.percentComplete}%), indexed ${s.indexedItems}`);
  if (!s.isRunning) {
    console.log(`✓ done — ${s.indexedItems} documents indexed`);
    break;
  }
}
