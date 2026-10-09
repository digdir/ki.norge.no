import { bildeUrl, kanBehandles } from './bilde';
import { BILDEFORMATER } from './bildeformater';
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

const [BREDDE, HOYDE] = BILDEFORMATER.deling.form;

export function delingsbilde(media: UmbracoMedia | undefined, siteUrl: string): Delingsbilde {
  const kilde = toAbsoluteMediaUrl(media?.url);
  if (!media || !kilde?.startsWith('http') || !kanBehandles(media)) {
    return { ...STANDARD_DELINGSBILDE, url: `${siteUrl}${STANDARD_DELINGSBILDE.url}` };
  }

  return {
    url: bildeUrl(kilde, media, BREDDE, 'deling', 'jpg'),
    width: BREDDE,
    height: HOYDE,
    type: 'image/jpeg',
  };
}
