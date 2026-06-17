#!/usr/bin/env node
/**
 * Genererer CMS-speilet av content-routes fra den eneste kilden i /shared.
 * Run from repo root: node scripts/sync-content-routes.js
 *
 * Hvorfor: frontend leser /shared/content-routes.json direkte, men CMS-ens
 * Docker-build-kontekst er apps/cms-umbraco/ alene og kan ikke nå /shared ved
 * build. Derfor speiles fila inn i CMS-prosjektet. Speilet er generert (ikke i
 * git) og lages av dette skriptet før hver CMS-build/run (lokalt via pnpm
 * cms:*-scriptene, i CI før docker build / dotnet). Rediger /shared, aldri speilet.
 */
const fs = require('fs');
const path = require('path');

const sharedPath = path.join(__dirname, '../shared/content-routes.json');
const mirrorPath = path.join(__dirname, '../apps/cms-umbraco/content-routes.json');

const GENERATED_COMMENT =
  'GENERATED FILE - ikke rediger. Speil av /shared/content-routes.json, laget av ' +
  'scripts/sync-content-routes.js. Rediger /shared/content-routes.json i stedet. ' +
  'Speilet finnes fordi CMS-ens Docker-build-kontekst er apps/cms-umbraco/ alene ' +
  'og ikke kan nå /shared ved build.';

const src = JSON.parse(fs.readFileSync(sharedPath, 'utf8'));
// Behold nøkkelrekkefølgen ($comment, patternSyntax, routes) men bytt ut
// $comment med en generert-advarsel. CMS-en leser kun "routes".
const out = { ...src, $comment: GENERATED_COMMENT };

fs.writeFileSync(mirrorPath, JSON.stringify(out, null, 2) + '\n');
console.log(`[sync-content-routes] ${path.relative(process.cwd(), mirrorPath)} oppdatert fra /shared`);
