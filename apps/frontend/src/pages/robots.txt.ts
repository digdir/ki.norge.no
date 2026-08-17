import type { APIRoute } from 'astro';
import { isProdHost } from '../lib/prod-hosts';
import { AI_CRAWLERS, DISALLOWED_PATHS } from '../lib/robots';

function group(userAgents: string[]): string {
  return [
    ...userAgents.map((agent) => `User-agent: ${agent}`),
    '',
    '# Ressurser som må hentes for at siden skal rendres riktig',
    'Allow: /*.css$',
    'Allow: /*.js$',
    'Allow: /*.png$',
    'Allow: /*.jpg$',
    'Allow: /*.jpeg$',
    'Allow: /*.webp$',
    'Allow: /*.svg$',
    '',
    '# Mediebibliotek, admin og interne ruter',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
  ].join('\n');
}

export const GET: APIRoute = ({ url }) => {
  const body = isProdHost(url.hostname)
    ? `# Robots.txt for https://ki.norge.no/
#
# Content-Signal sier hva innholdet kan brukes til, og sendes som HTTP-header
# på hvert svar. Direktivet sto her fram til august 2026, men står ikke i
# robots.txt-spesifikasjonen, så validatorer som Lighthouse og Search Console
# rapporterte hele fila som ugyldig. Se CONTENT_SIGNAL i lib/robots.ts.
#
# AI-crawlerne står i en egen gruppe fordi robots.txt-grupper ikke slås sammen:
# en agent som matcher sitt eget navn ser aldri reglene under "*". Gruppen må
# derfor gjenta de samme Disallow-linjene.

${group(['*'])}

${group(AI_CRAWLERS)}

Sitemap: https://ki.norge.no/sitemap.xml

# Nettstedsoversikt for språkmodeller og agenter
# https://ki.norge.no/llms.txt
#
# Alle sider kan hentes som markdown med Accept: text/markdown
`
    : `# Testmiljø. Crawling her ville gitt søkemotorene feil innhold og
# Siteimprove falske resultater.

User-agent: *
Disallow: /
`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
