// The selection logic for the front page modules, separated from the template so it can be tested
// without rendering HTML. The rule is the same everywhere: an empty field means nothing.
// Nothing is filled automatically, and a module without content is not rendered.
import { getCardImage, velgKortbilde, type CardImage, type ForsideKort, type ForsideSeksjon, type UmbracoMedia, type VeiledningGuide } from './umbraco';

export const MAKS_AKTUELT_KORT = 3;

export interface AktueltKort {
  tittel: string;
  href: string;
  lead?: string;
  image?: CardImage;
  publishedAt?: string;
}

export interface EksempelKort {
  href: string;
  title: string;
  lead?: string;
}

export interface Lenke {
  href: string;
  tekst: string;
}

export interface AktueltInnhold {
  featured: AktueltKort | null;
  kort: AktueltKort[];
  lenke: Lenke | null;
}

export interface LaerAvAndreInnhold {
  kort: EksempelKort[];
  lenke: Lenke | null;
}

export interface VeiledningInnhold {
  tittel: string;
  ingress?: string;
  href: string;
  image?: CardImage;
  label?: string;
}

// The picker in Aktuelt is unfiltered, so the editor can pick more than articles.
// Everything that can be looked up here gets a card. Content outside the sources is dropped.
export interface AktueltKilder {
  artikler: any[];
  enkleVeiledninger?: any[];
  veiledninger?: VeiledningGuide[];
  eksempler?: any[];
  // Pre-resolved cards for content that is not in the lists above, e.g. steps and
  // stegartikler nested under a guide. Their URL requires ancestors, so it is
  // resolved by the caller via hentKortKandidat. The key is the node id.
  ekstra?: Map<string, { tittel: string; href: string; ingress?: string; lenkekortBilde?: any; artikkelBilde?: any; publishedAt?: string }>;
}

// The link at the bottom of a module requires both text and URL. Text without a URL gives no link,
// instead of an <a> without a target.
export function velgLenke(block: Pick<ForsideSeksjon, 'lenketekst' | 'lenkeUrl'>): Lenke | null {
  return block.lenketekst && block.lenkeUrl ? { href: block.lenkeUrl, tekst: block.lenketekst } : null;
}

// Pool content has ingress and image fields; the cards use lead/image.
// The image follows velgKortbilde: override on the card, then lenkekortbilde, then
// the main image. Without a match the card renders the default image itself.
function tilAktueltKort(a: any, href: string, ingressOverride?: string, bildeOverride?: UmbracoMedia): AktueltKort {
  return {
    tittel: a.tittel,
    href,
    lead: ingressOverride || a.lead || a.ingress,
    image: a.image || velgKortbilde(a, bildeOverride),
    publishedAt: a.publishedAt,
  };
}

// Each source knows where its content lives, so the card links to where the chosen item actually is.
function finnAktuelt(id: string, kilder: AktueltKilder, ingressOverride?: string, bildeOverride?: UmbracoMedia): AktueltKort | null {
  const artikkel = kilder.artikler.find((a) => a.id === id);
  if (artikkel) return tilAktueltKort(artikkel, `/artikler/${artikkel.slug}`, ingressOverride, bildeOverride);
  const veiledning = kilder.enkleVeiledninger?.find((v) => v.id === id) ?? kilder.veiledninger?.find((v) => v.id === id);
  if (veiledning) return tilAktueltKort(veiledning, `/veiledning/${veiledning.slug}`, ingressOverride, bildeOverride);
  const eksempel = kilder.eksempler?.find((e) => e.id === id);
  if (eksempel) return tilAktueltKort(eksempel, `/eksempler/${eksempel.slug}`, ingressOverride, bildeOverride);
  // Anything else the editor can point to: the type is not in the lists, but the caller
  // has resolved the URL for us. Without this the card disappeared silently.
  const annet = kilder.ekstra?.get(id);
  if (annet) return tilAktueltKort(annet, annet.href, ingressOverride, bildeOverride);
  console.warn(`[forside] Aktuelt points to content that does not exist in the sources (id=${id}), dropping the card`);
  return null;
}

// Editor-picked cards are looked up in the sources. A card without a match is dropped, either because
// the content is deleted or because it is of a type Aktuelt cannot show.
function slaaOppAktuelt(kort: ForsideKort[] | undefined, kilder: AktueltKilder): AktueltKort[] {
  return (kort ?? [])
    .map((k) => (k.id ? finnAktuelt(k.id, kilder, k.ingress, k.bilde) : null))
    .filter((c): c is AktueltKort => c !== null);
}

function slaaOppEksempler(kort: ForsideKort[] | undefined, eksempler: any[]): EksempelKort[] {
  return (kort ?? [])
    .map((k): EksempelKort | null => {
      const eks = k.id ? eksempler.find((e) => e.id === k.id) : undefined;
      return eks
        ? { href: `/eksempler/${eks.slug}`, title: eks.tittel, lead: k.ingress || eks.ingress || undefined }
        : null;
    })
    .filter((c): c is EksempelKort => c !== null);
}

// Fremhevet artikkel alone controls the large article, Kort alone controls the small ones.
// The featured one is not repeated among the cards.
export function velgAktuelt(block: ForsideSeksjon, kilder: AktueltKilder): AktueltInnhold | null {
  const featured = block.fremhevetArtikkelId ? finnAktuelt(block.fremhevetArtikkelId, kilder) : null;
  const kort = slaaOppAktuelt(block.kort, kilder)
    .filter((c) => c.href !== featured?.href)
    .slice(0, MAKS_AKTUELT_KORT);
  const lenke = velgLenke(block);
  if (!featured && kort.length === 0 && !lenke) return null;
  return { featured, kort, lenke };
}

export function velgLaerAvAndre(block: ForsideSeksjon, eksempler: any[]): LaerAvAndreInnhold | null {
  const kort = slaaOppEksempler(block.kort, eksempler);
  const lenke = velgLenke(block);
  if (kort.length === 0 && !lenke) return null;
  return { kort, lenke };
}

// Title, ingress, image and link are inherited from the chosen veiledning, as the field descriptions
// promise. Without a title and link the module has nothing to point to.
export function velgVeiledning(block: ForsideSeksjon, veiledninger: VeiledningGuide[]): VeiledningInnhold | null {
  const valgt = block.veiledningId ? veiledninger.find((v) => v.id === block.veiledningId) : undefined;
  const tittel = block.tittel || valgt?.tittel;
  const href = block.lenkeUrl || (valgt ? `/veiledning/${valgt.slug}` : undefined);
  if (!tittel || !href) return null;
  return {
    tittel,
    ingress: block.ingress || valgt?.ingress,
    href,
    image: getCardImage(block.illustrasjon) ?? velgKortbilde(valgt),
    label: block.label,
  };
}
