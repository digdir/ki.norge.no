#!/usr/bin/env node
/**
 * Lager apps/frontend/src/data/ki-tiltak.json fra registerets eksport.
 *
 *   node scripts/importer-ki-tiltak.mjs <eksport.json>
 *   node scripts/importer-ki-tiltak.mjs <eksport.json> --bare-rapport
 *
 * Registeret er kilden. Det som publiseres, er det som er kuratert der, og
 * ki-tiltak.json redigeres ikke for hånd. Skriptet skriver tre filer:
 *
 *   ki-tiltak.json               tiltakene som publiseres
 *   ki-tiltak-id-alias.json      gammel id til ny, så gamle ?tiltak=-lenker virker
 *   ki-tiltak-virksomheter.json  orgnr til visningsnavn
 *
 * Tiltak uten fagområde holdes tilbake. Mangler en publisert virksomhet
 * visningsnavn, stopper importen uten å skrive noe. Eksportfila har
 * kontaktadresser og skal ikke inn i repoet, bare filene over.
 *
 * Reglene ligger i apps/frontend/src/lib/ki-tiltak-modell.ts, med enhetstester.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  FAGOMRADER,
  FASER,
  oppdaterIdAlias,
  rensRad,
  settVisningsnavn,
  slaaSammenVarianter,
  sorterPaaNavn,
  tilFilformat,
} from '../apps/frontend/src/lib/ki-tiltak-modell.ts';

const [eksportSti, ...flagg] = process.argv.slice(2);
if (!eksportSti) {
  console.error('Bruk: node scripts/importer-ki-tiltak.mjs <eksport.json> [--bare-rapport]');
  process.exit(2);
}
const bareRapport = flagg.includes('--bare-rapport');

const DATA = new URL('../apps/frontend/src/data/', import.meta.url);
const FIL = {
  tiltak: new URL('ki-tiltak.json', DATA),
  alias: new URL('ki-tiltak-id-alias.json', DATA),
  navn: new URL('ki-tiltak-virksomheter.json', DATA),
};
const les = (url, standard) => (existsSync(url) ? JSON.parse(readFileSync(url, 'utf8')) : standard);
const skriv = (url, verdi) => writeFileSync(url, `${JSON.stringify(verdi, null, 2)}\n`);

const eksport = JSON.parse(readFileSync(eksportSti, 'utf8'));
if (!Array.isArray(eksport)) stopp('Eksporten er ikke en liste med tiltak.');
const forrige = les(FIL.tiltak, []);
const gammeltAlias = les(FIL.alias, {});
const navnetabell = les(FIL.navn, {});

function stopp(melding, linjer = []) {
  console.error(`\nImporten er stoppet. ${melding}`);
  for (const l of linjer) console.error(`  - ${l}`);
  console.error('Ingen filer er skrevet.');
  process.exit(1);
}

// 1. Rensing
const rensede = eksport.map(rensRad);
const ukjente = rensede.flatMap((r) => r.ukjente);
const aliasBrukt = rensede.reduce((sum, r) => sum + r.alias, 0);
const utenId = rensede.filter((r) => !r.tiltak.id).map((r) => r.tiltak.navn || '(uten navn)');
if (utenId.length > 0) stopp('Tiltak uten id i eksporten:', utenId);
const sett = new Set();
const dobleId = rensede.filter((r) => sett.size === sett.add(r.tiltak.id).size).map((r) => r.tiltak.navn);
if (dobleId.length > 0) stopp('Samme id brukt flere ganger i eksporten:', dobleId);

// 2. Nummererte varianter slås sammen til ett tiltak per produkt
const { rader, sammenslaatt, erstattet } = slaaSammenVarianter(rensede.map((r) => r.tiltak));

// 3. Registernavnene føres i tabellen, så den som kuraterer ser hva som skal navngis
for (const v of rader.flatMap((t) => t.virksomheter)) {
  if (!v.orgnr) continue;
  navnetabell[v.orgnr] = { ...navnetabell[v.orgnr], registernavn: v.navn };
}

// 4. Uten gyldig fagområde holdes tiltaket tilbake
const gyldigFagomrade = (t) => FAGOMRADER.includes(t.fagomrade);
const holdtTilbake = rader.filter((t) => !gyldigFagomrade(t));
const kandidater = rader.filter(gyldigFagomrade);

// 5. Visningsnavn
const navngitt = kandidater.map((t) => settVisningsnavn(t, navnetabell));
const manglerNavn = navngitt.flatMap(({ tiltak, mangler }) =>
  mangler.map((v) => `${tiltak.navn}: ${v.orgnr ? `orgnr ${v.orgnr}` : 'uten orgnr'} (${v.navn || 'uten navn'})`),
);
if (manglerNavn.length > 0) {
  stopp('Disse publiserte virksomhetene mangler navn i ki-tiltak-virksomheter.json:', manglerNavn);
}
const publisert = sorterPaaNavn(navngitt.map((n) => n.tiltak));

const ukjentFase = publisert.filter((t) => t.fase && !FASER.includes(t.fase)).map((t) => `${t.navn}: ${t.fase}`);
if (ukjentFase.length > 0) stopp('Ukjent fase, som ville stoppet sida:', ukjentFase);

// 6. Id-tabellen
const id = oppdaterIdAlias({
  forrige: forrige.map((t) => ({ id: t.id, navn: t.navn })),
  publisert,
  alias: gammeltAlias,
  erstattet,
});

// 7. Rapport
const holdtTilbakeManglerNavn = holdtTilbake
  .flatMap((t) => settVisningsnavn(t, navnetabell).mangler)
  .filter((v) => v.orgnr);
const avsnitt = (tittel, linjer) => {
  console.log(`\n${tittel}`);
  for (const l of linjer.length > 0 ? linjer : ['ingen']) console.log(`  - ${l}`);
};
console.log(`KI-tiltak fra ${eksportSti}`);
console.log(`  i eksporten:        ${eksport.length}`);
console.log(`  publisert:          ${publisert.length}`);
console.log(`  holdt tilbake:      ${holdtTilbake.length}`);
console.log(`  slått sammen:       ${sammenslaatt.length} produkter fra ${sammenslaatt.reduce((s, x) => s + x.varianter.length, 0)} varianter`);
console.log(`  ny id siden forrige fil: ${id.nyId.length} av ${forrige.length}`);
console.log(`  id-tabellen:        ${Object.keys(id.alias).length} gamle id-er`);
console.log(`  KI-type-alias brukt: ${aliasBrukt}`);
avsnitt(
  'Holdt tilbake (uten fagområde):',
  holdtTilbake.map((t) => (t.fagomrade ? `${t.navn} (ukjent fagområde: ${t.fagomrade})` : t.navn)),
);
avsnitt(
  'Slått sammen:',
  sammenslaatt.map(
    (s) =>
      `${s.navn} <- ${s.varianter.join(', ')}` +
      (s.beskrivelser > 1 ? `. ${s.beskrivelser} beskrivelser satt sammen` : '') +
      (s.faseUtelatt ? '. Ulik fase, utelatt' : '') +
      (s.fagomradeUlikt ? '. Ulikt fagområde, første brukt' : ''),
  ),
);
avsnitt('Fikk ny id:', id.nyId.map((e) => e.navn));
avsnitt('Forsvant fra forrige fil (ingen treff på id eller navn):', id.forsvunnet);
avsnitt('Fjernet fra id-tabellen (målet er ikke publisert):', id.fjernet);
avsnitt('Ukjente verdier:', ukjente.map((u) => `${u.navn}: ${u.felt} «${u.verdi}»`));
avsnitt(
  'Mangler visningsnavn, blant de som holdes tilbake:',
  [...new Set(holdtTilbakeManglerNavn.map((v) => `orgnr ${v.orgnr} (${v.navn})`))],
);
const forslag = Object.entries(navnetabell).filter(([, v]) => v.forslag).map(([o, v]) => `${o} ${v.navn}`);
avsnitt('Navn som er forslag til redaksjonen:', forslag);

if (bareRapport) {
  console.log('\n--bare-rapport: ingen filer er skrevet.');
} else {
  skriv(FIL.tiltak, publisert.map(tilFilformat));
  skriv(FIL.alias, id.alias);
  skriv(
    FIL.navn,
    Object.fromEntries(
      Object.entries(navnetabell)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([orgnr, { navn, forslag: f, registernavn }]) => [
          orgnr,
          { ...(navn && { navn }), ...(f && { forslag: true }), ...(registernavn && { registernavn }) },
        ]),
    ),
  );
  console.log('\nSkrev ki-tiltak.json, ki-tiltak-id-alias.json og ki-tiltak-virksomheter.json.');
}
