#!/usr/bin/env node
// Counts the content a CMS environment delivers through the Delivery API. Used before and after
// a CMS deploy, to see that the content is unchanged and that no blocks have lost
// their type (uSync re-keying gives blocks with contentType "Unsupported").
//
// Usage:
//   node scripts/cms-telling.mjs cms.ki.norge.no           count
//   node scripts/cms-telling.mjs cms.ki.test.norge.no
//   node scripts/cms-telling.mjs cms.ki.norge.no --noder   one line per node, for diff before/after
//
// The Delivery API answers 200 with an empty list if Umbraco has skipped a
// migration, so "nodes=0" is an error, not an empty environment.

const [vert, valg] = process.argv.slice(2);
if (!vert) {
  console.error('Usage: node scripts/cms-telling.mjs <cms-host> [--noder]');
  process.exit(2);
}

const url = `https://${vert}/umbraco/delivery/api/v2/content?take=500&expand=properties%5B%24all%5D&cb=${Date.now()}`;
const svar = await fetch(url, { headers: { Accept: 'application/json' } });
if (!svar.ok) {
  console.error(`${vert} answered ${svar.status}`);
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

console.log(`${vert}: nodes=${data.total} blocks=${blokker} types=${typer.size} unsupported=${unsupported}`);
if (data.total === 0 || unsupported > 0) process.exit(1);
