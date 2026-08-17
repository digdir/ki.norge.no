import type { APIRoute } from 'astro';
import { buildSkills, buildSkillsIndex } from '../../../lib/agent-skills';
import { isProdHost, CANONICAL_SITE_URL } from '../../../lib/prod-hosts';

export const GET: APIRoute = async ({ url }) => {
  const base = isProdHost(url.hostname) ? CANONICAL_SITE_URL : url.origin;

  try {
    const body = buildSkillsIndex(await buildSkills(base));
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('[agent-skills] index feilet', error);
    return new Response('Agent skills-indeksen er ikke tilgjengelig.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
};
