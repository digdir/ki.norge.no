import type { APIRoute } from 'astro';
import { httpStatusFor, memoize, runHealthChecks, type HealthConfig } from '../lib/health';

const config: HealthConfig = {
  umbracoUrl: (process.env.UMBRACO_URL || import.meta.env.UMBRACO_URL || 'http://localhost:5000').replace(/\/$/, ''),
  esEndpoint: (process.env.ES_ENDPOINT || import.meta.env.ES_ENDPOINT || '').replace(/\/$/, ''),
  esApiKey: process.env.ES_API_KEY || import.meta.env.ES_API_KEY || '',
  esIndex: process.env.KI_INDEX || import.meta.env.KI_INDEX || 'ki-content',
};

const report = memoize(() => runHealthChecks(config, { fetch, now: Date.now }), Date.now, 15_000);

const HEADERS = {
  'Content-Type': 'application/json',
  // Overvåking skal se tilstanden nå, ikke en kopi fra kanten. Belastningen på
  // CMS-et styres av memoize, ikke av cache.
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

export const GET: APIRoute = async () => {
  const r = await report();
  return new Response(JSON.stringify(r, null, 2), { status: httpStatusFor(r.status), headers: HEADERS });
};

export const HEAD: APIRoute = async () => {
  const r = await report();
  return new Response(null, { status: httpStatusFor(r.status), headers: HEADERS });
};
