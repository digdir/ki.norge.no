// "Flere artikler" under an article or an eksempel. The cards show
// publishedAt, so they are picked and sorted on the same field. The API sorts on
// updateDate, and then an old article that was just corrected can push out a
// newer one.
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
