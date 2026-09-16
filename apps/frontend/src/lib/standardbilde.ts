// Standardbildet fyller bildeboksen i kort som mangler bilde. Varianten kan
// overstyres med ?standardbilde=<variant> for å sammenligne dem på en ekte
// side. Fjern overstyringen når valget er tatt.
//   logo      burgunder flate med logoen alltid hel
//   gradient  Saras forslag (#738) gjenskapt i CSS, logoen alltid hel
//   banner    OG-banneret beskåret som et vanlig bilde
//   bilde     Saras bilde som sendt, beskåret som et vanlig bilde
export const STANDARDBILDE_VARIANTER = ['logo', 'gradient', 'banner', 'bilde'] as const;
export type StandardbildeVariant = (typeof STANDARDBILDE_VARIANTER)[number];
export const STANDARDBILDE_DEFAULT: StandardbildeVariant = 'logo';

export function velgStandardbilde(url: URL): StandardbildeVariant {
  const valgt = url.searchParams.get('standardbilde') ?? '';
  return (STANDARDBILDE_VARIANTER as readonly string[]).includes(valgt)
    ? (valgt as StandardbildeVariant)
    : STANDARDBILDE_DEFAULT;
}
