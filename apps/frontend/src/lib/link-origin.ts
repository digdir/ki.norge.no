/**
 * Labels internal links with the part of the page they sit in, so the cache worker
 * can count how often each one is used. The label is the same for every visitor and
 * says nothing about who clicked. Why this needs no consent: docs/adr/2026-10-22-link-statistics.md.
 *
 * The cache worker removes the parameter before the cache and the frontend see the
 * request, so a labelled and an unlabelled address share one cache entry.
 */

/** Same name as ORIGIN_PARAM in apps/cache-kinorgeportal/src/link-counts.ts. */
export const ORIGIN_PARAM = 'fra';

/**
 * The parts of the page that are counted. The value is visible in the address bar
 * until the page has loaded, so it is Norwegian. The cache worker only counts values
 * from its own copy of this list, and a test there checks that the two match.
 */
export const LINK_ORIGINS = ['meny', 'meny-mobil', 'logo', 'bunntekst'] as const;

export type LinkOrigin = (typeof LINK_ORIGINS)[number];

/**
 * Adds the origin to an internal path. Anything else is returned unchanged:
 * external and protocol-relative addresses (the label must not leak to other sites),
 * mailto: and tel:, jump links within a page, and empty values.
 */
export function withOrigin(href: string, origin: LinkOrigin): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;

  const hashAt = href.indexOf('#');
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : href.slice(hashAt);

  const queryAt = beforeHash.indexOf('?');
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? '' : beforeHash.slice(queryAt + 1));
  params.set(ORIGIN_PARAM, origin);

  return `${path}?${params.toString()}${hash}`;
}
