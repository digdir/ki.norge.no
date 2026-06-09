// Apply the ki-content index-as-code templates (component + index template) to
// Elasticsearch. The index shape lives in the JSON files alongside this script —
// edit those, then run this to register/update them. Zero dependencies (Node 22 fetch).
//
//   node --env-file=.env apply-templates.mjs
//
// Env: ES_ENDPOINT, ES_API_KEY (required); KI_EMBED_ID (optional — override the
// semantic_text inference endpoint). The CMS writes documents into ki-content but
// never owns its mapping; an index matching ki-content* auto-creates with this
// mapping on first write. Recreate from scratch: DELETE {ES}/ki-content, re-run
// this, then trigger a full reindex from the CMS backoffice.

import { readFileSync } from 'node:fs';

const ES_ENDPOINT = (process.env.ES_ENDPOINT || '').replace(/\/$/, '');
const ES_API_KEY = process.env.ES_API_KEY || '';

const COMPONENT_TEMPLATE = 'ki-content-mappings';
const INDEX_TEMPLATE = 'ki-content-template';

if (!ES_ENDPOINT || !ES_API_KEY) {
  console.error('Missing ES_ENDPOINT / ES_API_KEY — see .env.example');
  process.exit(1);
}

const headers = { Authorization: `ApiKey ${ES_API_KEY}`, 'Content-Type': 'application/json' };
const loadJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

const componentTemplate = loadJson('./ki-content.component-template.json');
const indexTemplate = loadJson('./ki-content.index-template.json');

// The JSON is the source of truth; KI_EMBED_ID can optionally override it.
if (process.env.KI_EMBED_ID) {
  componentTemplate.template.mappings.properties.body_semantic.inference_id = process.env.KI_EMBED_ID;
}
const EMBED_ID = componentTemplate.template.mappings.properties.body_semantic.inference_id;

async function put(path, body) {
  const res = await fetch(`${ES_ENDPOINT}${path}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
}

await put(`/_component_template/${COMPONENT_TEMPLATE}`, componentTemplate);
await put(`/_index_template/${INDEX_TEMPLATE}`, indexTemplate);
console.log(`✓ applied templates '${COMPONENT_TEMPLATE}' + '${INDEX_TEMPLATE}' (semantic_text → ${EMBED_ID})`);
