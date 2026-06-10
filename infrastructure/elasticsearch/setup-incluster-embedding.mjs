// Provision the in-cluster e5-large embedding endpoint that body_semantic uses
// (inference_id "e5-large-incluster"). Runs inference inside the deployment — no
// Elastic Inference Service / third-party round-trip.
//
// PREREQUISITE: the `multilingual-e5-large` trained model must already be imported
// via Eland (int8, ~1.33 GB) — see README "In-cluster embedding setup".
//
// This script is idempotent:
//   1. starts the trained-model deployment with adaptive allocations, min 1
//      (stays warm — avoids cold-start latency on the interactive search box),
//   2. creates the `e5-large-incluster` inference endpoint referencing it,
//   3. probes it.
//
// Run: node --env-file=.env setup-incluster-embedding.mjs

const ES_ENDPOINT = (process.env.ES_ENDPOINT || '').replace(/\/$/, '');
const ES_API_KEY = process.env.ES_API_KEY || '';
const MODEL = process.env.KI_EMBED_MODEL || 'multilingual-e5-large';
const ENDPOINT = process.env.KI_EMBED_ID || 'e5-large-incluster';

if (!ES_ENDPOINT || !ES_API_KEY) {
  console.error('Missing ES_ENDPOINT / ES_API_KEY — see .env.example');
  process.exit(1);
}

const headers = { Authorization: `ApiKey ${ES_API_KEY}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ADAPTIVE = { enabled: true, min_number_of_allocations: 1, max_number_of_allocations: 8 };

// 1. Start the deployment (a custom model must be deployed before an inference
//    endpoint can reference it). Idempotent: a 409 means it's already started.
let res = await fetch(
  `${ES_ENDPOINT}/_ml/trained_models/${MODEL}/deployment/_start?wait_for=started&timeout=180s`,
  { method: 'POST', headers, body: JSON.stringify({ adaptive_allocations: ADAPTIVE }) },
);
if (!res.ok && res.status !== 409) throw new Error(`start deployment ${res.status}: ${await res.text()}`);
console.log(`✓ deployment '${MODEL}' started (or already running)`);

// 2. Create the inference endpoint (idempotent: ignore "already exists").
res = await fetch(`${ES_ENDPOINT}/_inference/text_embedding/${ENDPOINT}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    service: 'elasticsearch',
    service_settings: { model_id: MODEL, num_threads: 1, adaptive_allocations: ADAPTIVE },
  }),
});
if (!res.ok) {
  const t = await res.text();
  if (!t.includes('already exists') && res.status !== 409) throw new Error(`create endpoint ${res.status}: ${t}`);
  console.log(`✓ endpoint '${ENDPOINT}' already exists`);
} else {
  console.log(`✓ created inference endpoint '${ENDPOINT}'`);
}

// 3. Probe (warm-up may take a few seconds the first time).
for (let a = 0; a < 12; a++) {
  res = await fetch(`${ES_ENDPOINT}/_inference/${ENDPOINT}`, { method: 'POST', headers, body: JSON.stringify({ input: 'kunstig intelligens' }) });
  if (res.ok) {
    const e = await res.json();
    console.log(`✓ embedding OK — dims=${e.text_embedding?.[0]?.embedding?.length}`);
    process.exit(0);
  }
  await sleep(4000);
}
throw new Error(`probe failed: ${res.status} ${await res.text()}`);
