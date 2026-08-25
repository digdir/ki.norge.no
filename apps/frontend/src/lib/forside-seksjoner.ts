// Utvelgelseslogikken for forsidens moduler, skilt fra malen så den kan testes
// uten å rendre HTML. Regelen er den samme overalt: et tomt felt betyr ingenting.
// Ingenting fylles automatisk, og en modul uten innhold rendres ikke.
import { getCardImage, type CardImage, type ForsideKort, type ForsideSeksjon, type VeiledningGuide } from './umbraco';

export const MAKS_AKTUELT_KORT = 3;

export interface ArtikkelKort {
  tittel: string;
  slug: string;
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
  featured: ArtikkelKort | null;
  kort: ArtikkelKort[];
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

// Lenka nederst i en modul krever både tekst og URL. Tekst uten URL gir ingen lenke,
// i stedet for en <a> uten mål.
export function velgLenke(block: Pick<ForsideSeksjon, 'lenketekst' | 'lenkeUrl'>): Lenke | null {
  return block.lenketekst && block.lenkeUrl ? { href: block.lenkeUrl, tekst: block.lenketekst } : null;
}

// Pool-artikler har ingress/artikkelBilde; kortene bruker lead/image.
function artikkelTilKort(a: any, ingressOverride?: string): ArtikkelKort {
  return {
    tittel: a.tittel,
    slug: a.slug,
    lead: ingressOverride || a.lead || a.ingress,
    image: a.image || getCardImage(a.artikkelBilde),
    publishedAt: a.publishedAt,
  };
}

// Redaktørvalgte kort slås opp i poolen. Et kort uten treff droppes, enten fordi
// artikkelen er slettet eller fordi den ligger utenfor poolen siden hentes med.
function slaaOppArtikler(kort: ForsideKort[] | undefined, artikler: any[]): ArtikkelKort[] {
  return (kort ?? [])
    .map((k) => {
      const artikkel = k.id ? artikler.find((a) => a.id === k.id) : undefined;
      return artikkel ? artikkelTilKort(artikkel, k.ingress) : null;
    })
    .filter((c): c is ArtikkelKort => c !== null);
}

function slaaOppEksempler(kort: ForsideKort[] | undefined, eksempler: any[]): EksempelKort[] {
  return (kort ?? [])
    .map((k) => {
      const eks = k.id ? eksempler.find((e) => e.id === k.id) : undefined;
      return eks
        ? { href: `/eksempler/${eks.slug}`, title: eks.tittel, lead: k.ingress || eks.ingress || undefined }
        : null;
    })
    .filter((c): c is EksempelKort => c !== null);
}

// Fremhevet artikkel styrer den store artikkelen alene, Kort styrer de små alene.
// Den fremhevede gjentas ikke blant kortene.
export function velgAktuelt(block: ForsideSeksjon, artikler: any[]): AktueltInnhold | null {
  const fremhevet = block.fremhevetArtikkelId
    ? artikler.find((a) => a.id === block.fremhevetArtikkelId)
    : undefined;
  const featured = fremhevet ? artikkelTilKort(fremhevet) : null;
  const kort = slaaOppArtikler(block.kort, artikler)
    .filter((c) => c.slug !== featured?.slug)
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

// Tittel, ingress, bilde og lenke arves fra valgt veiledning, slik feltbeskrivelsene
// lover. Uten tittel og lenke har modulen ingenting å peke på.
export function velgVeiledning(block: ForsideSeksjon, veiledninger: VeiledningGuide[]): VeiledningInnhold | null {
  const valgt = block.veiledningId ? veiledninger.find((v) => v.id === block.veiledningId) : undefined;
  const tittel = block.tittel || valgt?.tittel;
  const href = block.lenkeUrl || (valgt ? `/veiledning/${valgt.slug}` : undefined);
  if (!tittel || !href) return null;
  return {
    tittel,
    ingress: block.ingress || valgt?.ingress,
    href,
    image: getCardImage(block.illustrasjon) ?? getCardImage(valgt?.seoBilde),
    label: block.label,
  };
}
