import type { APIRoute } from 'astro';

/**
 * Readiness probe — process is alive AND can talk to CMS.
 * Used by Container Apps to decide whether to send traffic.
 * Returns 503 if CMS Delivery API isn't reachable.
 */

const CMS_URL = import.meta.env.UMBRACO_PUBLIC_URL || import.meta.env.UMBRACO_URL || 'https://kinorgeportal.prod.dis-core.altinn.cloud';

export const GET: APIRoute = async () => {
  const ts = new Date().toISOString();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${CMS_URL}/api/health`, { signal: controller.signal });
    clearTimeout(t);
    if (!r.ok) {
      return Response.json({ status: 'not_ready', cms: r.status, ts }, { status: 503 });
    }
    return Response.json({ status: 'ready', ts }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : 'unknown';
    return Response.json({ status: 'not_ready', reason, ts }, { status: 503 });
  }
};
