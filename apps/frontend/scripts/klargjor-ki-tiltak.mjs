#!/usr/bin/env node
/**
 * Gjør en eksport fra KI-tiltaksregisteret klar som src/data/ki-tiltak.json.
 *
 *   node apps/frontend/scripts/klargjor-ki-tiltak.mjs <eksport.json>
 *
 * Retter NA, bytter registerets varianter til våre verdier, legger på
 * src/data/ki-tiltak-overstyringer.json og skriver en rapport. Selve reglene
 * står i src/lib/klargjor-ki-tiltak.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { klargjor, tilJson } from '../src/lib/klargjor-ki-tiltak.ts';

const data = (fil) => new URL(`../src/data/${fil}`, import.meta.url);
const les = (sti) => JSON.parse(readFileSync(sti, 'utf8'));

const eksportSti = process.argv[2];
if (!eksportSti) {
  console.error('Bruk: node apps/frontend/scripts/klargjor-ki-tiltak.mjs <eksport.json>');
  process.exit(1);
}

const r = klargjor(les(eksportSti), les(data('ki-tiltak-overstyringer.json')), les(data('ki-tiltak-virksomhetsnavn.json')));
const ut = data('ki-tiltak.json');
writeFileSync(ut, tilJson(r.tiltak));

const liste = (tittel, linjer) => {
  console.log(`\n${tittel}${linjer.length === 0 ? ': ingen' : ''}`);
  for (const l of linjer) console.log(`  - ${l}`);
};

console.log(`Skrev ${fileURLToPath(ut)}`);
console.log(`${r.tiltak.length} tiltak, ${r.naRettet} NA rettet, ${r.byttet.length} varianter byttet.`);
liste('Varianter byttet', [...new Set(r.byttet.map((b) => `${b.felt}: «${b.fra}» → «${b.til}»`))]);
liste('Overstyringer brukt', r.brukt.map((b) => `${b.navn}: ${b.endret.join(', ') || 'ingenting'}${b.uendret.length ? ` (eksporten har allerede: ${b.uendret.join(', ')})` : ''}`));
liste('Overstyringer for id-er som ikke finnes lenger', r.ukjenteId);
liste('Ukjente verdier, ikke endret', r.ukjente.map((u) => `${u.navn}: ${u.felt} «${u.verdi}»`));
liste('Orgnr uten navn i ki-tiltak-virksomhetsnavn.json', r.utenNavn.map((o) => `${o.orgnr} ${o.navn}`));
liste('Tiltak uten fagområde', r.utenFagomrade);
