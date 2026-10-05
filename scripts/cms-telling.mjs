#!/usr/bin/env node
// Teller innholdet et CMS-miljø leverer gjennom Delivery API. Brukes før og etter
// en CMS-deploy, for å se at innholdet er uendret og at ingen blokker har mistet
// typen sin (uSync-re-nøkling gir blokker med contentType «Unsupported»).
//
// Bruk:
//   node scripts/cms-telling.mjs cms.ki.norge.no           telling
//   node scripts/cms-telling.mjs cms.ki.test.norge.no
//   node scripts/cms-telling.mjs cms.ki.norge.no --noder   én linje per node, for diff før/etter
//
// Delivery API svarer 200 med en tom liste hvis Umbraco har hoppet over en
// migrering, så «noder=0» er en feil, ikke et tomt miljø.

const [vert, valg] = process.argv.slice(2);
if (!vert) {
  console.error('Bruk: node scripts/cms-telling.mjs <cms-vert> [--noder]');
  process.exit(2);
}

const url = `https://${vert}/umbraco/delivery/api/v2/content?take=500&expand=properties%5B%24all%5D&cb=${Date.now()}`;
const svar = await fetch(url, { headers: { Accept: 'application/json' } });
if (!svar.ok) {
  console.error(`${vert} svarte ${svar.status}`);
  process.exit(1);
}
const data = await svar.json();

if (valg === '--noder') {
  for (const linje of data.items.map((i) => `${i.id} ${i.contentType} ${i.route?.path ?? ''} ${JSON.stringify(i.properties).length}`).sort()) {
    console.log(linje);
  }
  process.exit(0);
}

let blokker = 0;
let unsupported = 0;
const typer = new Set();
const gå = (o) => {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) return o.forEach(gå);
  if (o.contentType) {
    blokker++;
    typer.add(o.contentType);
    if (/unsupported/i.test(o.contentType)) unsupported++;
  }
  Object.values(o).forEach(gå);
};
data.items.forEach((i) => gå(i.properties));

console.log(`${vert}: noder=${data.total} blokker=${blokker} typer=${typer.size} unsupported=${unsupported}`);
if (data.total === 0 || unsupported > 0) process.exit(1);
