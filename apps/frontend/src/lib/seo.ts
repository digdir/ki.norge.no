import { CANONICAL_SITE_URL } from './prod-hosts';

// Leste tidligere import.meta.env.SITE_URL. Den settes til http://localhost:4321
// i dev og bakes inn i prod-bygget, så all strukturert data i produksjon pekte på
// localhost. Det kanoniske domenet er det samme uansett miljø, og bor derfor i
// prod-hosts.ts sammen med den samme advarselen.
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

export function articleSchema(opts: {
  headline: string;
  description: string;
  slug: string;
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
    url: `${SITE_URL}/artikler/${opts.slug}`,
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
 * For Eksempel (case study) detail pages — emits /eksempler/ URLs. Schema.org
 * doesn't have a "CaseStudy" type but Article + about works well.
 */
export function eksempelSchema(opts: {
  headline: string;
  description: string;
  slug: string;
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
    url: `${SITE_URL}/eksempler/${opts.slug}`,
    publisher,
  };
  if (opts.organization) {
    data.about = { '@type': 'Organization', name: opts.organization };
  }
  return data;
}

/**
 * CollectionPage med ItemList for oversiktssidene (/veiledning, /artikler,
 * /eksempler, /kalender). Detaljsidene hadde Article + BreadcrumbList, mens
 * oversiktene stod uten strukturert data i det hele tatt. For en agent er det
 * nettopp oversikten som svarer på "hva finnes her", så lista over medlemmer er
 * den nyttige delen.
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
