// Utvelgelseslogikken for forsidens moduler, skilt fra malen så den kan testes
// uten å rendre HTML. Regelen er den samme overalt: et tomt felt betyr ingenting.
// Ingenting fylles automatisk, og en modul uten innhold rendres ikke.
import { getCardImage, type CardImage, type ForsideKort, type ForsideSeksjon, type VeiledningGuide } from './umbraco';

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

// Pickeren i Aktuelt er ufiltrert, så redaktøren kan velge mer enn artikler.
// Alt som kan slås opp her får et kort. Innhold utenfor kildene droppes.
export interface AktueltKilder {
  artikler: any[];
  enkleVeiledninger?: any[];
  veiledninger?: VeiledningGuide[];
  eksempler?: any[];
}

// Lenka nederst i en modul krever både tekst og URL. Tekst uten URL gir ingen lenke,
// i stedet for en <a> uten mål.
export function velgLenke(block: Pick<ForsideSeksjon, 'lenketekst' | 'lenkeUrl'>): Lenke | null {
  return block.lenketekst && block.lenkeUrl ? { href: block.lenkeUrl, tekst: block.lenketekst } : null;
}

// Pool-innhold har ingress/artikkelBilde (guider har seoBilde); kortene bruker lead/image.
function tilAktueltKort(a: any, href: string, ingressOverride?: string): AktueltKort {
  return {
    tittel: a.tittel,
    href,
    lead: ingressOverride || a.lead || a.ingress,
    image: a.image || getCardImage(a.artikkelBilde) || getCardImage(a.seoBilde),
    publishedAt: a.publishedAt,
  };
}

// Hver kilde vet hvor innholdet sitt bor, så kortet lenker dit det valgte faktisk ligger.
function finnAktuelt(id: string, kilder: AktueltKilder, ingressOverride?: string): AktueltKort | null {
  const artikkel = kilder.artikler.find((a) => a.id === id);
  if (artikkel) return tilAktueltKort(artikkel, `/artikler/${artikkel.slug}`, ingressOverride);
  const veiledning = kilder.enkleVeiledninger?.find((v) => v.id === id) ?? kilder.veiledninger?.find((v) => v.id === id);
  if (veiledning) return tilAktueltKort(veiledning, `/veiledning/${veiledning.slug}`, ingressOverride);
  const eksempel = kilder.eksempler?.find((e) => e.id === id);
  if (eksempel) return tilAktueltKort(eksempel, `/eksempler/${eksempel.slug}`, ingressOverride);
  console.warn(`[forside] Aktuelt peker på innhold som ikke finnes i kildene (id=${id}), kortet droppes`);
  return null;
}

// Redaktørvalgte kort slås opp i kildene. Et kort uten treff droppes, enten fordi
// innholdet er slettet eller fordi det er av en type Aktuelt ikke kan vise.
function slaaOppAktuelt(kort: ForsideKort[] | undefined, kilder: AktueltKilder): AktueltKort[] {
  return (kort ?? [])
    .map((k) => (k.id ? finnAktuelt(k.id, kilder, k.ingress) : null))
    .filter((c): c is AktueltKort => c !== null);
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
