// Purges the Cloudflare cache after a frontend deploy.
//
// A deploy rotates the content-hashed file names in _astro and deletes the old ones.
// Meanwhile the edge holds HTML from before the deploy for up to s-maxage (10 min), and
// that HTML points to files that no longer exist. The result is an unstyled
// page (#428). Purge removes the old HTML right away.
//
// The predecessor tried to solve it the other way round, by keeping old assets alive
// (keep-previous-assets.mjs). That archive lived on the machine that deployed and only helped
// if the same machine deployed last, and it also hid the symptom rather than
// removing the cause.
//
// Calls the Cloudflare API directly, like the CMS does on publish.

import fs from 'node:fs';

// The deploy applies to one environment, but the Cloudflare zone is shared between ki.norge.no and
// ki.test.norge.no. purge_everything therefore hits both. It is the same
// behaviour the CMS has on every publish, and the consequence is only
// cache misses for a few minutes.
//
// purge_everything is a MEASURED choice, not laziness. Purge per URL (files) was
// considered and rejected: the cache key is the full URL with query, so a
// files purge misses utm-tagged variants and becomes partial where this is
// exhaustive. The zone's blast radius has also been measured to be just our own four
// hostnames. See docs/cloudflare-cache-purge.md before you change this.
const ENVIRONMENTS = new Set(['prod', 'tt02']);

// Astro reads .env itself, but a plain node script does not. Simple parsing
// is enough here, and a real environment may override the file.
function readEnvFile(file = '.env') {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return values;
}

const env = process.argv[2];
if (!ENVIRONMENTS.has(env)) {
  console.error(`[purge-cache] unknown environment "${env}". Valid: ${[...ENVIRONMENTS].join(', ')}`);
  process.exit(1);
}

const fileEnv = readEnvFile();
const zoneId = process.env.CLOUDFLARE_ZONE_ID || fileEnv.CLOUDFLARE_ZONE_ID;
const token = process.env.CLOUDFLARE_PURGE_TOKEN || fileEnv.CLOUDFLARE_PURGE_TOKEN;

// Hard stop rather than a silent skip. A deploy that thinks it purges, but doesn't,
// is exactly the trap keep-previous-assets fell into.
if (!zoneId || !token) {
  console.error(
    '[purge-cache] missing Cloudflare keys, so the cache cannot be purged.\n' +
      'Set these in apps/frontend/.env:\n' +
      '  CLOUDFLARE_ZONE_ID      the zone ID for norge.no (Cloudflare dashboard, Overview)\n' +
      '  CLOUDFLARE_PURGE_TOKEN  API token starting with cfat_, with Zone.Cache Purge',
  );
  process.exit(1);
}

const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ purge_everything: true }),
});

const result = await res.json().catch(() => ({}));

if (!res.ok || result.success === false) {
  const detail = (result.errors ?? []).map((e) => `${e.code} ${e.message}`).join('; ');
  console.error(`[purge-cache] ${env}: purge failed (${res.status}) ${detail}`);
  process.exit(1);
}

console.log(`[purge-cache] ${env}: cache purged`);
