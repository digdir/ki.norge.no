// «Flere artikler» under en artikkel eller et eksempel. Kortene viser
// publishedAt, så de velges og sorteres på samme felt. API-et sorterer på
// updateDate, og da kan en gammel artikkel som nettopp er rettet, dytte ut en
// nyere.
import { sammenlignPublisertDato } from './umbraco';

export function flereNyeste<T extends { slug: string; publishedAt?: string }>(
  innhold: T[],
  slug: string,
  antall = 3,
): T[] {
  return innhold
    .filter((i) => i.slug !== slug)
    .sort((a, b) => sammenlignPublisertDato({ publishedAt: a.publishedAt }, { publishedAt: b.publishedAt }))
    .slice(0, antall);
}
