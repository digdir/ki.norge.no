// Lager bilde-URL, srcset og mål for et CMS-bilde, med eller uten format. Alle
// plasseringer går gjennom lagBilde, så like plasseringer lager URL-en likt.
//
// Med format lager bildeserveren utsnittet i formatets form, rundt fokuspunktet
// fra Media. Rekkefølgen i URL-en er den bildeserveren behandler i: rxy før
// width og height, og format før quality, fordi format nullstiller kvaliteten.
// SVG og GIF beskjæres ikke av bildeserveren og leveres som originalen.

import { BILDEFORMATER, UTEN_FORMAT_BREDDER, hoydeFor, type Bildeformat } from './bildeformater';
import { toAbsoluteMediaUrl, type UmbracoMedia } from './umbraco';

export interface Bildekilde {
  src: string;
  srcset?: string;
  width?: number;
  height?: number;
  // Fokuspunktet som object-position, for bilder CSS må kutte selv (SVG og GIF).
  posisjon?: string;
}

const IKKE_BEHANDLET = new Set(['svg', 'gif']);

export function kanBehandles(media: Pick<UmbracoMedia, 'extension'>): boolean {
  return !IKKE_BEHANDLET.has(media.extension?.toLowerCase() ?? '');
}

export function bildeUrl(
  original: string,
  media: Pick<UmbracoMedia, 'focalPoint'>,
  bredde: number,
  format?: Bildeformat,
  filtype: 'webp' | 'jpg' = 'webp',
): string {
  const fp = media.focalPoint;
  const parametre = [
    format && fp ? `rxy=${fp.left},${fp.top}` : '',
    `width=${bredde}`,
    format ? `height=${hoydeFor(format, bredde)}` : '',
    `format=${filtype}`,
    'quality=80',
  ].filter(Boolean);
  return `${original}${original.includes('?') ? '&' : '?'}${parametre.join('&')}`;
}

// Ber aldri om flere piksler enn originalen har i formatets form, så
// bildeserveren ikke forstørrer. Den største bredden originalen tåler, tas med.
function bredderFor(media: UmbracoMedia, format?: Bildeformat): number[] {
  const kandidater: readonly number[] = format ? BILDEFORMATER[format].bredder : UTEN_FORMAT_BREDDER;
  if (!media.width || !media.height) return [...kandidater];
  const [fb, fh] = format ? BILDEFORMATER[format].form : [media.width, media.height];
  const maks = Math.max(1, Math.floor(Math.min(media.width, (media.height * fb) / fh)));
  const innenfor = kandidater.filter((b) => b <= maks);
  return innenfor.length < kandidater.length && innenfor[innenfor.length - 1] !== maks ? [...innenfor, maks] : innenfor;
}

export function lagBilde(media: UmbracoMedia | undefined, format?: Bildeformat): Bildekilde | undefined {
  const original = toAbsoluteMediaUrl(media?.url);
  if (!media || !original) return undefined;

  const fp = media.focalPoint;
  const posisjon = fp ? `${fp.left * 100}% ${fp.top * 100}%` : undefined;

  if (!original.startsWith('http') || !kanBehandles(media)) {
    return {
      src: original,
      width: media.width,
      height: format && media.width ? hoydeFor(format, media.width) : media.height,
      posisjon,
    };
  }

  const bredder = bredderFor(media, format);
  const storst = bredder[bredder.length - 1];
  return {
    src: bildeUrl(original, media, storst, format),
    srcset: bredder.map((b) => `${bildeUrl(original, media, b, format)} ${b}w`).join(', '),
    width: storst,
    height: format ? hoydeFor(format, storst) : media.width && media.height ? Math.round((storst * media.height) / media.width) : undefined,
    posisjon,
  };
}
