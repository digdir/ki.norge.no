const SITE_URL = import.meta.env.SITE_URL || 'https://ki.norge.no';
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
