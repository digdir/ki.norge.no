// Beholder hash-navngitte filer fra tidligere builds i _astro-mappa før deploy.
//
// En deploy sletter forrige builds _astro-filer. HTML som allerede er ute
// (åpne faner, Safari-sesjonsgjenoppretting, senere edge-cache) peker fortsatt
// på de filene og får 404 på CSS/JS, som gir en ustylet side (#428).
// Filnavnene er innholdshashede, så gamle og nye filer kan aldri kollidere,
// og det er trygt å la gamle ligge med i deployen.
//
// Arkiv: ~/.cache/ki-norge-frontend/astro-assets/<env>/
// Kjøres mellom astro build og wrangler deploy. Mangler arkivet (ny maskin,
// første deploy) deployes kun dagens build, altså samme oppførsel som før.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PRUNE_DAYS = 14;

const env = process.argv[2] || 'default';
const archiveDir = path.join(os.homedir(), '.cache', 'ki-norge-frontend', 'astro-assets', env);

// Cloudflare-adapteren legger klientassets under dist/client. Skriptet lette
// bare i dist/_astro, som ikke har eksistert på en stund, og hoppet derfor
// stille over på hver eneste deploy. Beskyttelsen mot ustylede sider var altså
// avslått uten at noe sa fra. Begge plasseringer sjekkes nå.
const CANDIDATE_DIRS = ['dist/client/_astro', 'dist/_astro'];
const distDir = CANDIDATE_DIRS.map((dir) => path.resolve(dir)).find((dir) => fs.existsSync(dir));

// Hardt stopp, ikke stille hopp. Finner vi ingen av dem etter et bygg, har
// utdata-strukturen flyttet seg igjen, og da skal deployen stanse framfor å
// late som beskyttelsen virker.
if (!distDir) {
  console.error(
    `[keep-previous-assets] fant ingen _astro-mappe (lette i ${CANDIDATE_DIRS.join(', ')}).\n` +
      'Har byggets utdata flyttet seg? Uten denne mappa er vernet mot ustylede sider (#428) ute av drift.',
  );
  process.exit(1);
}

fs.mkdirSync(archiveDir, { recursive: true });

// 1. Arkiver gjeldende build. Overskriving er ok (samme navn = samme innhold),
//    og kopieringen oppdaterer mtime som markerer fila som fortsatt i bruk.
let archived = 0;
for (const name of fs.readdirSync(distDir)) {
  const src = path.join(distDir, name);
  if (!fs.statSync(src).isFile()) continue;
  fs.copyFileSync(src, path.join(archiveDir, name));
  archived++;
}

// 2. Fjern arkivfiler som ikke har vært med i en build på PRUNE_DAYS dager.
const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000;
let pruned = 0;
for (const name of fs.readdirSync(archiveDir)) {
  const file = path.join(archiveDir, name);
  if (fs.statSync(file).mtimeMs < cutoff) {
    fs.rmSync(file);
    pruned++;
  }
}

// 3. Legg tidligere builds sine filer tilbake i dist. Aldri overskriv nye.
let restored = 0;
for (const name of fs.readdirSync(archiveDir)) {
  const dest = path.join(distDir, name);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(archiveDir, name), dest);
    restored++;
  }
}

console.log(
  `[keep-previous-assets] env=${env}: arkiverte ${archived} filer, la ${restored} fra tidligere builds tilbake i dist, fjernet ${pruned} eldre enn ${PRUNE_DAYS} dager`,
);
