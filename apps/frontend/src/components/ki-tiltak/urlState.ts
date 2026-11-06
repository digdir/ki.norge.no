import { FILTERGRUPPER, FILTERVALG, TOMT_FILTER, type FilterGruppe, type KiTiltakFilter } from '../../lib/ki-tiltak';

/**
 * Search, filters and page live in the query string, so a filtered view can be
 * shared, bookmarked and reached again with the back button. The names are
 * Norwegian, since visitors see them in the address bar. A group with several
 * values repeats its parameter (?fase=A&fase=B).
 */
export const SOK_PARAM = 'sok';
export const SIDE_PARAM = 'side';
export const GRUPPE_PARAM: Record<FilterGruppe, string> = {
  fagomrade: 'fagomrade',
  fase: 'fase',
  leveranse: 'leveranse',
  kiType: 'kitype',
};

export interface UrlTilstand {
  filter: KiTiltakFilter;
  /** 1-based. Clamped to the number of pages where it is used, since that depends on the hits. */
  page: number;
}

/** Reads the state from a query string. Unknown filter values, from old or edited links, are dropped. */
export function lesUrlTilstand(params: URLSearchParams): UrlTilstand {
  const filter: KiTiltakFilter = { ...TOMT_FILTER, query: params.get(SOK_PARAM) ?? '' };
  for (const gruppe of FILTERGRUPPER) {
    const gyldige = FILTERVALG[gruppe];
    filter[gruppe] = [...new Set(params.getAll(GRUPPE_PARAM[gruppe]))].filter((v) => gyldige.includes(v));
  }

  const side = Number.parseInt(params.get(SIDE_PARAM) ?? '', 10);
  return { filter, page: Number.isFinite(side) && side > 1 ? side : 1 };
}

/**
 * Returns a copy of the url with the state written in. Other parameters, such as
 * ?tiltak=, are left alone. Empty values and page 1 are left out, so the plain
 * page keeps its plain address.
 */
export function skrivUrlTilstand(url: URL, { filter, page }: UrlTilstand): URL {
  const ny = new URL(url);
  ny.searchParams.delete(SOK_PARAM);
  ny.searchParams.delete(SIDE_PARAM);
  for (const gruppe of FILTERGRUPPER) ny.searchParams.delete(GRUPPE_PARAM[gruppe]);

  if (filter.query.trim()) ny.searchParams.set(SOK_PARAM, filter.query);
  for (const gruppe of FILTERGRUPPER) {
    for (const verdi of filter[gruppe]) ny.searchParams.append(GRUPPE_PARAM[gruppe], verdi);
  }
  if (page > 1) ny.searchParams.set(SIDE_PARAM, String(page));
  return ny;
}
