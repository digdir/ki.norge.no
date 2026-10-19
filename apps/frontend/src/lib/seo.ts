import { CANONICAL_SITE_URL } from './prod-hosts';

// Used to read import.meta.env.SITE_URL. It is set to http://localhost:4321
// in dev and baked into the prod build, so all structured data in production pointed to
// localhost. The canonical domain is the same regardless of environment, and therefore lives in
// prod-hosts.ts together with the same warning.
const SITE_URL = CANONICAL_SITE_URL;
const SITE_NAME = 'KI Norge';

const publisher = {
  '@type': 'Organization' as const,
  name: SITE_NAME,
  url: SITE_URL,
};

export function websiteSchema(description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description,
  };
}

// Artikler, enkle veiledninger and stegartikler use the same schema, but live at
// different paths. The page therefore sends its own path, the same as the canonical link.
export function articleSchema(opts: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.headline,
    description: opts.description,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified || opts.datePublished,
    url: `${SITE_URL}${opts.path}`,
    publisher,
  };
}

export function faqPageSchema(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/**
 * For Eksempel (case study) detail pages. Schema.org doesn't have a "CaseStudy"
 * type but Article + about works well.
 */
export function eksempelSchema(opts: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  organization?: string;
}) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.headline,
    description: opts.description,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified || opts.datePublished,
    url: `${SITE_URL}${opts.path}`,
    publisher,
  };
  if (opts.organization) {
    data.about = { '@type': 'Organization', name: opts.organization };
  }
  return data;
}

/**
 * CollectionPage with ItemList for the overview pages (/veiledning, /artikler,
 * /eksempler, /kalender). The detail pages had Article + BreadcrumbList, while
 * the overviews had no structured data at all. For an agent it is
 * precisely the overview that answers "what is here", so the list of members is
 * the useful part.
 */
export function collectionPageSchema(opts: {
  name: string;
  description?: string;
  url: string;
  items: { name: string; url: string }[];
}) {
  const absolute = (url: string) => (url.startsWith('http') ? url : `${SITE_URL}${url}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: opts.name,
    ...(opts.description ? { description: opts.description } : {}),
    url: absolute(opts.url),
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
    publisher,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: opts.items.length,
      itemListElement: opts.items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: absolute(item.url),
      })),
    },
  };
}

/**
 * BreadcrumbList for nested pages. Helps search engines understand
 * site hierarchy and shows breadcrumbs in SERP results.
 */
export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
    })),
  };
}
