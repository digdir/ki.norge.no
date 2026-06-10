// Local (re)build of the search index from the Umbraco Delivery API — the
// dev/backfill counterpart to the CMS push ingestion. The mapping is owned by
// the index template (apply-templates.mjs); this only writes documents, keyed by
// content GUID so docs embed via the in-cluster e5-large endpoint at index time.
//
//   node --env-file=.env rebuild-from-umbraco.mjs            # upsert by GUID (no drop)
//   node --env-file=.env rebuild-from-umbraco.mjs --rebuild  # DELETE the index first, then rebuild
//
// Env: UMBRACO_URL / UMBRACO_PUBLIC_URL, ES_ENDPOINT, ES_API_KEY, KI_INDEX (default ki-content).
//
// SAFETY: this writes to KI_INDEX, and --rebuild DELETES it first. Apply the
// templates (apply-templates.mjs) beforehand so a recreated index gets the
// correct hybrid mapping. Plain upsert assumes the index already uses GUID _ids
// (a fresh --rebuild does); upserting onto a random-_id index would duplicate.

import { extractAll } from './crawl-umbraco.mjs';

const ES = (process.env.ES_ENDPOINT || '').replace(/\/$/, '');
const KEY = process.env.ES_API_KEY || '';
const INDEX = process.env.KI_INDEX || 'ki-content';
const REBUILD = process.argv.includes('--rebuild');

if (!ES || !KEY) {
  console.error('Missing ES_ENDPOINT / ES_API_KEY — see .env.example');
  process.exit(1);
}
const headers = { Authorization: `ApiKey ${KEY}`, 'Content-Type': 'application/json' };

console.log(`→ extracting from Umbraco Delivery API (${process.env.UMBRACO_URL || 'https://cms.ki.norge.no'})…`);
const docs = await extractAll();
const byType = {};
for (const d of docs) byType[d.type] = (byType[d.type] ?? 0) + 1;
console.log(`  extracted ${docs.length} docs:`, JSON.stringify(byType));

if (REBUILD) {
  const del = await fetch(`${ES}/${INDEX}`, { method: 'DELETE', headers });
  console.log(`→ --rebuild: deleted '${INDEX}' (${del.status}); the template auto-recreates it on first write`);
}

console.log(`→ indexing into '${INDEX}' (semantic_text embeds via the in-cluster endpoint at index time)…`);
const CHUNK = 50;
let n = 0;
for (let i = 0; i < docs.length; i += CHUNK) {
  const slice = docs.slice(i, i + CHUNK);
  const ndjson = slice.flatMap((d) => [
    JSON.stringify({ index: { _index: INDEX, _id: d.id } }),
    JSON.stringify({ title: d.title, url: d.url, body: d.body, language: d.language, type: d.type }),
  ]).join('\n') + '\n';
  const res = await fetch(`${ES}/_bulk`, { method: 'POST', headers, body: ndjson });
  if (!res.ok) throw new Error(`bulk ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (j.errors) {
    const e = j.items.find((it) => it.index && it.index.error);
    throw new Error(`bulk had errors: ${JSON.stringify(e?.index?.error)}`);
  }
  n += slice.length;
  console.log(`  indexed ${n}/${docs.length}`);
}
await fetch(`${ES}/${INDEX}/_refresh`, { method: 'POST', headers });
const count = (await (await fetch(`${ES}/${INDEX}/_count`, { headers })).json()).count;
console.log(`✓ done — '${INDEX}' now holds ${count} docs`);
