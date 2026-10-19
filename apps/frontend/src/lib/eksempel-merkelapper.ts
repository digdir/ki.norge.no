/**
 * The labels the editor puts on an eksempel: sector and type of AI.
 *
 * Both are Tags fields in the CMS, i.e. free text where the suggestions are tags
 * used before in the same group. The frontend therefore has no word list of its own,
 * and shows the values in the order the CMS delivers them.
 */

/** Handles both a list and a single value. Anything else, and empty values, give an empty list. */
export function tekstliste(value: unknown): string[] {
  const verdier = Array.isArray(value) ? value : [value];
  return verdier
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Sector first, then type of AI. Empty fields give no label. */
export function eksempelMerkelapper(eksempel: { sektor?: string[]; kiType?: string[] }): string[] {
  return [...new Set([...(eksempel.sektor ?? []), ...(eksempel.kiType ?? [])])];
}
