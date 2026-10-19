#!/usr/bin/env node
/**
 * Prepares an export from the KI-tiltak register as src/data/ki-tiltak.json.
 *
 *   node apps/frontend/scripts/klargjor-ki-tiltak.mjs <eksport.json>
 *
 * Fixes NA, swaps the register's variants for our values, applies
 * src/data/ki-tiltak-overstyringer.json and writes a report. The rules themselves
 * live in src/lib/klargjor-ki-tiltak.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { klargjor, tilJson } from '../src/lib/klargjor-ki-tiltak.ts';

const data = (fil) => new URL(`../src/data/${fil}`, import.meta.url);
const les = (sti) => JSON.parse(readFileSync(sti, 'utf8'));

const eksportSti = process.argv[2];
if (!eksportSti) {
  console.error('Usage: node apps/frontend/scripts/klargjor-ki-tiltak.mjs <eksport.json>');
  process.exit(1);
}

const r = klargjor(les(eksportSti), les(data('ki-tiltak-overstyringer.json')), les(data('ki-tiltak-virksomhetsnavn.json')));
const ut = data('ki-tiltak.json');
writeFileSync(ut, tilJson(r.tiltak));

const liste = (tittel, linjer) => {
  console.log(`\n${tittel}${linjer.length === 0 ? ': none' : ''}`);
  for (const l of linjer) console.log(`  - ${l}`);
};

console.log(`Wrote ${fileURLToPath(ut)}`);
console.log(`${r.tiltak.length} tiltak, ${r.naRettet} NA fixed, ${r.byttet.length} variants swapped.`);
liste('Variants swapped', [...new Set(r.byttet.map((b) => `${b.felt}: "${b.fra}" → "${b.til}"`))]);
liste('Overrides applied', r.brukt.map((b) => `${b.navn}: ${b.endret.join(', ') || 'nothing'}${b.uendret.length ? ` (the export already has: ${b.uendret.join(', ')})` : ''}`));
liste('Overrides for ids that no longer exist', r.ukjenteId);
liste('Unknown values, not changed', r.ukjente.map((u) => `${u.navn}: ${u.felt} "${u.verdi}"`));
liste('Org numbers without a name in ki-tiltak-virksomhetsnavn.json', r.utenNavn.map((o) => `${o.orgnr} ${o.navn}`));
liste('Tiltak without fagområde', r.utenFagomrade);
