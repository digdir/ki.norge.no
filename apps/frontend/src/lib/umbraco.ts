import { env } from 'cloudflare:workers';
import {
  createDeliveryApiClient,
  getMediaUrl as getMediaUrlFromBase,
  getPlainText as getPlainTextFromBlocks,
  mapMedia,
  richTextToHtml,
  type FetchOptions,
  type RichTextNode,
  type UmbracoBlock,
  type UmbracoItem,
  type UmbracoMedia,
} from '@portals/umbraco-client';

const UMBRACO_URL = env.UMBRACO_URL || 'http://localhost:5000';
const UMBRACO_PUBLIC_URL = env.UMBRACO_PUBLIC_URL || UMBRACO_URL;
const API_KEY = env.UMBRACO_API_KEY;

const client = createDeliveryApiClient({
  baseUrl: UMBRACO_URL,
  apiKey: API_KEY,
});

export type { FetchOptions, UmbracoBlock, UmbracoMedia };

// Artikkel block types
export interface ArtikkelTekstBlock {
  contentType: 'artikkelTekst';
  innhold: string; // HTML from rich text
}

export interface ArtikkelInfoBoksBlock {
  contentType: 'artikkelInfoBoks';
  tittel?: string;
  innhold: string; // HTML
}

export interface ArtikkelHeroBlock {
  contentType: 'artikkelHero';
  content: { tittel: string; tekst: string };
}

export interface ArtikkelTrekkspillBlock {
  contentType: 'artikkelTrekkspill';
  content: { tittel: string; innhold: string };
}

export interface ArtikkelSitatBlock {
  contentType: 'artikkelSitat';
  content: { sitat: string; kilde?: string };
}

export interface ArtikkelCalloutBlock {
  contentType: 'artikkelCallout';
  content: { tittel?: string; innhold: string; variant?: 'info' | 'obs' | 'advarsel' | 'suksess' };
}

export interface ArtikkelBildeSeksjonBlock {
  contentType: 'artikkelBildeSeksjon';
  bilde?: UmbracoMedia;
  bildeAlt?: string;
  bildetekst?: string;
}

export interface ArtikkelFremhevingBlock {
  contentType: 'artikkelFremheving';
  content: {
    tittel?: string;
    tekst: string; // HTML from restricted RichText
    bilde?: UmbracoMedia;
    bildeAlt?: string;
    visBakgrunn: boolean;
    visAnforselstegn: boolean;
    kilde?: string;
  };
}

export interface ProsessStegItem {
  tittel?: string; // optional label, defaults to no label if empty (placeholder "Steg" in CMS)
  beskrivelse: string; // HTML from restricted RichText
}

export interface ArtikkelProsessStegBlock {
  contentType: 'artikkelProsessteg';
  content: {
    tittel?: string;
    steg: ProsessStegItem[];
  };
}

export interface ArtikkelBylineBlock {
  contentType: 'artikkelByline';
  content: {
    navn?: string;
    stilling?: string;
    virksomhet?: string;
    dato?: string; // ISO date
  };
}

export interface ArtikkelInnholdFraBlock {
  contentType: 'artikkelInnholdFra';
  content: {
    virksomhet: string;
    dato?: string; // ISO date
  };
}

export interface ArtikkelKontaktkortBlock {
  contentType: 'artikkelKontaktkort';
  content: {
    tittel?: string;
    navn: string;
    stilling?: string;
    virksomhet?: string;
    epost: string;
    telefon?: string;
  };
}

// Content types matching Umbraco document type schemas
export interface Artikkel {
  id: string;
  documentId: string;
  tittel: string;
  slug: string;
  ingress?: string;
  artikkelBilde?: UmbracoMedia;
  bildeAlt?: string;
  bakgrunn?: 'hvit' | 'lyseblaa' | string;
  innhold?: UmbracoBlock[];
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

export interface Side {
  id: string;
  documentId: string;
  tittel: string;
  slug: string;
  innhold?: UmbracoBlock[];
  template?: 'standard' | 'bred' | 'landingsside';
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface Eksempel {
  id: string;
  documentId: string;
  tittel: string;
  slug: string;
  organisasjon?: string;
  beskrivelse?: UmbracoBlock[];
  verktoy?: string[];
  resultater?: UmbracoBlock[];
  accordionSeksjoner?: AccordionSection[];
  status?: 'i_utvikling' | 'pilot' | 'i_drift' | 'avsluttet';
  bilde?: UmbracoMedia;
  merkelapper?: Merkelapp[];
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface VeiledningGuide {
  id: string;
  documentId: string;
  tittel: string;
  slug: string;
  introTekst?: UmbracoBlock[];
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface VeiledningSteg {
  id: string;
  documentId: string;
  tittel: string;
  slug: string;
  guideSlug: string;
  steg: number;
  understeg: number;
  innhold?: UmbracoBlock[];
  infoKortTittel?: string;
  infoKortInnhold?: UmbracoBlock[];
  accordionSeksjoner?: AccordionSection[];
  eksempelTittel?: string;
  eksempelTekst?: UmbracoBlock[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface OrdbokOppslag {
  term: string;
  alternativTerm?: string;
  definisjon: string;
}

export interface FAQ {
  id: string;
  documentId: string;
  sporsmal: string;
  svar?: UmbracoBlock[];
  kategori?: Merkelapp;
  rekkefølge?: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface AccordionSection {
  title: string;
  body: UmbracoBlock[];
}

export interface TipItem {
  tipsTitle: string;
  tipsTekst: UmbracoBlock[];
  tipsBilde?: UmbracoMedia;
}

export interface EventItem {
  eventTittel: string;
  eventDato?: string;
  eventSted?: string;
  eventUrl?: string;
}

export interface Forside {
  id: string;
  documentId: string;
  heroOverskrift?: string;
  heroTekst?: UmbracoBlock[];
  heroBilde?: UmbracoMedia;
  veiledningOverskrift?: string;
  veiledning1Tittel?: string;
  veiledning1Beskrivelse?: string;
  veiledning1Url?: string;
  veiledning2Tittel?: string;
  veiledning2Beskrivelse?: string;
  veiledning2Url?: string;
  aktueltOverskrift?: string;
  aktueltLenkeTekst?: string;
  aktueltLenkeUrl?: string;
  raadTittel?: string;
  tips?: TipItem[];
  sandkasseTittel?: string;
  sandkasseTekst?: UmbracoBlock[];
  sandkasseUrl?: string;
  arrangementOverskrift?: string;
  arrangementKommendeTekst?: string;
  arrangementAvholdteTekst?: string;
  arrangementer?: EventItem[];
  footerTittel?: string;
  footerBeskrivelse?: string;
  footerSosialInstagram?: string;
  footerSosialLinkedin?: string;
  footerSosialX?: string;
  footerLenke1Tekst?: string;
  footerLenke1Url?: string;
  footerLenke2Tekst?: string;
  footerLenke2Url?: string;
  footerLenke3Tekst?: string;
  footerLenke3Url?: string;
  footerLenke4Tekst?: string;
  footerLenke4Url?: string;
  footerLenke5Tekst?: string;
  footerLenke5Url?: string;
  rekkefolgeVeiledning?: number;
  rekkefolgeAktuelt?: number;
  rekkefolgeTreRaad?: number;
  rekkefolgeSandkasse?: number;
  rekkefolgeArrangement?: number;
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface OmOssSeksjon {
  id: string;
  documentId: string;
  tittel: string;
  slug: string;
  tekst: UmbracoBlock[];
  bilde: UmbracoMedia;
  rekkefolge?: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface OmOssSeksjonBlokk {
  tittel: string;
  tekst: string; // HTML from RichText
  bilde?: UmbracoMedia;
  bildeAlt?: string;
}

export interface OmOss {
  id: string;
  documentId: string;
  heroTittel?: string;
  heroUndertittel?: string;
  introTekst?: UmbracoBlock[];
  misjonTekst?: UmbracoBlock[];
  seksjoner?: OmOssSeksjonBlokk[];
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface Sandkasse {
  id: string;
  documentId: string;
  tittel: string;
  slug: string;
  ingress: string;
  artikkelBilde?: UmbracoMedia;
  bildeAlt?: string;
  bakgrunn?: string;
  innhold?: UmbracoBlock[];
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface VeiledningKort {
  tittel: string;
  beskrivelse?: string;
  url?: string;
  ikon?: string;
}

export interface VerktoyKort {
  tittel: string;
  beskrivelse?: string;
  url?: string;
  bilde?: UmbracoMedia;
  ikon?: string;
}

export interface VeiledningOversikt {
  id: string;
  documentId: string;
  heroLabel?: string;
  heroTittel?: string;
  heroTekst?: string;
  heroBilde?: UmbracoMedia;
  seksjon1Tittel?: string;
  seksjon1Kort?: VeiledningKort[];
  seksjon2Tittel?: string;
  seksjon2Kort?: VeiledningKort[];
  verktoyTittel?: string;
  verktoyKort?: VerktoyKort[];
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface Merkelapp {
  id: string;
  documentId: string;
  navn: string;
  slug: string;
  beskrivelse?: string;
  locale: string;
}

interface CompatResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

// ── Generic fetch for Umbraco Content Delivery API v2 ───────────

async function fetchCollection<T>(
  contentType: string,
  options: FetchOptions & {
    filter?: string;
    sort?: string;
    skip?: number;
    take?: number;
  } = {}
): Promise<CompatResponse<T>> {
  const filters: string[] = [`contentType:${contentType}`];
  if (options.filter) filters.push(options.filter);

  try {
    const data = await client.fetchCollection({
      filter: filters,
      sort: options.sort,
      skip: options.skip,
      take: options.take,
      preview: options.preview,
      culture: options.locale,
    });

    return {
      data: data.items.map((item) => mapItem<T>(item, contentType)),
      meta: {
        pagination: {
          page: 1,
          pageSize: options.take || data.total,
          pageCount: 1,
          total: data.total,
        },
      },
    };
  } catch (error) {
    console.error(`Failed to fetch from Umbraco: ${contentType}`, error);
    throw error;
  }
}

async function fetchBySlug<T>(
  contentType: string,
  slug: string,
  options: FetchOptions = {}
): Promise<T | null> {
  // Umbraco Delivery API doesn't support filtering by custom properties.
  // Fetch all items of the type and find by slug client-side.
  // This is fine for small content sets (< 100 items).
  const result = await fetchCollection<T>(contentType, {
    ...options,
    take: 100,
  });
  const item = result.data.find((item: any) => item.slug === slug);
  return item || null;
}

// ── Map Umbraco item to our content type interfaces ─────────────

function mapItem<T>(item: UmbracoItem, contentType: string): T {
  const props = item.properties;

  const base = {
    id: item.id,
    documentId: item.id,
    createdAt: item.createDate,
    updatedAt: item.updateDate,
    publishedAt: item.updateDate,
    locale: Object.keys(item.cultures || {})[0] || 'nb-NO',
  };

  switch (contentType) {
    case 'caser':
      return {
        ...base,
        heroTittel: props.heroTittel as string || '',
        heroIngress: props.heroIngress as string || '',
        seoTittel: props.seoTittel as string || '',
        seoBeskrivelse: props.seoBeskrivelse as string || '',
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'artikkel':
    case 'case':
      // Case has identical shape to Artikkel (mirror content type)
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || '',
        ingress: props.ingress as string || '',
        artikkelBilde: mapMedia(props.artikkelBilde),
        bildeAlt: props.bildeAlt as string || '',
        bakgrunn: (props.bakgrunn as string) || 'hvit',
        innhold: mapArtikkelBlocks(props.innhold),
        seoTittel: props.seoTittel as string || '',
        seoBeskrivelse: props.seoBeskrivelse as string || '',
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'side':
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || '',
        innhold: mapRichText(props.innhold),
        template: props.template as string || 'standard',
        seoTittel: props.seoTittel as string || '',
        seoBeskrivelse: props.seoBeskrivelse as string || '',
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'eksempel':
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || '',
        organisasjon: props.organisasjon as string || '',
        beskrivelse: mapRichText(props.beskrivelse),
        verktoy: parseJsonArray(props.verktoy as string),
        resultater: mapRichText(props.resultater),
        accordionSeksjoner: mapAccordionSections(props.accordionSeksjoner),
        status: props.status as string || undefined,
        bilde: mapMedia(props.bilde),
        merkelapper: mapMerkelapper(props.merkelapper),
        seoTittel: props.seoTittel as string || '',
        seoBeskrivelse: props.seoBeskrivelse as string || '',
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'veiledningGuide':
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || '',
        introTekst: mapRichText(props.introTekst),
        seoTittel: props.seoTittel as string || '',
        seoBeskrivelse: props.seoBeskrivelse as string || '',
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'veiledningSteg':
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || '',
        guideSlug: props.guideSlug as string || '',
        steg: props.steg as number || 0,
        understeg: props.understeg as number || 0,
        innhold: mapRichText(props.innhold),
        infoKortTittel: props.infoKortTittel as string || undefined,
        infoKortInnhold: mapRichText(props.infoKortInnhold),
        accordionSeksjoner: mapAccordionSections(props.accordionSeksjoner),
        eksempelTittel: props.eksempelTittel as string || undefined,
        eksempelTekst: mapRichText(props.eksempelTekst),
      } as T;

    case 'faq':
      return {
        ...base,
        sporsmal: props.sporsmal as string || item.name,
        svar: mapRichText(props.svar),
        kategori: mapKategori(props.kategori),
        rekkefølge: props.rekkefolge as number || 0,
      } as T;

    case 'forside':
      return {
        ...base,
        heroOverskrift: props.heroOverskrift as string || undefined,
        heroTekst: mapRichText(props.heroTekst),
        heroBilde: mapMedia(props.heroBilde),
        veiledningOverskrift: props.veiledningOverskrift as string || undefined,
        veiledning1Tittel: props.veiledning1Tittel as string || undefined,
        veiledning1Beskrivelse: props.veiledning1Beskrivelse as string || undefined,
        veiledning1Url: props.veiledning1Url as string || undefined,
        veiledning2Tittel: props.veiledning2Tittel as string || undefined,
        veiledning2Beskrivelse: props.veiledning2Beskrivelse as string || undefined,
        veiledning2Url: props.veiledning2Url as string || undefined,
        aktueltOverskrift: props.aktueltOverskrift as string || undefined,
        aktueltLenkeTekst: props.aktueltLenkeTekst as string || undefined,
        aktueltLenkeUrl: props.aktueltLenkeUrl as string || undefined,
        raadTittel: props.raadTittel as string || undefined,
        tips: mapTipItems(props.tips),
        sandkasseTittel: props.sandkasseTittel as string || undefined,
        sandkasseTekst: mapRichText(props.sandkasseTekst),
        sandkasseUrl: props.sandkasseUrl as string || undefined,
        arrangementOverskrift: props.arrangementOverskrift as string || undefined,
        arrangementKommendeTekst: props.arrangementKommendeTekst as string || undefined,
        arrangementAvholdteTekst: props.arrangementAvholdteTekst as string || undefined,
        arrangementer: mapEventItems(props.arrangementer),
        footerTittel: props.footerTittel as string || undefined,
        footerBeskrivelse: props.footerBeskrivelse as string || undefined,
        footerSosialInstagram: props.footerSosialInstagram as string || undefined,
        footerSosialLinkedin: props.footerSosialLinkedin as string || undefined,
        footerSosialX: props.footerSosialX as string || undefined,
        footerLenke1Tekst: props.footerLenke1Tekst as string || undefined,
        footerLenke1Url: props.footerLenke1Url as string || undefined,
        footerLenke2Tekst: props.footerLenke2Tekst as string || undefined,
        footerLenke2Url: props.footerLenke2Url as string || undefined,
        footerLenke3Tekst: props.footerLenke3Tekst as string || undefined,
        footerLenke3Url: props.footerLenke3Url as string || undefined,
        footerLenke4Tekst: props.footerLenke4Tekst as string || undefined,
        footerLenke4Url: props.footerLenke4Url as string || undefined,
        footerLenke5Tekst: props.footerLenke5Tekst as string || undefined,
        footerLenke5Url: props.footerLenke5Url as string || undefined,
        rekkefolgeVeiledning: props.rekkefolgeVeiledning as number || undefined,
        rekkefolgeAktuelt: props.rekkefolgeAktuelt as number || undefined,
        rekkefolgeTreRaad: props.rekkefolgeTreRaad as number || undefined,
        rekkefolgeSandkasse: props.rekkefolgeSandkasse as number || undefined,
        rekkefolgeArrangement: props.rekkefolgeArrangement as number || undefined,
        seoTittel: props.seoTittel as string || undefined,
        seoBeskrivelse: props.seoBeskrivelse as string || undefined,
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'omOssSeksjon':
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || '',
        tekst: mapRichText(props.tekst),
        bilde: mapMedia(props.bilde),
        rekkefolge: props.rekkefolge as number || 0,
      } as T;

    case 'omOss':
      // Map seksjoner Block List to OmOssSeksjonBlokk[]
      const seksjonerItems = (props.seksjoner as any)?.items || [];
      const seksjoner: OmOssSeksjonBlokk[] = seksjonerItems.map((block: any) => {
        const content = block.content || block;
        const blockProps = content.properties || content;
        const tekst = blockProps.tekst?.tag === '#root'
          ? richTextToHtml(blockProps.tekst)
          : (typeof blockProps.tekst === 'string' ? blockProps.tekst : '');
        return {
          tittel: blockProps.tittel || '',
          tekst,
          bilde: mapMedia(blockProps.bilde),
          bildeAlt: blockProps.bildeAlt || '',
        };
      });
      return {
        ...base,
        heroTittel: props.heroTittel as string || '',
        heroUndertittel: props.heroUndertittel as string || '',
        introTekst: mapRichText(props.introTekst),
        misjonTekst: mapRichText(props.misjonTekst),
        seksjoner,
        seoTittel: props.seoTittel as string || '',
        seoBeskrivelse: props.seoBeskrivelse as string || '',
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'sandkasse':
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || 'sandkasse',
        ingress: props.ingress as string || '',
        artikkelBilde: mapMedia(props.artikkelBilde),
        bildeAlt: props.bildeAlt as string || '',
        bakgrunn: (props.bakgrunn as string) || 'hvit',
        innhold: mapArtikkelBlocks(props.innhold),
        seoTittel: props.seoTittel as string || undefined,
        seoBeskrivelse: props.seoBeskrivelse as string || undefined,
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'veiledningOversikt':
    case 'veiledninger':
      // veiledninger container now has the same fields as the old standalone Oversikt.
      // Both cases mapped identically so transitional content still works.
      return {
        ...base,
        heroLabel: props.heroLabel as string || undefined,
        heroTittel: props.heroTittel as string || undefined,
        heroTekst: props.heroTekst as string || undefined,
        heroBilde: mapMedia(props.heroBilde),
        seksjon1Tittel: props.seksjon1Tittel as string || undefined,
        seksjon1Kort: mapVeiledningKort(props.seksjon1Kort),
        seksjon2Tittel: props.seksjon2Tittel as string || undefined,
        seksjon2Kort: mapVeiledningKort(props.seksjon2Kort),
        verktoyTittel: props.verktoyTittel as string || undefined,
        verktoyKort: mapVerktoyKort(props.verktoyKort),
        seoTittel: props.seoTittel as string || undefined,
        seoBeskrivelse: props.seoBeskrivelse as string || undefined,
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'merkelapp':
      return {
        ...base,
        navn: props.navn as string || item.name,
        slug: props.slug as string || '',
        beskrivelse: props.beskrivelse as string || '',
      } as T;

    case 'ordbokOppslag':
      return {
        term: props.term as string || item.name,
        alternativTerm: props.alternativTerm as string || undefined,
        definisjon: props.definisjon as string || '',
      } as T;

    default:
      return { ...base, ...props } as T;
  }
}

// ── Mapping helpers ─────────────────────────────────────────────

/**
 * Map artikkel innhold from Block List format to UmbracoBlock[].
 * Handles different block content types: artikkelTekst, artikkelInfoBoks, artikkelHero, artikkelBildeSeksjon.
 */
function mapArtikkelBlocks(value: unknown): UmbracoBlock[] {
  // Handle Block List format: { items: [{ content: { contentType, properties } }] }
  const items = (value as any)?.items;
  if (Array.isArray(items)) {
    return items.map((block: any) => {
      const content = block.content || block;
      const ct = content.contentType || 'artikkelTekst';
      const props = content.properties || content;

      if (ct === 'artikkelTekst') {
        const richText = props.innhold;
        const html = richText?.tag === '#root' ? richTextToHtml(richText) : (typeof richText === 'string' ? richText : '');
        return { contentType: 'artikkelTekst', content: { innhold: html } };
      }
      if (ct === 'artikkelInfoBoks') {
        const richText = props.innhold;
        const html = richText?.tag === '#root' ? richTextToHtml(richText) : (typeof richText === 'string' ? richText : '');
        return { contentType: 'artikkelInfoBoks', content: { tittel: props.tittel || '', innhold: html } };
      }
      if (ct === 'artikkelHero') {
        const richText = props.tekst;
        const html = richText?.tag === '#root' ? richTextToHtml(richText) : (typeof richText === 'string' ? richText : '');
        return { contentType: 'artikkelHero', content: { tittel: props.tittel || '', tekst: html } };
      }
      if (ct === 'artikkelTrekkspill') {
        const richText = props.innhold;
        const html = richText?.tag === '#root' ? richTextToHtml(richText) : (typeof richText === 'string' ? richText : '');
        return { contentType: 'artikkelTrekkspill', content: { tittel: props.tittel || '', innhold: html } };
      }
      if (ct === 'artikkelSitat') {
        return { contentType: 'artikkelSitat', content: { sitat: props.sitat || '', kilde: props.kilde || '' } };
      }
      if (ct === 'artikkelCallout') {
        const richText = props.innhold;
        const html = richText?.tag === '#root' ? richTextToHtml(richText) : (typeof richText === 'string' ? richText : '');
        return { contentType: 'artikkelCallout', content: { tittel: props.tittel || '', innhold: html, variant: props.variant || 'info' } };
      }
      if (ct === 'artikkelBildeSeksjon') {
        return { contentType: 'artikkelBildeSeksjon', content: { bilde: mapMedia(props.bilde), bildeAlt: props.bildeAlt || '', bildetekst: props.bildetekst || '' } };
      }
      if (ct === 'artikkelByline') {
        return { contentType: 'artikkelByline', content: {
          navn: props.navn || '',
          stilling: props.stilling || '',
          virksomhet: props.virksomhet || '',
          dato: props.dato || '',
        } };
      }
      if (ct === 'artikkelInnholdFra') {
        return { contentType: 'artikkelInnholdFra', content: {
          virksomhet: props.virksomhet || '',
          dato: props.dato || '',
        } };
      }
      if (ct === 'artikkelKontaktkort') {
        return { contentType: 'artikkelKontaktkort', content: {
          tittel: props.tittel || '',
          navn: props.navn || '',
          stilling: props.stilling || '',
          virksomhet: props.virksomhet || '',
          epost: props.epost || '',
          telefon: props.telefon || '',
        } };
      }
      if (ct === 'artikkelProsessteg') {
        // Nested Block List: props.steg has items, each with content.beskrivelse RichText
        const stegItems = (props.steg as any)?.items || [];
        const steg: ProsessStegItem[] = stegItems.map((item: any) => {
          const itemContent = item.content || item;
          const itemProps = itemContent.properties || itemContent;
          const beskrivelse = itemProps.beskrivelse?.tag === '#root'
            ? richTextToHtml(itemProps.beskrivelse)
            : (typeof itemProps.beskrivelse === 'string' ? itemProps.beskrivelse : '');
          return { tittel: itemProps.tittel || '', beskrivelse };
        });
        return { contentType: 'artikkelProsessteg', content: { tittel: props.tittel || '', steg } };
      }
      if (ct === 'artikkelFremheving') {
        const tekst = props.tekst?.tag === '#root' ? richTextToHtml(props.tekst) : (typeof props.tekst === 'string' ? props.tekst : '');
        // Defaults: visBakgrunn=true (Faktaboks-stil), visAnforselstegn=false
        const visBakgrunn = props.visBakgrunn === false ? false : true;
        const visAnforselstegn = props.visAnforselstegn === true;
        return { contentType: 'artikkelFremheving', content: {
          tittel: props.tittel || '',
          tekst,
          bilde: mapMedia(props.bilde),
          bildeAlt: props.bildeAlt || '',
          visBakgrunn,
          visAnforselstegn,
          kilde: props.kilde || '',
        } };
      }

      // Fallback: treat as tekst block (legacy rich text)
      const richText = props.innhold || value;
      const html = richText?.tag === '#root' ? richTextToHtml(richText) : (typeof richText === 'string' ? richText : '');
      return { contentType: 'tekst', content: { innhold: html } };
    });
  }

  // Fallback for plain rich text (legacy data)
  return mapRichText(value) || [];
}

/**
 * Handle Umbraco rich text which comes as JSON AST: { tag: "#root", elements: [...] }
 * Convert to a single UmbracoBlock with contentType "tekst" containing HTML.
 * Also handles Block List arrays (future use).
 */
function mapRichText(value: unknown): UmbracoBlock[] | undefined {
  if (!value) return undefined;

  // Umbraco RichText JSON: { tag: "#root", elements: [...] }
  if (typeof value === 'object' && !Array.isArray(value) && (value as any).tag === '#root') {
    const html = richTextToHtml(value as RichTextNode);
    if (!html) return undefined;
    return [{ contentType: 'tekst', content: { innhold: html } }];
  }

  // Block List array (if we switch to Block List editor later)
  if (Array.isArray(value)) {
    return value.map((block: any) => ({
      contentType: block.contentType || block.content?.contentType || 'tekst',
      content: block.content || block,
    }));
  }

  // Plain HTML string
  if (typeof value === 'string' && value.trim()) {
    return [{ contentType: 'tekst', content: { innhold: value } }];
  }

  return undefined;
}

function mapAccordionSections(value: unknown): AccordionSection[] {
  const items = Array.isArray(value) ? value : (value as any)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((block: any) => {
    const content = block.content || block;
    const props = content.properties || content;
    return {
      title: (props.title as string) || '',
      body: mapRichText(props.body) || [],
    };
  });
}

function mapTipItems(value: unknown): TipItem[] {
  const items = Array.isArray(value) ? value : (value as any)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((block: any) => {
    const content = block.content || block;
    const props = content.properties || content;
    return {
      tipsTitle: (props.tipsTitle as string) || '',
      tipsTekst: mapRichText(props.tipsTekst) || [],
      tipsBilde: mapMedia(props.tipsBilde),
    };
  });
}

function mapEventItems(value: unknown): EventItem[] {
  const items = Array.isArray(value) ? value : (value as any)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((block: any) => {
    const content = block.content || block;
    const props = content.properties || content;
    return {
      eventTittel: (props.eventTittel as string) || '',
      eventDato: (props.eventDato as string) || undefined,
      eventSted: (props.eventSted as string) || undefined,
      eventUrl: (props.eventUrl as string) || undefined,
    };
  });
}

function mapVeiledningKort(value: unknown): VeiledningKort[] {
  const items = Array.isArray(value) ? value : (value as any)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((block: any) => {
    const content = block.content || block;
    const props = content.properties || content;
    return {
      tittel: (props.tittel as string) || '',
      beskrivelse: (props.beskrivelse as string) || undefined,
      url: (props.url as string) || undefined,
      ikon: (props.ikon as string) || undefined,
    };
  });
}

function mapVerktoyKort(value: unknown): VerktoyKort[] {
  const items = Array.isArray(value) ? value : (value as any)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((block: any) => {
    const content = block.content || block;
    const props = content.properties || content;
    return {
      tittel: (props.tittel as string) || '',
      beskrivelse: (props.beskrivelse as string) || undefined,
      url: (props.url as string) || undefined,
      bilde: mapMedia(props.bilde),
      ikon: (props.ikon as string) || undefined,
    };
  });
}

function mapMerkelapper(value: unknown): Merkelapp[] {
  if (!value || !Array.isArray(value)) return [];
  return value.map((item: any) => ({
    id: item.id || '',
    documentId: item.id || '',
    navn: item.properties?.navn || item.name || '',
    slug: item.properties?.slug || '',
    beskrivelse: item.properties?.beskrivelse || '',
    locale: 'nb-NO',
  }));
}

function mapKategori(value: unknown): Merkelapp | undefined {
  if (!value) return undefined;
  const item = value as any;
  return {
    id: item.id || '',
    documentId: item.id || '',
    navn: item.properties?.navn || item.name || '',
    slug: item.properties?.slug || '',
    beskrivelse: item.properties?.beskrivelse || '',
    locale: 'nb-NO',
  };
}


function parseJsonArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Bind to module-level UMBRACO_PUBLIC_URL so call sites stay compact.
export function getMediaUrl(media?: UmbracoMedia): string | undefined {
  return getMediaUrlFromBase(media, UMBRACO_PUBLIC_URL);
}

export function getPlainText(blocks?: UmbracoBlock[], maxLength?: number): string {
  return getPlainTextFromBlocks(blocks, maxLength);
}


// ── Artikkel API functions ──────────────────────────────────────

export async function getArtikler(limit?: number, options: FetchOptions = {}) {
  return fetchCollection<Artikkel>('artikkel', {
    ...options,
    sort: 'updateDate:desc',
    take: limit,
  });
}

export async function getArtikkel(slug: string, options: FetchOptions = {}) {
  return fetchBySlug<Artikkel>('artikkel', slug, options);
}

// ── Side (Page) API functions ───────────────────────────────────

export async function getSider(options: FetchOptions = {}) {
  return fetchCollection<Side>('side', options);
}

export async function getSide(slug: string, options: FetchOptions = {}) {
  return fetchBySlug<Side>('side', slug, options);
}

// ── Case API (new content type, replaces Eksempel) ──────────────

export interface Case extends Artikkel {
  // Same shape as Artikkel for now (mirror content type).
  // Add case-specific fields here when they diverge.
}

export interface CaserOversikt {
  id: string;
  documentId: string;
  heroTittel?: string;
  heroIngress?: string;
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

export async function getCaserOversikt(options: FetchOptions = {}): Promise<CaserOversikt | null> {
  const result = await fetchCollection<CaserOversikt>('caser', { ...options, take: 1 });
  return result.data[0] || null;
}

export async function getCaser(options: FetchOptions = {}) {
  return fetchCollection<Case>('case', {
    skip: 0,
    take: 50,
    sort: 'updateDate:desc',
    ...options,
  });
}

export async function getCase(slug: string, options: FetchOptions = {}) {
  return fetchBySlug<Case>('case', slug, options);
}

// ── Eksempel (legacy, will be removed once content migrates to Case) ──

export async function getEksempler(options: FetchOptions = {}) {
  return fetchCollection<Eksempel>('eksempel', {
    ...options,
    sort: 'createDate:desc',
  });
}

export async function getEksempel(slug: string, options: FetchOptions = {}) {
  return fetchBySlug<Eksempel>('eksempel', slug, options);
}

// ── Forside (Frontpage) API functions ───────────────────────────

export async function getForside(options: FetchOptions = {}): Promise<Forside | null> {
  const result = await fetchCollection<Forside>('forside', { ...options, take: 1 });
  return result.data[0] || null;
}

// ── Veiledning Guide/Step API functions ─────────────────────────

export async function getVeiledningGuider(options: FetchOptions = {}) {
  return fetchCollection<VeiledningGuide>('veiledningGuide', options);
}

export async function getVeiledningGuide(slug: string, options: FetchOptions = {}) {
  return fetchBySlug<VeiledningGuide>('veiledningGuide', slug, options);
}

export async function getVeiledningSteg(guideSlug: string, options: FetchOptions = {}) {
  const result = await fetchCollection<VeiledningSteg>('veiledningSteg', { ...options, take: 100 });
  return result.data
    .filter(s => s.guideSlug === guideSlug)
    .sort((a, b) => a.steg !== b.steg ? a.steg - b.steg : a.understeg - b.understeg);
}

export async function getVeiledningStegBySlug(guideSlug: string, stepSlug: string, options: FetchOptions = {}) {
  const steps = await getVeiledningSteg(guideSlug, options);
  return steps.find(s => s.slug === stepSlug) || null;
}

// ── FAQ API functions ───────────────────────────────────────────

export async function getFAQs(options: FetchOptions = {}) {
  return fetchCollection<FAQ>('faq', {
    ...options,
    sort: 'sortOrder:asc',
  });
}

// ── KI-ordbok API functions ──────────────────────────────────────

export async function getOrdbokOppslag(options: FetchOptions = {}) {
  return fetchCollection<OrdbokOppslag>('ordbokOppslag', {
    ...options,
    sort: 'name:asc',
    take: 500,
  });
}

// ── Merkelapp (Tag) API functions ───────────────────────────────

export async function getOmOssSeksjoner(options: FetchOptions = {}) {
  return fetchCollection<OmOssSeksjon>('omOssSeksjon', {
    ...options,
    sort: 'sortOrder:asc',
  });
}

export async function getOmOss(options: FetchOptions = {}): Promise<OmOss | null> {
  const result = await fetchCollection<OmOss>('omOss', { ...options, take: 1 });
  return result.data[0] || null;
}

// ── Sandkasse API functions ──────────────────────────────────────

export async function getSandkasse(options: FetchOptions = {}): Promise<Sandkasse | null> {
  const result = await fetchCollection<Sandkasse>('sandkasse', { ...options, take: 1 });
  return result.data[0] || null;
}

// ── Veiledning Oversikt API functions ────────────────────────────

/**
 * Fetches the Veiledning overview content. Prefers the new flat structure (fields on
 * the 'veiledninger' container itself); falls back to legacy standalone 'veiledningOversikt'
 * during the migration window.
 */
export async function getVeiledningOversikt(options: FetchOptions = {}): Promise<VeiledningOversikt | null> {
  // Try new structure first
  const flat = await fetchCollection<VeiledningOversikt>('veiledninger', { ...options, take: 1 });
  if (flat.data[0]?.heroTittel) return flat.data[0];
  // Fall back to legacy
  const result = await fetchCollection<VeiledningOversikt>('veiledningOversikt', { ...options, take: 1 });
  return result.data[0] || null;
}

// ── Search API ──────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  tittel: string;
  slug: string;
  contentType: string;
  excerpt: string;
  publishedAt: string;
}

export async function searchContent(query: string, options: FetchOptions = {}): Promise<CompatResponse<SearchResult>> {
  if (!query.trim()) {
    return { data: [], meta: { pagination: { page: 1, pageSize: 0, pageCount: 0, total: 0 } } };
  }

  try {
    const data = await client.fetchCollection({
      search: query,
      take: 50,
      preview: options.preview,
    });

    const results: SearchResult[] = data.items
      .filter(item => ['artikkel', 'eksempel', 'veiledningGuide', 'veiledningSteg', 'side', 'faq'].includes(item.contentType))
      .map((item: UmbracoItem) => {
        const props = item.properties;
        const tittel = (props.tittel as string) || (props.sporsmal as string) || item.name;
        const slug = (props.slug as string) || '';

        // Build excerpt from available text content
        let excerpt = '';
        if (props.innhold || props.beskrivelse || props.svar) {
          const blocks = mapRichText(props.innhold || props.beskrivelse || props.svar);
          excerpt = getPlainText(blocks, 200);
        }

        return {
          id: item.id,
          tittel,
          slug,
          contentType: item.contentType,
          excerpt,
          publishedAt: item.updateDate,
        };
      });

    return {
      data: results,
      meta: {
        pagination: {
          page: 1,
          pageSize: results.length,
          pageCount: 1,
          total: results.length,
        },
      },
    };
  } catch (error) {
    console.error('Search failed, falling back to client-side filtering:', error);

    // Fallback: fetch all content types and filter client-side
    const allResults: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    try {
      const [artikler, eksempler, guides] = await Promise.all([
        fetchCollection<Artikkel>('artikkel', { take: 100 }),
        fetchCollection<Eksempel>('eksempel', { take: 100 }),
        fetchCollection<VeiledningGuide>('veiledningGuide', { take: 100 }),
      ]);

      for (const a of artikler.data) {
        if (a.tittel.toLowerCase().includes(lowerQuery) || getPlainText(a.innhold, 500).toLowerCase().includes(lowerQuery)) {
          allResults.push({ id: a.id, tittel: a.tittel, slug: a.slug, contentType: 'artikkel', excerpt: getPlainText(a.innhold, 200), publishedAt: a.publishedAt });
        }
      }
      for (const e of eksempler.data) {
        if (e.tittel.toLowerCase().includes(lowerQuery) || (e.organisasjon || '').toLowerCase().includes(lowerQuery) || getPlainText(e.beskrivelse, 500).toLowerCase().includes(lowerQuery)) {
          allResults.push({ id: e.id, tittel: e.tittel, slug: e.slug, contentType: 'eksempel', excerpt: getPlainText(e.beskrivelse, 200), publishedAt: e.publishedAt });
        }
      }
      for (const g of guides.data) {
        if (g.tittel.toLowerCase().includes(lowerQuery) || getPlainText(g.introTekst, 500).toLowerCase().includes(lowerQuery)) {
          allResults.push({ id: g.id, tittel: g.tittel, slug: g.slug, contentType: 'veiledningGuide', excerpt: getPlainText(g.introTekst, 200), publishedAt: g.publishedAt });
        }
      }
    } catch { /* return empty if fallback also fails */ }

    return {
      data: allResults,
      meta: { pagination: { page: 1, pageSize: allResults.length, pageCount: 1, total: allResults.length } },
    };
  }
}

