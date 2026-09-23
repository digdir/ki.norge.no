/**
 * Merkelappene redaktøren setter på et eksempel: sektor og type KI.
 *
 * Ordlistene eies av CMS-et (avkrysningslister), og type KI bruker de samme
 * ordene som KI_TYPER i ki-tiltak.ts. Frontend har derfor ingen egen liste,
 * og viser verdiene i rekkefølgen CMS-et leverer dem.
 */

/** Tåler både liste og enkeltverdi. Alt annet, og tomme verdier, gir tom liste. */
export function tekstliste(value: unknown): string[] {
  const verdier = Array.isArray(value) ? value : [value];
  return verdier
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Sektor først, så type KI. Tomme felt gir ingen merkelapp. */
export function eksempelMerkelapper(eksempel: { sektor?: string[]; kiType?: string[] }): string[] {
  return [...new Set([...(eksempel.sektor ?? []), ...(eksempel.kiType ?? [])])];
}
