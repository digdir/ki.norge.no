/**
 * Status checks endpoint — pings frontend, CMS, and Delivery API.
 * Returns JSON with status + response time for each.
 *
 * Requires ki_admin cookie (enforced by middleware).
 *
 * Adressene er miljøets egne, så /status på tt02 måler tt02. CMS-et leses fra
 * samme env-variabel som umbraco.ts, frontenden fra forespørselens origin.
 */
import type { APIRoute } from 'astro';

const CMS_URL = process.env.UMBRACO_URL || import.meta.env.UMBRACO_URL || 'http://localhost:5000';

interface CheckResult {
  name: string;
  url: string;
  status: 'ok' | 'degraded' | 'down';
  httpStatus?: number;
  responseTime?: number;
  error?: string;
}

async function check(name: string, url: string, timeoutMs = 8000): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'ki-norge-status-check' },
    });
    clearTimeout(timeout);
    const responseTime = Date.now() - t0;
    return {
      name,
      url,
      status: res.ok ? (responseTime > 3000 ? 'degraded' : 'ok') : 'degraded',
      httpStatus: res.status,
      responseTime,
    };
  } catch (err) {
    return {
      name,
      url,
      status: 'down',
      responseTime: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const GET: APIRoute = async ({ url }) => {
  const checks = await Promise.all([
    check('Frontend', `${url.origin}/`),
    check('CMS Backoffice', `${CMS_URL}/umbraco`),
    check('CMS Delivery API', `${CMS_URL}/umbraco/delivery/api/v2/content?take=1`),
  ]);

  return new Response(JSON.stringify({
    timestamp: new Date().toISOString(),
    checks,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
