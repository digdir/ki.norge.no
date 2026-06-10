// Extract all indexable ki.norge.no content from the public Umbraco Delivery API
// v2 into the { id, title, url, body, language, type } shape the index expects.
// Restored crawler (the dev/backfill counterpart to the CMS push ingestion).
//
// Rich text arrives in several shapes (node trees with #text nodes, {markup}
// objects, double-encoded markup strings). We harvest all text leaves then run a
// universal deep-clean (decode \uXXXX, strip HTML/JSON scaffolding, unescape
// entities). ki.norge.no content is culture-invariant (all bokmål → "nb").
//
// id = the content GUID (Delivery API `id`) — used as the ES _id so it lines up
// with the CMS push (which keys on content.Key) and makes upserts idempotent.

import { readFileSync } from 'node:fs';

const CMS = process.env.UMBRACO_URL || 'https://cms-kinorgeportal-prod.digitaliseringsdirektoratet.workers.dev';
const PUBLIC = process.env.UMBRACO_PUBLIC_URL || 'https://ki.norge.no';
const BASE = `${CMS}/umbraco/delivery/api/v2/content`;

// Frontend route map — shared source of truth (the same content-routes.json the CMS
// ContentRouteResolver + frontend use). Build the public route from contentType + the
// tree-path slug segments, NOT Umbraco's raw tree path, so URLs match /artikler/,
// /veiledning/, etc. Stores RELATIVE paths to match the CMS push output.
const ROUTES = JSON.parse(
  readFileSync(new URL('../../shared/content-routes.json', import.meta.url), 'utf8'),
).routes;

const normPath = (p) => (p ?? '').replace(/\/+$/, '');
const lastSeg = (p) => normPath(p).split('/').filter(Boolean).pop() ?? '';

// Walk the tree (by route-path prefix) to find an ancestor of a given content type and
// return its editor `slug` PROPERTY — not its URL segment, which can differ (ø→o vs
// ø→oe). Mirrors the CMS ContentRouteResolver.CollectAncestorSlugs.
function ancestorSlug(it, byPath, ancestorType) {
  let p = normPath(it.route?.path);
  while (p.includes('/')) {
    p = p.slice(0, p.lastIndexOf('/'));
    const anc = byPath.get(p);
    if (anc && anc.contentType === ancestorType) return anc.properties?.slug || lastSeg(anc.route?.path);
  }
  return undefined;
}

// Public frontend route from content-routes.json, filled with editor slug PROPERTIES
// (own + ancestors). Relative path, matching the CMS push output.
function frontendUrl(it, byPath) {
  const pattern = ROUTES[it.contentType];
  if (!pattern) return normPath(it.route?.path) || '/';
  const ownSlug = it.properties?.slug || lastSeg(it.route?.path);
  let unresolved = false;
  const path = pattern.replace(/\{([a-zA-Z][a-zA-Z0-9]*)(?:\.slug)?\}/g, (_m, key) => {
    if (key === 'slug') return ownSlug;
    const s = ancestorSlug(it, byPath, key);
    if (!s) { unresolved = true; return ''; }
    return s;
  });
  return unresolved ? (normPath(it.route?.path) || '/') : path;
}

// Listing/taxonomy containers + site settings — no real searchable content of their own.
const SKIP_TYPES = new Set([
  'artikler', 'faqSamling', 'ordbokSamling', 'sider', 'caser',
  'veiledninger', 'merkelapper', 'merkelapp', 'forside',
  'globaleInnstillinger', 'eksempler', 'kalender',
]);
// Keys that never carry searchable prose (media, seo, slugs, ids, ordering).
const SKIP_KEYS = new Set([
  'slug', 'guideSlug', 'bakgrunn', 'seoTittel', 'seoBeskrivelse', 'seoBilde',
  'artikkelBilde', 'bilde', 'bildeAlt', 'heroBilde', 'focalPoint', 'crops',
  'mediaType', 'extension', 'width', 'height', 'url', 'id', 'key',
  'contentType', 'kategori', 'rekkefolge', 'steg', 'understeg', 'alias', 'name',
]);

function harvest(v, key, out) {
  if (key && SKIP_KEYS.has(key)) return;
  if (Array.isArray(v)) {
    for (const el of v) harvest(el, key, out);
    return;
  }
  if (v && typeof v === 'object') {
    if (v.tag === '#text') {
      if (typeof v.text === 'string' && v.text) out.push(v.text);
      return;
    }
    for (const [kk, vv] of Object.entries(v)) {
      if (kk === 'tag' || kk === 'attributes') continue;
      harvest(vv, kk, out);
    }
    return;
  }
  if (typeof v === 'string' && v.trim()) out.push(v);
}

function unescapeHtml(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function deepClean(t) {
  t = t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  t = t.replace(/\\n/g, ' ').replace(/\\t/g, ' ').replace(/\\"/g, '"').replace(/\\\//g, '/');
  t = t.replace(/"?(markup|blocks|content|contentType|settings|tag|elements)"?\s*:/g, '');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/[{}[\]]/g, ' ');
  t = unescapeHtml(t);
  return t.replace(/\s+/g, ' ').trim();
}

async function fetchAll() {
  const take = 100;
  let skip = 0;
  const all = [];
  for (;;) {
    const url = `${BASE}?take=${take}&skip=${skip}&expand=${encodeURIComponent('properties[all]')}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Delivery API ${res.status} ${res.statusText} @ skip=${skip}`);
    const data = await res.json();
    all.push(...data.items);
    if (all.length >= data.total || data.items.length === 0) break;
    skip += take;
  }
  return all;
}

function toDoc(it, byPath) {
  const props = it.properties ?? {};
  if (SKIP_TYPES.has(it.contentType) || Object.keys(props).length === 0) return null;
  const title = deepClean(String(props.tittel ?? props.sporsmal ?? props.term ?? it.name ?? ''));
  const parts = [];
  harvest(props, null, parts);
  const body = deepClean(parts.join(' '));
  if (body.length < 20) return null;
  return { id: it.id, title, url: frontendUrl(it, byPath), body, language: 'nb', type: it.contentType };
}

export async function extractAll() {
  const items = await fetchAll();
  const byPath = new Map();
  for (const it of items) {
    const p = (it.route?.path ?? '').replace(/\/+$/, '');
    if (p) byPath.set(p, it);
  }
  return items.map((it) => toDoc(it, byPath)).filter((d) => d !== null);
}
