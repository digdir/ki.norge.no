import contentRoutesConfig from '../../../../shared/content-routes.json';

const UMBRACO_URL = process.env.UMBRACO_URL || import.meta.env.UMBRACO_URL || 'http://localhost:5000';
const UMBRACO_PUBLIC_URL = process.env.UMBRACO_PUBLIC_URL || import.meta.env.UMBRACO_PUBLIC_URL || UMBRACO_URL;
const API_KEY = process.env.UMBRACO_API_KEY || import.meta.env.UMBRACO_API_KEY;

// Preview mode options
export interface FetchOptions {
  preview?: boolean;
  locale?: string;
}

// Umbraco Content Delivery API response format
interface UmbracoResponse<T> {
  total: number;
  items: UmbracoItem[];
}

interface UmbracoItem {
  id: string;
  name: string;
  contentType: string;
  createDate: string;
  updateDate: string;
  route: { path: string; startItem: { id: string; path: string } };
  properties: Record<string, unknown>;
  cultures: Record<string, { path: string; startItem: { id: string; path: string } }>;
}

interface UmbracoSingleItem extends UmbracoItem {}

// Block List item from Umbraco Delivery API
export interface UmbracoBlock {
  contentType: string;
  content: Record<string, unknown>;
  // Per-block settings (Umbraco's "Innstillinger" tab on the block editor).
  // Only blocks with a configured settingsElementTypeKey will have this populated.
  // For artikkelTrekkspill, settings.gruppeTittel signals "start a new group with this title".
  settings?: Record<string, unknown>;
}

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

// Veiledning block types (egen modulkatalog, separat fra artikkel)
export interface VeiledningTekstBlock {
  contentType: 'veiledningTekst';
  content: { innhold: string };
}

export interface VeiledningInfoBlock {
  contentType: 'veiledningInfo';
  content: {
    tittel: string;
    innhold: string;
    trekkspill?: { tittel: string; innhold: string }[];
    lesMerTittel?: string;
    lesMerUrl?: string;
  };
}

export interface VeiledningEksempelBlock {
  contentType: 'veiledningEksempel';
  content: { tittel: string; innhold: string };
}

export interface VeiledningObsBlock {
  contentType: 'veiledningObs';
  content: { tittel: string; tekst: string };
}

export interface VeiledningTrekkspillBlock {
  contentType: 'veiledningTrekkspill';
  content: { tittel: string; innhold: string };
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

export interface EnkelVeiledning extends Artikkel {}

export interface Stegartikkel extends Artikkel {}

export interface Kalenderhendelse {
  id: string;
  documentId: string;
  tittel: string;
  slug: string;
  /** Merkelapp(er), kommaseparert (f.eks. "Frokostseminar, Offentlig"). CMS-alias er fortsatt "type". */
  type?: string;
  ingress?: string;
  detaljertBeskrivelse?: UmbracoBlock[];
  startDato: string;
  sluttDato?: string;
  tid?: string;
  sted?: string;
  lenke?: string;
  /** Valgfri pris, f.eks. "Gratis" eller "1 500 kr". Tom = pris vises ikke. */
  pris?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface Kalender {
  id: string;
  documentId: string;
  tittel: string;
  ingress?: string;
  featuredHendelse?: Kalenderhendelse | null;
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface Side extends Artikkel {}

export interface Eksempel extends Artikkel {}

export interface ArtiklerSeksjon {
  contentType: 'artikkelFeatured' | 'artikkelGruppe' | 'artikkelRelatert';
  id: string;
  // Featured: én artikkel-referanse + valgfri ingress-overstyring
  artikkelId?: string;
  ingress?: string;
  // Gruppe: tittel + kolonner + 1-6 artikkel-referanser
  tittel?: string;
  antallKolonner?: number;
  artikkelIds?: string[];
  // Relatert (kun merkelapp): tittel + 1-3 referanser + per-kort merkelapp
  relatertIds?: string[];
  relatertTags?: Array<string | undefined>;
}

export interface ArtiklerOversikt {
  id: string;
  documentId: string;
  heroTittel?: string;
  heroSubtittel?: string;
  featuredArtikkelId?: string;
  seksjoner?: ArtiklerSeksjon[];
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

export interface EksemplerSeksjon {
  contentType: 'eksempelFeatured' | 'eksempelGruppe' | 'eksempelRelatert' | 'eksempelKontakt';
  id: string;
  // Featured: én eksempel-referanse
  eksempelId?: string;
  // Gruppe: tittel + kolonner + 1-6 eksempel-referanser
  tittel?: string;
  antallKolonner?: number;
  eksempelIds?: string[];
  // Relatert: tittel + 1-3 referanser (kan være artikkel eller veiledningGuide)
  relatertIds?: string[];
  // Kontakt: tittel + navn + epost + stilling
  navn?: string;
  epost?: string;
  stilling?: string;
  // Redaksjonelle felt fra Figma-kommentarer. kortFarger har ennå ikke et CMS-felt
  // og er undefined i dag (frontend faller tilbake på defaults).
  ingress?: string;                              // Featured: manuell ingress
  kortTag?: string;                              // Gruppe: tag på hvert kort (default "Eksempel")
  kortFarger?: Array<'dark' | 'light' | undefined>; // Gruppe: per-kort farge, justert mot eksempelIds
  relatertTags?: Array<string | undefined>;      // Relatert: per-kort tag, justert mot relatertIds
}

export interface EksemplerOversikt {
  id: string;
  documentId: string;
  heroTittel?: string;
  seksjoner?: EksemplerSeksjon[];
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

export interface VeiledningGuide {
  id: string;
  documentId: string;
  tittel: string;
  slug: string;
  ingress?: string;
  innholdBlokker?: UmbracoBlock[];
  stegGruppeTittler?: string;
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
  ingress?: string;
  innholdBlokker?: UmbracoBlock[];
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

// Ett redaktørvalgt kort i forsideAktuelt/forsideLaerAvAndre.
// id = node-id på valgt artikkel/eksempel. ingress = valgfri overstyring.
export interface ForsideKort {
  id?: string;
  ingress?: string;
}

// Én forside-modul (block i forside.seksjoner). Flat: alle mulige felt valgfrie.
export interface ForsideSeksjon {
  contentType: string;
  id: string;
  overskrift?: string;
  overskriftHtml?: string;
  komIGangTekst?: string;
  label?: string;
  tittel?: string;
  ingress?: string;
  lenketekst?: string;
  lenkeUrl?: string;
  illustrasjon?: UmbracoMedia;
  tekst?: string;
  arrangementId?: string;
  veiledningId?: string;
  fremhevetArtikkelId?: string;
  forstaLenkeIds?: string[];
  kort?: ForsideKort[];
  kortTag?: string;
}

export interface Forside {
  id: string;
  documentId: string;
  seksjoner?: ForsideSeksjon[];
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

// Om Oss bruker rik artikkelmal (#362): samme artikkelhode + modul-blokkliste som artikkel.
export interface OmOss {
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
  seksjon3Tittel?: string;
  seksjon3Kort?: VeiledningKort[];
  eksempelKortTag?: string;
  seoTittel?: string;
  seoBeskrivelse?: string;
  seoBilde?: UmbracoMedia;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  locale: string;
}

export interface GlobaleInnstillinger {
  id: string;
  documentId: string;
  cookieTittel?: string;
  cookieTekst?: string;
  cookieJaLabel?: string;
  cookieNeiLabel?: string;
  cookieSekundaerTekst?: string;
  tittel404?: string;
  beskrivelse404?: string;
  tittel503?: string;
  beskrivelse503?: string;
  vedlikeholdEpost?: string;
  footerBeskrivelse?: string;
  footerEpost?: string;
  footerLenke1Tekst?: string;
  footerLenke1Url?: string;
  footerLenke3Tekst?: string;
  footerLenke3Url?: string;
  footerLenke4Tekst?: string;
  footerLenke4Url?: string;
  footerLenke5Tekst?: string;
  footerLenke5Url?: string;
}

export interface UmbracoMedia {
  id: string;
  url: string;
  alternativeText?: string;
  width?: number;
  height?: number;
  focalPoint?: { left: number; top: number };
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

// ── Umbraco RichText JSON → HTML converter ──────────────────────

import { applyDsClasses, normalizeNbsp } from './richtext-classes';

interface RichTextNode {
  tag: string;
  text?: string;
  attributes?: Record<string, string>;
  elements?: RichTextNode[];
}

// Embeddede media-URLer i RichText (bilder, fil-lenker) kommer relativt som
// /media/... og ville blitt hentet fra frontend-domenet (404 pa Cloudflare).
// Prefiks CMS-hosten. Allerede-absolutte URLer (http) treffes ikke av regexen.
export function absolutizeMediaUrls(html: string): string {
  return html.replace(
    /\b(src|href)="(\/media\/[^"]*)"/g,
    (_m, attr, value) => `${attr}="${UMBRACO_PUBLIC_URL}${value}"`,
  );
}

function richTextToHtml(node: RichTextNode): string {
  // Text node
  if (node.tag === '#text') {
    return escapeHtml(normalizeNbsp(node.text || ''));
  }

  // Root node — render children, then tag designsystem classes onto bare
  // elements (Umbraco's RichText emits <ul>/<ol>/<table>/... with no class).
  // Done once at root level so we parse the assembled HTML exactly once per
  // RichText field, not recursively per node.
  if (node.tag === '#root') {
    const inner = (node.elements || []).map(richTextToHtml).join('');
    return absolutizeMediaUrls(applyDsClasses(inner));
  }

  // Comment node
  if (node.tag === '#comment') return '';

  // Self-closing tags
  const selfClosing = ['br', 'hr', 'img', 'input'];
  const children = (node.elements || []).map(richTextToHtml).join('');

  // Heading tags — inject id for TOC anchor links
  if (/^h[1-6]$/.test(node.tag)) {
    const text = nodeToPlainText(node);
    const id = text.toLowerCase().replace(/[^a-zæøå0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const attrs = renderAttributes(node.attributes);
    return `<${node.tag}${attrs} id="${id}">${children}</${node.tag}>`;
  }

  const attrs = renderAttributes(node.attributes);

  if (selfClosing.includes(node.tag)) {
    return `<${node.tag}${attrs} />`;
  }

  return `<${node.tag}${attrs}>${children}</${node.tag}>`;
}

/** Extract plain text from a RichText AST node (used for heading id generation) */
function nodeToPlainText(node: RichTextNode): string {
  if (node.tag === '#text') return node.text || '';
  if (node.tag === '#comment') return '';
  return (node.elements || []).map(nodeToPlainText).join('');
}

function renderAttributes(attrs?: Record<string, unknown>): string {
  if (!attrs || Object.keys(attrs).length === 0) return '';

  const out: string[] = [];

  // Tiptap stores internal links with a `route: { path, queryString, ... }`
  // metadata object as an "attribute." Browsers don't understand it.
  //
  // Umbraco's route.path is the content tree path built from auto-generated URL
  // segments (e.g. "/gjoer-dataene-ki-klare/...") and lacks our frontend route
  // prefix (e.g. "/veiledning/..."). Our pages route by the editor-controlled
  // `slug` field, not the URL segment. We therefore emit a placeholder href
  // and stash destinationId/Type on data-attrs; enrichBlocksInternalLinks
  // resolves them to the correct frontend URL after fetch.
  const route = attrs.route as undefined | { path?: string; queryString?: string };
  const destinationId = typeof attrs.destinationId === 'string' ? attrs.destinationId : '';
  const destinationType = typeof attrs.destinationType === 'string' ? attrs.destinationType : '';
  const isMediaLink = destinationType === 'media'
    || (typeof route?.path === 'string' && route.path.startsWith('/media'));

  if (route && typeof route.path === 'string') {
    if (destinationId && !isMediaLink) {
      out.push(' href="#"');
      out.push(` data-internal-link-id="${escapeHtml(destinationId)}"`);
      out.push(` data-internal-link-type="${escapeHtml(destinationType)}"`);
      if (typeof route.queryString === 'string' && route.queryString) {
        out.push(` data-internal-link-query="${escapeHtml(route.queryString)}"`);
      }
    } else {
      const href = route.path + (typeof route.queryString === 'string' ? route.queryString : '');
      out.push(` href="${escapeHtml(href)}"`);
    }
  }

  for (const [key, value] of Object.entries(attrs)) {
    // Skip Umbraco-internal metadata that's not a real HTML attribute
    if (key === 'route' || key === 'destinationId' || key === 'destinationType' ||
        key === 'linkType' || key === 'router-slot' || key === 'type') {
      continue;
    }
    // Already handled the link case above; skip if Tiptap stored an `href` too
    if (key === 'href' && route) continue;
    // Defensive: skip any non-scalar value to avoid crashing on unexpected
    // shapes from future Tiptap versions
    if (value == null) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    out.push(` ${key}="${escapeHtml(String(value))}"`);
  }
  return out.join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Generic fetch for Umbraco Content Delivery API v2 ───────────

const API_BASE = `${UMBRACO_URL}/umbraco/delivery/api/v2/content`;

async function fetchCollection<T>(
  contentType: string,
  options: FetchOptions & {
    filter?: string;
    sort?: string;
    skip?: number;
    take?: number;
  } = {}
): Promise<CompatResponse<T>> {
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };

  // Only send Accept-Language if content has culture variants
  if (options.locale) {
    headers['Accept-Language'] = options.locale;
  }

  if (options.preview && API_KEY) {
    headers['Api-Key'] = API_KEY;
    // Umbraco Delivery API leverer kladd kun med Preview-header (ikke ?preview-query).
    headers['Preview'] = 'true';
  }

  const params = new URLSearchParams();
  params.set('filter', `contentType:${contentType}`);
  if (options.filter) {
    params.append('filter', options.filter);
  }
  if (options.sort) {
    params.set('sort', options.sort);
  }
  // Delivery API returnerer bare 10 elementer når take utelates. Sidene bruker
  // disse samlingene som oppslags-pool for redaktørvalgte pickere, så en lav
  // implisitt grense gjør at valgt innhold droppes stille. Hent rikelig.
  params.set('take', String(options.take || 100));
  if (options.skip) {
    params.set('skip', String(options.skip));
  }
  if (options.preview) {
    params.set('preview', 'true');
  }

  const url = `${API_BASE}?${params.toString()}`;

  try {
    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`Umbraco API error: ${res.status} ${res.statusText}`);
    }

    const data: UmbracoResponse<T> = await res.json();

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

// ── Internal link resolution ────────────────────────────────────
//
// Rich-text editor output for internal content links is unusable verbatim:
// Umbraco's route.path uses auto-generated URL segments (e.g. "/gjoer-...")
// and lacks our frontend route prefix ("/veiledning/..."). richTextToHtml
// emits placeholders (href="#" + data-internal-link-id/type) and we resolve
// them here once we've fetched the article — translating destinationId to
// the canonical /veiledning/{guide.slug}/{step.slug}/{stegartikkel.slug}
// shape (and equivalents for other content types).

interface ResolvedContentItem {
  id: string;
  contentType: string;
  properties: Record<string, unknown>;
}

async function deliveryApiFetch<T>(path: string, options: FetchOptions = {}): Promise<T | null> {
  const headers: HeadersInit = { 'Accept': 'application/json' };
  if (options.locale) headers['Accept-Language'] = options.locale;
  if (options.preview && API_KEY) {
    headers['Api-Key'] = API_KEY;
    headers['Preview'] = 'true';
  }
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch (error) {
    console.error(`Failed to fetch from Umbraco Delivery API: ${path}`, error);
    return null;
  }
}

async function fetchContentItemById(id: string, options: FetchOptions = {}): Promise<ResolvedContentItem | null> {
  const previewSuffix = options.preview ? '?preview=true' : '';
  return deliveryApiFetch<ResolvedContentItem>(`/item/${id}${previewSuffix}`, options);
}

async function fetchContentAncestorsById(id: string, options: FetchOptions = {}): Promise<ResolvedContentItem[]> {
  const previewSuffix = options.preview ? '&preview=true' : '';
  const data = await deliveryApiFetch<UmbracoResponse<ResolvedContentItem>>(
    `?fetch=ancestors:${id}${previewSuffix}`,
    options,
  );
  return data?.items ?? [];
}

// Route patterns loaded from /shared/content-routes.json — single source of truth
// shared with the CMS preview-URL provider. See HeadlessPreviewUrlProvider.cs.
const CONTENT_ROUTES: Record<string, string> = contentRoutesConfig.routes;
const ANCESTOR_TOKEN_RE = /\{([a-zA-Z][a-zA-Z0-9]*)\.slug\}/g;

// Content types whose pattern references an ancestor's slug — i.e. resolver must
// fetch ancestors before building the URL. Derived from the patterns themselves
// so adding a new nested type only requires editing content-routes.json.
export const NEEDS_ANCESTORS: Set<string> = new Set(
  Object.entries(CONTENT_ROUTES)
    .filter(([, pattern]) => /\{[a-zA-Z][a-zA-Z0-9]*\.slug\}/.test(pattern))
    .map(([type]) => type),
);

const warnedMissingType = new Set<string>();

/**
 * Interpolates a content-type's route pattern with item slug and ancestor slugs.
 * Returns '#' if the content type is unmapped (with one-time console.warn) or
 * if a required ancestor slug cannot be resolved.
 */
export function buildUrlForContent(
  item: { contentType: string; id?: string; properties?: Record<string, unknown> },
  ancestors: Array<{ contentType: string; properties?: Record<string, unknown> }>,
): string {
  const pattern = CONTENT_ROUTES[item.contentType];
  if (!pattern) {
    if (!warnedMissingType.has(item.contentType)) {
      console.warn(`[umbraco] No route mapping for contentType "${item.contentType}" — falling back to "#". Add it to shared/content-routes.json.`);
      warnedMissingType.add(item.contentType);
    }
    return '#';
  }

  const slug = (item.properties?.slug as string | undefined) ?? '';
  const ancestorSlugByType = new Map<string, string>();
  for (const a of ancestors) {
    ancestorSlugByType.set(a.contentType, (a.properties?.slug as string | undefined) ?? '');
  }

  let unresolved: string | null = null;
  const resolved = pattern.replace(/\{([a-zA-Z][a-zA-Z0-9]*)(?:\.slug)?\}/g, (_match, key) => {
    if (key === 'slug') return slug;
    const ancestorSlug = ancestorSlugByType.get(key);
    if (!ancestorSlug) { unresolved = key; return ''; }
    return ancestorSlug;
  });

  if (unresolved) {
    console.warn(`[umbraco] Cannot resolve URL for ${item.contentType} (id=${item.id ?? '?'}): missing ancestor "${unresolved}". Pattern: ${pattern}`);
    return '#';
  }
  return resolved;
}

export function collectInternalLinkIds(html: string): Set<string> {
  const ids = new Set<string>();
  const re = /data-internal-link-id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return ids;
}

export function replaceInternalLinks(html: string, urls: Map<string, string>): string {
  // Anchor open tag: <a ...>. Placeholder has href="#" plus data-internal-link-id.
  // Rewrite href to the resolved URL and strip the data-internal-link-* attrs.
  return html.replace(/<a\b[^>]*>/g, (tag) => {
    const idMatch = tag.match(/data-internal-link-id="([^"]+)"/);
    if (!idMatch) return tag;
    const id = idMatch[1];
    const queryMatch = tag.match(/data-internal-link-query="([^"]*)"/);
    const query = queryMatch ? queryMatch[1] : '';
    const resolvedUrl = urls.get(id);
    const href = resolvedUrl ? resolvedUrl + query : '#';
    return tag
      .replace(/\shref="#"/, ` href="${escapeHtml(href)}"`)
      .replace(/\sdata-internal-link-(id|type|query)="[^"]*"/g, '');
  });
}

async function resolveInternalLinkUrls(
  ids: Iterable<string>,
  options: FetchOptions,
  cache: Map<string, string>,
): Promise<Map<string, string>> {
  const pending = [...ids].filter(id => !cache.has(id));
  if (pending.length === 0) return cache;

  await Promise.all(pending.map(async (id) => {
    const item = await fetchContentItemById(id, options);
    if (!item) {
      cache.set(id, '#');
      return;
    }
    const ancestors = NEEDS_ANCESTORS.has(item.contentType)
      ? await fetchContentAncestorsById(id, options)
      : [];
    cache.set(id, buildUrlForContent(item, ancestors));
  }));

  return cache;
}

type RteField = { get: () => string; set: (v: string) => void };

/**
 * Walks any value recursively and yields a settable accessor for every string
 * that contains the internal-link marker. Field-agnostic so new RTE-bearing
 * shapes (new block types, nested arrays) work without code changes here.
 */
export function collectRteFields(root: unknown): RteField[] {
  const fields: RteField[] = [];
  const MARKER = 'data-internal-link-id="';

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const child = value[i];
        if (typeof child === 'string') {
          if (child.includes(MARKER)) {
            fields.push({ get: () => value[i] as string, set: (s) => { value[i] = s; } });
          }
        } else if (child && typeof child === 'object') {
          walk(child);
        }
      }
      return;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        const child = obj[key];
        if (typeof child === 'string') {
          if (child.includes(MARKER)) {
            fields.push({ get: () => obj[key] as string, set: (s) => { obj[key] = s; } });
          }
        } else if (child && typeof child === 'object') {
          walk(child);
        }
      }
    }
  };

  walk(root);
  return fields;
}

/**
 * Walks a UmbracoBlock[] tree mutating HTML fields in-place, replacing internal
 * link placeholders (emitted by richTextToHtml) with resolved frontend URLs.
 * Uses an optional shared cache so repeated targets across an article cost a
 * single Delivery API round-trip.
 */
export async function enrichBlocksInternalLinks(
  blocks: UmbracoBlock[] | undefined,
  options: FetchOptions = {},
  cache: Map<string, string> = new Map(),
): Promise<void> {
  if (!blocks || blocks.length === 0) return;

  const fields = collectRteFields(blocks);

  const ids = new Set<string>();
  for (const f of fields) {
    for (const id of collectInternalLinkIds(f.get())) ids.add(id);
  }
  if (ids.size === 0) return;

  await resolveInternalLinkUrls(ids, options, cache);
  for (const f of fields) {
    const html = f.get();
    if (html.includes('data-internal-link-id="')) {
      f.set(replaceInternalLinks(html, cache));
    }
  }
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
    case 'eksempler':
      return {
        ...base,
        heroTittel: props.heroTittel as string || '',
        seksjoner: mapEksemplerSeksjoner(props.seksjoner),
        seoTittel: props.seoTittel as string || '',
        seoBeskrivelse: props.seoBeskrivelse as string || '',
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'artikler': {
      const featured = props.featuredArtikkel as { id?: string } | Array<{ id?: string }> | undefined;
      const featuredNode = Array.isArray(featured) ? featured[0] : featured;
      return {
        ...base,
        heroTittel: props.heroTittel as string || '',
        heroSubtittel: props.heroSubtittel as string || '',
        featuredArtikkelId: featuredNode?.id || undefined,
        seksjoner: mapArtiklerSeksjoner(props.seksjoner),
        seoTittel: props.seoTittel as string || '',
        seoBeskrivelse: props.seoBeskrivelse as string || '',
        seoBilde: mapMedia(props.seoBilde),
      } as T;
    }

    case 'artikkel':
    case 'eksempel':
    case 'enkelVeiledning':
    case 'stegartikkel':
    case 'side':
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || '',
        ingress: props.ingress as string || '',
        artikkelBilde: mapMedia(props.artikkelBilde),
        bildeAlt: props.bildeAlt as string || '',
        bakgrunn: bakgrunnKey(props.bakgrunn) || 'accent',
        innhold: mapArtikkelBlocks(props.innhold),
        seoTittel: props.seoTittel as string || '',
        seoBeskrivelse: props.seoBeskrivelse as string || '',
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'kalenderhendelse':
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || '',
        type: props.type as string || undefined,
        ingress: props.ingress as string || '',
        detaljertBeskrivelse: mapRichText(props.detaljertBeskrivelse),
        startDato: props.startDato as string || '',
        sluttDato: props.sluttDato as string || undefined,
        tid: props.tid as string || undefined,
        sted: props.sted as string || undefined,
        lenke: props.lenke as string || undefined,
        pris: props.pris as string || undefined,
      } as T;

    case 'kalender':
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        ingress: props.ingress as string || '',
        featuredHendelse: mapFeaturedHendelse(props.featuredHendelse),
        seoTittel: props.seoTittel as string || '',
        seoBeskrivelse: props.seoBeskrivelse as string || '',
        seoBilde: mapMedia(props.seoBilde),
      } as T;



    case 'veiledningGuide':
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || '',
        ingress: props.ingress as string || '',
        innholdBlokker: mapVeiledningBlocks(props.innholdBlokker),
        stegGruppeTittler: props.stegGruppeTittler as string || '',
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
        ingress: props.ingress as string || '',
        innholdBlokker: mapVeiledningBlocks(props.innholdBlokker),
      } as T;

    case 'forside':
      return {
        ...base,
        seksjoner: mapForsideSeksjoner(props.seksjoner),
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
      // Rik artikkelmal (#362): artikkelhode + innhold-blokkliste, som artikkel/sandkasse.
      return {
        ...base,
        tittel: props.tittel as string || item.name,
        slug: props.slug as string || 'om-oss',
        ingress: props.ingress as string || '',
        artikkelBilde: mapMedia(props.artikkelBilde),
        bildeAlt: props.bildeAlt as string || '',
        bakgrunn: bakgrunnKey(props.bakgrunn) || 'accent',
        innhold: mapArtikkelBlocks(props.innhold),
        seoTittel: props.seoTittel as string || undefined,
        seoBeskrivelse: props.seoBeskrivelse as string || undefined,
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
        bakgrunn: bakgrunnKey(props.bakgrunn) || 'accent',
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
        seksjon3Tittel: props.seksjon3Tittel as string || undefined,
        seksjon3Kort: mapVeiledningKort(props.seksjon3Kort),
        eksempelKortTag: props.eksempelKortTag as string || undefined,
        seoTittel: props.seoTittel as string || undefined,
        seoBeskrivelse: props.seoBeskrivelse as string || undefined,
        seoBilde: mapMedia(props.seoBilde),
      } as T;

    case 'globaleInnstillinger':
      return {
        ...base,
        cookieTittel: props.cookieTittel as string || '',
        cookieTekst: richTextHtml(props.cookieTekst),
        cookieJaLabel: props.cookieJaLabel as string || '',
        cookieNeiLabel: props.cookieNeiLabel as string || '',
        cookieSekundaerTekst: richTextHtml(props.cookieSekundaerTekst),
        tittel404: props.tittel404 as string || '',
        beskrivelse404: props.beskrivelse404 as string || '',
        tittel503: props.tittel503 as string || '',
        beskrivelse503: props.beskrivelse503 as string || '',
        vedlikeholdEpost: props.vedlikeholdEpost as string || '',
        footerBeskrivelse: props.footerBeskrivelse as string || undefined,
        footerEpost: props.footerEpost as string || undefined,
        footerLenke1Tekst: props.footerLenke1Tekst as string || undefined,
        footerLenke1Url: props.footerLenke1Url as string || undefined,
        footerLenke3Tekst: props.footerLenke3Tekst as string || undefined,
        footerLenke3Url: props.footerLenke3Url as string || undefined,
        footerLenke4Tekst: props.footerLenke4Tekst as string || undefined,
        footerLenke4Url: props.footerLenke4Url as string || undefined,
        footerLenke5Tekst: props.footerLenke5Tekst as string || undefined,
        footerLenke5Url: props.footerLenke5Url as string || undefined,
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
        // Per-block settings (Innstillinger tab). gruppeTittel signals "start a new
        // group with this title" — the renderer uses it to break/merge accordion runs.
        const settingsProps = block.settings?.properties ?? {};
        return {
          contentType: 'artikkelTrekkspill',
          content: { tittel: props.tittel || '', innhold: html },
          settings: { gruppeTittel: (settingsProps.gruppeTittel as string) || '' },
        };
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
function richTextHtml(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'object' && !Array.isArray(value) && (value as any).tag === '#root') {
    return richTextToHtml(value as RichTextNode);
  }
  if (typeof value === 'string') return value;
  return '';
}

function mapVeiledningBlocks(value: unknown): UmbracoBlock[] | undefined {
  const items = (value as any)?.items;
  if (!Array.isArray(items)) return undefined;

  return items.map((block: any) => {
    const content = block.content || block;
    const ct = content.contentType || 'veiledningTekst';
    const props = content.properties || content;

    const richHtml = (raw: unknown): string =>
      (raw as any)?.tag === '#root'
        ? richTextToHtml(raw as RichTextNode)
        : (typeof raw === 'string' ? raw : '');

    if (ct === 'veiledningTekst') {
      return { contentType: 'veiledningTekst', content: { innhold: richHtml(props.innhold) } };
    }
    if (ct === 'veiledningInfo') {
      const trekkspillRaw = (props.trekkspill as any)?.items;
      const trekkspill = Array.isArray(trekkspillRaw)
        ? trekkspillRaw.map((t: any) => {
            const tc = t.content?.properties || t.content || t.properties || t;
            return { tittel: tc.tittel || tc.title || '', innhold: richHtml(tc.innhold || tc.body) };
          })
        : undefined;
      return { contentType: 'veiledningInfo', content: {
        tittel: props.tittel || '',
        innhold: richHtml(props.innhold),
        trekkspill,
        lesMerTittel: props.lesMerTittel || undefined,
        lesMerUrl: props.lesMerUrl || undefined,
      } };
    }
    if (ct === 'veiledningEksempel') {
      return { contentType: 'veiledningEksempel', content: { tittel: props.tittel || '', innhold: richHtml(props.innhold) } };
    }
    if (ct === 'veiledningObs') {
      return { contentType: 'veiledningObs', content: {
        tittel: props.tittel || '',
        tekst: richHtml(props.tekst),
      } };
    }
    if (ct === 'veiledningTrekkspill') {
      return { contentType: 'veiledningTrekkspill', content: { tittel: props.tittel || '', innhold: richHtml(props.innhold) } };
    }

    return { contentType: ct, content: props };
  });
}

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

function mapMedia(value: unknown): UmbracoMedia | undefined {
  if (!value) return undefined;
  if (Array.isArray(value) && value.length > 0) {
    const media = value[0];
    return {
      id: media.id || '',
      url: media.url || media.mediaUrl || '',
      alternativeText: media.altText || media.name || '',
      width: media.width,
      height: media.height,
      focalPoint: media.focalPoint,
    };
  }
  if (typeof value === 'object' && value !== null) {
    const media = value as any;
    return {
      id: media.id || '',
      url: media.url || media.mediaUrl || '',
      alternativeText: media.altText || media.name || '',
      width: media.width,
      height: media.height,
    };
  }
  return undefined;
}

function pickerId(value: unknown): string | undefined {
  if (!value) return undefined;
  const item = Array.isArray(value) ? value[0] : value;
  return (item as any)?.id || undefined;
}

function pickerIds(value: unknown): string[] {
  if (!value) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((item: any) => item?.id).filter((id): id is string => !!id);
}

function mapForsideSeksjoner(value: unknown): ForsideSeksjon[] | undefined {
  const items = (value as any)?.items;
  if (!Array.isArray(items)) return undefined;

  return items.map((block: any): ForsideSeksjon => {
    const content = block.content || block;
    const props = content.properties || {};
    // overskrift er ren tekst på de fleste moduler, men rik tekst på hero (uthevbar).
    const overskrift = props.overskrift as any;
    // sandkasse-tekst er nå vanlig tekst; håndter eldre rik-tekst-verdier til de re-lagres.
    const tekst = props.tekst as any;
    return {
      contentType: content.contentType,
      id: content.id || '',
      overskrift: typeof overskrift === 'string' ? (overskrift || undefined) : undefined,
      overskriftHtml: overskrift?.tag === '#root' ? richTextToHtml(overskrift) : undefined,
      komIGangTekst: (props.komIGangTekst as string) || undefined,
      label: (props.label as string) || undefined,
      tittel: (props.tittel as string) || undefined,
      ingress: (props.ingress as string) || undefined,
      lenketekst: (props.lenketekst as string) || undefined,
      lenkeUrl: (props.lenkeUrl as string) || undefined,
      illustrasjon: mapMedia(props.illustrasjon),
      tekst: typeof tekst === 'string' ? (tekst || undefined) : (tekst?.tag === '#root' ? richTextToHtml(tekst) : undefined),
      arrangementId: pickerId(props.arrangement),
      veiledningId: pickerId(props.veiledning),
      fremhevetArtikkelId: pickerId(props.fremhevetArtikkel),
      forstaLenkeIds: mapForstaLenker(props.lenker),
      kort: mapForsideKort(props.kort),
      kortTag: (props.kortTag as string) || undefined,
    };
  });
}

// Leser nested block list (forsideForstaLenke) under "Forstå regelverket"-modulen.
// Hvert element har en content-picker (lenke) til veiledning/artikkel.
function mapForstaLenker(value: unknown): string[] | undefined {
  const items = (value as any)?.items;
  if (!Array.isArray(items) || items.length === 0) return undefined;
  return items
    .map((block: any) => pickerId((block.content || block).properties?.lenke))
    .filter((id: string | undefined): id is string => !!id);
}

// Leser nested block list (forsideArtikkelKort/forsideEksempelKort) under en forside-modul.
// Hvert kort har en content-picker (artikkel eller eksempel) + valgfri ingress-overstyring.
function mapForsideKort(value: unknown): ForsideKort[] | undefined {
  const items = (value as any)?.items;
  if (!Array.isArray(items) || items.length === 0) return undefined;

  return items
    .map((block: any): ForsideKort => {
      const content = block.content || block;
      const props = content.properties || {};
      // Artikkelkort bruker "artikkel", eksempelkort bruker "eksempel".
      const id = pickerId(props.artikkel) ?? pickerId(props.eksempel);
      return {
        id,
        ingress: (props.ingress as string) || undefined,
      };
    })
    .filter((k: ForsideKort) => !!k.id);
}

function mapEksemplerSeksjoner(value: unknown): EksemplerSeksjon[] | undefined {
  const items = (value as any)?.items;
  if (!Array.isArray(items)) return undefined;

  return items.map((block: any) => {
    const content = block.content || block;
    const ct = content.contentType;
    const props = content.properties || {};
    const id = content.id || '';

    if (ct === 'eksempelFeatured') {
      return { contentType: ct, id, eksempelId: pickerId(props.eksempel), ingress: (props.ingress as string) || undefined };
    }
    if (ct === 'eksempelGruppe') {
      // Per-kort farge (fargeN) er et planlagt redaksjonelt felt — finnes ikke i CMS ennå.
      const refs = [1, 2, 3, 4, 5, 6]
        .map((n) => ({ id: pickerId(props[`eksempel${n}`]), farge: props[`farge${n}`] }))
        .filter((r): r is { id: string; farge: unknown } => !!r.id);
      const normaliserFarge = (f: unknown): 'dark' | 'light' | undefined =>
        f === 'lys' || f === 'light' ? 'light' : f === 'mork' || f === 'dark' ? 'dark' : undefined;
      return {
        contentType: ct,
        id,
        tittel: props.tittel || undefined,
        antallKolonner: Number(props.antallKolonner) || 3,
        eksempelIds: refs.map((r) => r.id),
        kortTag: (props.kortTag as string) || undefined,
        kortFarger: refs.map((r) => normaliserFarge(r.farge)),
      };
    }
    if (ct === 'eksempelRelatert') {
      // Per-kort tag (relatertTagN) er et planlagt redaksjonelt felt — finnes ikke i CMS ennå.
      const refs = [1, 2, 3]
        .map((n) => ({ id: pickerId(props[`relatert${n}`]), tag: props[`relatertTag${n}`] }))
        .filter((r): r is { id: string; tag: unknown } => !!r.id);
      return {
        contentType: ct,
        id,
        tittel: props.tittel || undefined,
        relatertIds: refs.map((r) => r.id),
        relatertTags: refs.map((r) => (typeof r.tag === 'string' && r.tag ? r.tag : undefined)),
      };
    }
    if (ct === 'eksempelKontakt') {
      return {
        contentType: ct,
        id,
        tittel: props.tittel || '',
        navn: props.navn || undefined,
        epost: props.epost || undefined,
        stilling: props.stilling || undefined,
      };
    }
    return { contentType: ct, id };
  });
}

function mapArtiklerSeksjoner(value: unknown): ArtiklerSeksjon[] | undefined {
  const items = (value as any)?.items;
  if (!Array.isArray(items)) return undefined;

  return items.map((block: any): ArtiklerSeksjon => {
    const content = block.content || block;
    const ct = content.contentType;
    const props = content.properties || {};
    const id = content.id || '';

    if (ct === 'artikkelFeatured') {
      return { contentType: ct, id, artikkelId: pickerId(props.artikkel), ingress: (props.ingress as string) || undefined };
    }
    if (ct === 'artikkelGruppe') {
      const refs = [1, 2, 3, 4, 5, 6].map((n) => pickerId(props[`artikkel${n}`])).filter((x): x is string => !!x);
      return {
        contentType: ct,
        id,
        tittel: (props.tittel as string) || undefined,
        antallKolonner: Number(props.antallKolonner) || 3,
        artikkelIds: refs,
      };
    }
    if (ct === 'artikkelRelatert') {
      const refs = [1, 2, 3]
        .map((n) => ({ id: pickerId(props[`relatert${n}`]), tag: props[`relatertTag${n}`] }))
        .filter((r): r is { id: string; tag: unknown } => !!r.id);
      return {
        contentType: ct,
        id,
        tittel: (props.tittel as string) || undefined,
        relatertIds: refs.map((r) => r.id),
        relatertTags: refs.map((r) => (typeof r.tag === 'string' && r.tag ? r.tag : undefined)),
      };
    }
    return { contentType: ct, id };
  });
}

function mapFeaturedHendelse(value: unknown): Kalenderhendelse | null {
  if (!value) return null;
  const item = value as any;
  const node = Array.isArray(item) ? item[0] : item;
  if (!node) return null;
  const p = node.properties || {};
  return {
    id: node.id || '',
    documentId: node.id || '',
    tittel: p.tittel || node.name || '',
    slug: p.slug || '',
    type: p.type || undefined,
    ingress: p.ingress || '',
    detaljertBeskrivelse: undefined,
    startDato: p.startDato || '',
    sluttDato: p.sluttDato || undefined,
    tid: p.tid || undefined,
    sted: p.sted || undefined,
    lenke: p.lenke || undefined,
    pris: p.pris || undefined,
    createdAt: node.createDate || '',
    updatedAt: node.updateDate || '',
    publishedAt: node.createDate || '',
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

// Standard bredder for leveranse-resizing (ImageSharp width-param). Originalen
// i CMS er urort; vi henter en nedskalert webp per kontekst. Tallene dekker
// retina (2x) pa typisk visnings-storrelse. Juster her, ett sted.
export const MEDIA_WIDTH = {
  hero: 1600, // stor toppfigur, bred desktop + retina
  content: 1200, // bilde i artikkelspalten
  card: 800, // kort/listebilde
} as const;

// Legger pa ImageSharp-resizing nar en width er gitt. Umbraco rendrer da en
// nedskalert webp on-demand og cacher den. SVG/GIF hoppes over (vektor/animasjon
// skal ikke rasteres). Uten width returneres URLen urort (f.eks. og:image).
function withImageParams(url: string, width?: number): string {
  if (!width) return url;
  if (/\.(svg|gif)(\?|$)/i.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}width=${width}&format=webp&quality=80`;
}

// Gjor en relativ Umbraco media-URL (/media/...) absolutt mot CMS-hosten.
// Passerer allerede-absolutte (http) og ikke-media-URLer uendret. Med en width
// legges leveranse-resizing pa (kun pa faktiske media-URLer).
export function toAbsoluteMediaUrl(url?: string, width?: number): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return withImageParams(url, width);
  if (url.startsWith('/media')) return withImageParams(`${UMBRACO_PUBLIC_URL}${url}`, width);
  return url;
}

// Full media-URL for et media-objekt. Default-optimaliserer til content-bredde
// slik at et nytt bilde aldri serveres i full storrelse ved et uhell; send
// MEDIA_WIDTH.hero / .card (eller egen width) for andre kontekster.
export function getMediaUrl(media?: UmbracoMedia, width: number = MEDIA_WIDTH.content): string | undefined {
  return toAbsoluteMediaUrl(media?.url, width);
}

/**
 * Normaliser bakgrunn-verdien fra CMS til en nokkel.
 * Dropdown gir en streng ("accent"); ColorPicker med labels gir { label, value }.
 */
export function bakgrunnKey(raw: any): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') return raw || undefined;
  return (raw.label as string) || (raw.value as string) || undefined;
}

/**
 * Redaksjonell bakgrunnsfarge for artikkelhodet -> DS surface CSS-variabel.
 * Tre valg: accent (standard), brand1, brand2. Robust for label ("Accent"/"Brand 1"),
 * nokkel ("accent") og hex ("e9c0c8"). Ukjent/tom -> accent.
 */
export function bakgrunnSurface(bakgrunn?: string): string {
  switch ((bakgrunn || '').toLowerCase().replace(/[\s#]/g, '')) {
    case 'brand1':
    case 'dfc2d4':
      return 'var(--ds-color-brand1-surface-active)';
    case 'brand2':
    case 'e2d8d2':
      return 'var(--ds-color-brand2-surface-hover)';
    case 'accent':
    case 'e9c0c8':
    default:
      return 'var(--ds-color-accent-surface-active)';
  }
}

/**
 * Extract plain text from UmbracoBlock[] (useful for excerpts and SEO).
 * Strips HTML tags from the tekst block's innhold.
 */
export function getPlainText(blocks?: UmbracoBlock[], maxLength?: number): string {
  if (!blocks || blocks.length === 0) return '';
  // Read text from any block that carries body text. The PR maps side/eksempel
  // bodies via 'artikkelTekst' (content.innhold); veiledning uses the same shape;
  // legacy data used contentType 'tekst' (content.tekst or content.innhold).
  // Stay generic so excerpts/SEO never silently return ''.
  const html = blocks
    .map(b => (b.content?.innhold as string) ?? (b.content?.tekst as string) ?? '')
    .filter(Boolean)
    .join(' ');
  // Strip HTML tags
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (maxLength && text.length > maxLength) {
    return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
  }
  return text;
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
  const item = await fetchBySlug<Artikkel>('artikkel', slug, options);
  if (item) await enrichBlocksInternalLinks(item.innhold, options);
  return item;
}

export async function getStegartikkel(slug: string, options: FetchOptions = {}) {
  const item = await fetchBySlug<Stegartikkel>('stegartikkel', slug, options);
  if (item) await enrichBlocksInternalLinks(item.innhold, options);
  return item;
}

export async function getStegartiklerForSteg(stegSlug: string, options: FetchOptions = {}) {
  const result = await fetchCollection<Stegartikkel>('stegartikkel', { ...options, take: 100 });
  return result.data;
}

// ── Kalender API functions ──────────────────────────────────────

export async function getKalender(options: FetchOptions = {}): Promise<Kalender | null> {
  const result = await fetchCollection<Kalender>('kalender', { ...options, take: 1 });
  return result.data[0] || null;
}

export async function getKalenderhendelser(options: FetchOptions = {}) {
  return fetchCollection<Kalenderhendelse>('kalenderhendelse', {
    ...options,
    take: 100,
  });
}

// ── Side (Page) API functions ───────────────────────────────────

export async function getSider(options: FetchOptions = {}) {
  return fetchCollection<Side>('side', options);
}

export async function getSide(slug: string, options: FetchOptions = {}) {
  const item = await fetchBySlug<Side>('side', slug, options);
  if (item) await enrichBlocksInternalLinks(item.innhold, options);
  return item;
}

// ── Eksempel API functions ──────────────────────────────────────

export async function getEksemplerOversikt(options: FetchOptions = {}): Promise<EksemplerOversikt | null> {
  const result = await fetchCollection<EksemplerOversikt>('eksempler', { ...options, take: 1 });
  return result.data[0] || null;
}

export async function getArtiklerOversikt(options: FetchOptions = {}): Promise<ArtiklerOversikt | null> {
  const result = await fetchCollection<ArtiklerOversikt>('artikler', { ...options, take: 1 });
  return result.data[0] || null;
}

export async function getEksempler(options: FetchOptions = {}) {
  return fetchCollection<Eksempel>('eksempel', {
    skip: 0,
    take: 50,
    sort: 'updateDate:desc',
    ...options,
  });
}

export async function getEksempel(slug: string, options: FetchOptions = {}) {
  const item = await fetchBySlug<Eksempel>('eksempel', slug, options);
  if (item) await enrichBlocksInternalLinks(item.innhold, options);
  return item;
}

// ── Forside (Frontpage) API functions ───────────────────────────

export async function getForside(options: FetchOptions = {}): Promise<Forside | null> {
  const result = await fetchCollection<Forside>('forside', { ...options, take: 1 });
  return result.data[0] || null;
}

export async function getGlobaleInnstillinger(options: FetchOptions = {}): Promise<GlobaleInnstillinger | null> {
  const result = await fetchCollection<GlobaleInnstillinger>('globaleInnstillinger', { ...options, take: 1 });
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
  const steps = result.data
    .filter(s => s.guideSlug === guideSlug)
    .sort((a, b) => a.steg !== b.steg ? a.steg - b.steg : a.understeg - b.understeg);
  // Share a cache across all steps in the guide — internal targets repeat across
  // step bodies and we only want one Delivery API round-trip per target.
  const cache = new Map<string, string>();
  await Promise.all(steps.map(s => enrichBlocksInternalLinks(s.innholdBlokker, options, cache)));
  return steps;
}

export async function getVeiledningStegBySlug(guideSlug: string, stepSlug: string, options: FetchOptions = {}) {
  const steps = await getVeiledningSteg(guideSlug, options);
  return steps.find(s => s.slug === stepSlug) || null;
}

export async function getEnkelVeiledning(slug: string, options: FetchOptions = {}) {
  const item = await fetchBySlug<EnkelVeiledning>('enkelVeiledning', slug, options);
  if (item) await enrichBlocksInternalLinks(item.innhold, options);
  return item;
}

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
  const item = (await fetchCollection<Sandkasse>('sandkasse', { ...options, take: 1 })).data[0] || null;
  if (item) await enrichBlocksInternalLinks(item.innhold, options);
  return item;
}

// ── Veiledning Oversikt API functions ────────────────────────────

/**
 * Fetches the Veiledning overview content. Prefers the new flat structure (fields on
 * the 'veiledninger' container itself); falls back to legacy standalone 'veiledningOversikt'
 * during the migration window.
 */
export async function getVeiledningOversikt(options: FetchOptions = {}): Promise<VeiledningOversikt | null> {
  const result = await fetchCollection<VeiledningOversikt>('veiledninger', { ...options, take: 1 });
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

  const headers: HeadersInit = { 'Accept': 'application/json' };
  if (options.preview && API_KEY) {
    headers['Api-Key'] = API_KEY;
    // Umbraco Delivery API leverer kladd kun med Preview-header (ikke ?preview-query).
    headers['Preview'] = 'true';
  }

  const params = new URLSearchParams();
  params.set('search', query);
  params.set('take', '50');
  if (options.preview) {
    params.set('preview', 'true');
  }

  const url = `${API_BASE}?${params.toString()}`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Umbraco search error: ${res.status} ${res.statusText}`);
    }

    const data: UmbracoResponse<SearchResult> = await res.json();

    const results: SearchResult[] = data.items
      .filter(item => ['artikkel', 'eksempel', 'veiledningGuide', 'veiledningSteg', 'side', 'faq'].includes(item.contentType))
      .map(item => {
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
        const eksempelIngress = e.ingress || '';
        if (e.tittel.toLowerCase().includes(lowerQuery) || eksempelIngress.toLowerCase().includes(lowerQuery) || getPlainText(e.innhold, 500).toLowerCase().includes(lowerQuery)) {
          allResults.push({ id: e.id, tittel: e.tittel, slug: e.slug, contentType: 'eksempel', excerpt: eksempelIngress || getPlainText(e.innhold, 200), publishedAt: e.publishedAt });
        }
      }
      for (const g of guides.data) {
        const guideBody = getPlainText(g.innholdBlokker, 500);
        const guideIngress = g.ingress || '';
        if (g.tittel.toLowerCase().includes(lowerQuery) || guideIngress.toLowerCase().includes(lowerQuery) || guideBody.toLowerCase().includes(lowerQuery)) {
          allResults.push({ id: g.id, tittel: g.tittel, slug: g.slug, contentType: 'veiledningGuide', excerpt: guideIngress || getPlainText(g.innholdBlokker, 200), publishedAt: g.publishedAt });
        }
      }
    } catch { /* return empty if fallback also fails */ }

    return {
      data: allResults,
      meta: { pagination: { page: 1, pageSize: allResults.length, pageCount: 1, total: allResults.length } },
    };
  }
}

