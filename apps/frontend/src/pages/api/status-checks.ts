/**
 * Status checks endpoint — pings frontend, CMS, and Delivery API.
 * Returns JSON with status + response time for each.
 *
 * Requires ki_admin cookie (enforced by middleware).
 */
import type { APIRoute } from 'astro';

const FRONTEND_URL = 'https://ki-norge-frontend-prod.digitaliseringsdirektoratet.workers.dev';
const CMS_URL = 'https://kinorgeportal.prod.dis-core.altinn.cloud';

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

export const GET: APIRoute = async () => {
  const checks = await Promise.all([
    check('Frontend', FRONTEND_URL),
    check('CMS Backoffice', `${CMS_URL}/umbraco`),
    check('CMS Delivery API', `${CMS_URL}/umbraco/delivery/api/v2/content?take=1`),
    check('ki.norge.no (custom domain)', 'https://ki.norge.no', 5000),
  ]);

  return new Response(JSON.stringify({
    timestamp: new Date().toISOString(),
    checks,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
