import { toAbsoluteMediaUrl, type UmbracoMedia } from './umbraco';

// Delingsbildet (og:image) lages alltid i samme mål og format, så taggene kan
// regnes ut sammen med URL-en i stedet for å skrives fast. Bildeserveren kutter
// rundt fokuspunktet fra Media. SVG og GIF kan ikke beskjæres og gir
// standardbildet.

export interface Delingsbilde {
  url: string;
  width: number;
  height: number;
  type: string;
}

// Versjonen i spørringen tvinger fram nytt bilde i appene som cacher forhåndsvisningen.
export const STANDARD_DELINGSBILDE: Delingsbilde = {
  url: '/og-image.png?v=3c5667a2',
  width: 1200,
  height: 630,
  type: 'image/png',
};

const BREDDE = 1200;
const HOYDE = 630;

export function delingsbilde(media: UmbracoMedia | undefined, siteUrl: string): Delingsbilde {
  const kilde = toAbsoluteMediaUrl(media?.url);
  if (!kilde?.startsWith('http') || /\.(svg|gif)(\?|$)/i.test(kilde)) {
    return { ...STANDARD_DELINGSBILDE, url: `${siteUrl}${STANDARD_DELINGSBILDE.url}` };
  }

  const fp = media?.focalPoint;
  const fokus = fp ? `rxy=${fp.left},${fp.top}&` : '';
  const skille = kilde.includes('?') ? '&' : '?';
  // format må stå før quality. Bildeserveren tar parametrene i rekkefølge, og format nullstiller kvaliteten.
  return {
    url: `${kilde}${skille}${fokus}width=${BREDDE}&height=${HOYDE}&format=jpg&quality=80`,
    width: BREDDE,
    height: HOYDE,
    type: 'image/jpeg',
  };
}
