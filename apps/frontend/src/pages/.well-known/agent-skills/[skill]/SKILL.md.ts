import type { APIRoute } from 'astro';
import { buildSkills } from '../../../../lib/agent-skills';
import { isProdHost, CANONICAL_SITE_URL } from '../../../../lib/prod-hosts';

export const GET: APIRoute = async ({ url, params }) => {
  const base = isProdHost(url.hostname) ? CANONICAL_SITE_URL : url.origin;

  try {
    // Samme cachede generasjon som indeksen, ellers kunne digesten der beskrevet
    // en annen tekst enn den vi serverer her.
    const skill = (await buildSkills(base)).find((s) => s.name === params.skill);
    if (!skill) {
      return new Response('Ukjent skill.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    return new Response(skill.markdown, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('[agent-skills] SKILL.md feilet', error);
    return new Response('Skill er ikke tilgjengelig.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
};
