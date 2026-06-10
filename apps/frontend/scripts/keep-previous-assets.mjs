// Beholder hash-navngitte filer fra tidligere builds i dist/_astro før deploy.
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
const distDir = path.resolve('dist/_astro');
const archiveDir = path.join(os.homedir(), '.cache', 'ki-norge-frontend', 'astro-assets', env);

if (!fs.existsSync(distDir)) {
  console.log(`[keep-previous-assets] ${distDir} finnes ikke, hopper over (kjøres etter astro build)`);
  process.exit(0);
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
