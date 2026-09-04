// Tømmer Cloudflare-cachen etter en frontend-deploy.
//
// En deploy roterer de innholdshashede filnavnene i _astro og sletter de gamle.
// Edgen sitter samtidig på HTML fra før deployen i inntil s-maxage (10 min), og
// den HTML-en peker på filer som ikke finnes lenger. Resultatet er en ustylet
// side (#428). Purge fjerner den gamle HTML-en med én gang.
//
// Forgjengeren prøvde å løse det motsatt, ved å holde gamle assets i live
// (keep-previous-assets.mjs). Det arkivet lå på maskinen som deployet og hjalp
// bare hvis samme maskin deployet sist, og skjulte dessuten symptomet framfor å
// fjerne årsaken.
//
// Kaller Cloudflare-API-et direkte, slik CMS-et gjør ved publisering. Det
// alternative sporet, frontendens /api/purge-cache, er ikke brukbart: workerne
// har ingen Cloudflare-secrets satt, så det endepunktet kan ikke purge noe.

import fs from 'node:fs';

// Deployen gjelder ett miljø, men Cloudflare-sonen er delt mellom ki.norge.no og
// ki.test.norge.no. purge_everything treffer derfor begge. Det er samme
// oppførsel som CMS-et har ved hver publisering, og konsekvensen er kun
// cache-bom i noen minutter.
//
// purge_everything er et MÅLT valg, ikke latskap. Purge per URL (files) er
// vurdert og forkastet: cache-nøkkelen er hele URLen med query, så et
// files-purge bommer på utm-taggede varianter og blir delvis der dette er
// uttømmende. Sonens sprengradius er dessuten målt til bare våre egne fire
// hostnavn. Se docs/cloudflare-cache-purge.md før du endrer dette.
const ENVIRONMENTS = new Set(['prod', 'tt02']);

// Astro leser .env selv, men et rent node-skript gjør det ikke. Enkel lesing
// holder her, og et ekte miljø får overstyre fila.
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
  console.error(`[purge-cache] ukjent miljø "${env}". Gyldige: ${[...ENVIRONMENTS].join(', ')}`);
  process.exit(1);
}

const fileEnv = readEnvFile();
const zoneId = process.env.CLOUDFLARE_ZONE_ID || fileEnv.CLOUDFLARE_ZONE_ID;
const token = process.env.CLOUDFLARE_PURGE_TOKEN || fileEnv.CLOUDFLARE_PURGE_TOKEN;

// Hardt stopp framfor stille hopp. En deploy som tror den purger, men ikke gjør
// det, er nøyaktig fella keep-previous-assets satt seg i.
if (!zoneId || !token) {
  console.error(
    '[purge-cache] mangler Cloudflare-nøkler, og da kan ikke cachen tømmes.\n' +
      'Sett disse i apps/frontend/.env:\n' +
      '  CLOUDFLARE_ZONE_ID      sone-IDen for norge.no (Cloudflare-dashbordet, Overview)\n' +
      '  CLOUDFLARE_PURGE_TOKEN  API-token som starter med cfat_, med Zone.Cache Purge\n' +
      'PURGE_SECRET er noe annet og trengs ikke her.',
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
  console.error(`[purge-cache] ${env}: purge feilet (${res.status}) ${detail}`);
  process.exit(1);
}

console.log(`[purge-cache] ${env}: cachen er tømt`);
