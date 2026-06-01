#!/usr/bin/env node
// Mock-CMS for lokal frontend-utvikling.
// Speiler Umbraco Delivery API v2 sitt content-endepunkt fra en fanget fixture
// (delivery-content.json), slik at frontend kan kjores uten et ekte CMS.
// Kun ment for utvikling. Fixturen fanges fra en seedet lokal CMS-instans.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(join(here, 'delivery-content.json'), 'utf8'));
const ALL = Array.isArray(DATA.items) ? DATA.items : [];
const PORT = Number(process.env.MOCK_PORT || 5050);

function getField(item, field) {
  if (field === 'name') return item.name;
  if (field === 'createDate' || field === 'updateDate' || field === 'sortOrder') return item[field];
  return item.properties ? item.properties[field] : undefined;
}

// Speiler de query-parametrene umbraco.ts faktisk bruker: filter (contentType),
// sort, take, skip. Andre filtre ignoreres bevisst for ikke a tomme resultater.
function handleCollection(url) {
  let items = ALL.slice();

  for (const f of url.searchParams.getAll('filter')) {
    const idx = f.indexOf(':');
    if (idx === -1) continue;
    const field = f.slice(0, idx);
    const value = f.slice(idx + 1);
    if (field === 'contentType') {
      items = items.filter((it) => it.contentType === value);
    }
  }

  const total = items.length;

  const sort = url.searchParams.get('sort');
  if (sort) {
    const [field, dir = 'asc'] = sort.split(':');
    items.sort((a, b) => {
      const av = getField(a, field);
      const bv = getField(b, field);
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'nb', { numeric: true });
      return dir === 'desc' ? -cmp : cmp;
    });
  }

  const skip = Number(url.searchParams.get('skip') || 0);
  const take = url.searchParams.has('take') ? Number(url.searchParams.get('take')) : items.length;

  return { total, items: items.slice(skip, skip + take) };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const p = url.pathname;

  if (p === '/umbraco/delivery/api/v2/content') {
    res.end(JSON.stringify(handleCollection(url)));
    return;
  }

  const m = p.match(/^\/umbraco\/delivery\/api\/v2\/content\/item\/(.+)$/);
  if (m) {
    const key = decodeURIComponent(m[1]).replace(/^\/+|\/+$/g, '');
    const item = ALL.find(
      (it) => it.id === key || (it.route?.path || '').replace(/^\/+|\/+$/g, '') === key
    );
    if (item) { res.end(JSON.stringify(item)); return; }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  res.end(JSON.stringify({ mock: 'ki-norge', nodes: ALL.length }));
});

server.listen(PORT, () => {
  console.log(`[mock-cms] Delivery API mock paa http://localhost:${PORT} (${ALL.length} noder fra fixture)`);
});
