import type { APIRoute } from 'astro';

// RFC 9116 — https://www.rfc-editor.org/rfc/rfc9116
// Expires must be updated at least once a year.
const content = `Contact: mailto:sikkerhet@digdir.no
Canonical: https://ki.norge.no/.well-known/security.txt
Expires: 2027-06-10T00:00:00Z
Preferred-Languages: nb, en
Acknowledgments: https://www.digdir.no/digdir/responsible-disclosure-policy/6386#acknowledgments
Policy: https://www.digdir.no/digdir/responsible-disclosure-policy/6386
`;


export const GET: APIRoute = () => {
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
