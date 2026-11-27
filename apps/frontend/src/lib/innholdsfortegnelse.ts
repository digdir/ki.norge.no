import { parseHTML } from 'linkedom';
import type { UmbracoBlock } from './umbraco';

export interface Overskrift {
  id: string;
  tekst: string;
}

export interface ArtikkelOverskrifter {
  /** Every h2 the article renders, in page order. */
  overskrifter: Overskrift[];
  /** Rich text with ids on its h2s, for the blocks that have any. */
  html: Map<UmbracoBlock, string>;
  /** The id of the h2 a block renders as its title. */
  tittelId: Map<UmbracoBlock, string>;
}

/** Fewer than this, and a table of contents says nothing the page does not. */
export const MIN_OVERSKRIFTER = 2;

const RIK_TEKST = new Set(['artikkelTekst', 'tekst']);

/**
 * Ids the layout and the pages that render article blocks use, which a heading
 * must not take. innholdsfortegnelse.test.ts fails when a fixed id in the
 * markup is missing here.
 */
export const RESERVERT: ReadonlySet<string> = new Set([
  'main-content',
  'header-mobile-menu',
  'search-dialog-heading',
  'cookie-notice',
  'cookie-notice-allow',
  'cookie-notice-deny',
  'toc-tittel',
  'event-opptak-heading',
  'featured-event',
  'panel-kommende',
  'panel-tidligere',
  'sok-tiltak',
  'tiltak-detalj-tittel',
  'tiltak-filter-tittel',
]);

/**
 * The id of a heading with this text. richTextToHtml gives every rich text
 * heading this id, and links to those headings already exist, so the scheme
 * must stay as it is.
 */
export function lagId(tekst: string): string {
  return tekst.toLowerCase().replace(/[^a-zæøå0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const ID_ATTR = /\sid="([^"]+)"/g;

function samleIder(verdi: unknown, ut: Set<string>): void {
  if (typeof verdi === 'string') {
    if (verdi.includes('id="')) for (const m of verdi.matchAll(ID_ATTR)) ut.add(m[1]);
  } else if (Array.isArray(verdi)) {
    for (const v of verdi) samleIder(v, ut);
  } else if (verdi && typeof verdi === 'object') {
    for (const v of Object.values(verdi)) samleIder(v, ut);
  }
}

/** The text of a heading, with a line break read as a space. */
function overskriftTekst(el: Element): string {
  const kopi = el.cloneNode(true) as Element;
  for (const br of Array.from(kopi.querySelectorAll('br'))) br.replaceWith(' ');
  return (kopi.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Finds the h2s of an article and makes sure each has an id no element before
 * it on the page has.
 *
 * A rich text heading keeps the id richTextToHtml gave it unless that id is
 * already taken, so existing links to it keep working. Block titles get
 * theirs last, so they never take the id of a rich text heading.
 *
 * Headings inside accordions are left out, since they are hidden until the
 * accordion is opened. So is the contact card, which closes the page rather
 * than being a section of it.
 */
export function artikkelOverskrifter(blocks?: UmbracoBlock[]): ArtikkelOverskrifter {
  const result: ArtikkelOverskrifter = { overskrifter: [], html: new Map(), tittelId: new Map() };
  const brukt = new Set(RESERVERT);

  const nyId = (base: string): string => {
    base ||= 'seksjon';
    let id = base;
    for (let n = 2; brukt.has(id); n++) id = `${base}-${n}`;
    brukt.add(id);
    return id;
  };

  const titler: { block: UmbracoBlock; overskrift: Overskrift }[] = [];
  const tittel = (block: UmbracoBlock, tekst: unknown) => {
    const t = typeof tekst === 'string' ? tekst.trim() : '';
    if (!t) return;
    const overskrift = { id: '', tekst: t };
    titler.push({ block, overskrift });
    result.overskrifter.push(overskrift);
  };

  for (const block of blocks ?? []) {
    const c = block.content as Record<string, unknown>;
    if (block.contentType === 'artikkelTrekkspill') {
      // Only the block that starts a titled group renders the h2, see ArticleBlocksRenderer.
      tittel(block, block.settings?.gruppeTittel);
    } else if (block.contentType === 'artikkelProsessteg') {
      tittel(block, c.tittel);
    } else if (RIK_TEKST.has(block.contentType) && typeof c.innhold === 'string' && /<h2[\s>]/i.test(c.innhold)) {
      const { document } = parseHTML(`<div>${c.innhold}</div>`);
      const root = document.querySelector('div')!;
      let endret = false;
      // In document order, so an id is only taken by elements before the heading.
      for (const el of Array.from(root.querySelectorAll('*'))) {
        const eksisterende = el.getAttribute('id') ?? '';
        if (el.tagName !== 'H2' || el.parentElement !== root) {
          if (eksisterende) brukt.add(eksisterende);
          continue;
        }
        const tekst = overskriftTekst(el);
        if (!tekst) {
          if (eksisterende) brukt.add(eksisterende);
          continue;
        }
        const id = nyId(eksisterende || lagId(tekst));
        if (id !== eksisterende) {
          el.setAttribute('id', id);
          endret = true;
        }
        result.overskrifter.push({ id, tekst });
      }
      if (endret) result.html.set(block, root.innerHTML);
      continue;
    }
    samleIder(block.content, brukt);
  }
  for (const { block, overskrift } of titler) {
    overskrift.id = nyId(lagId(overskrift.tekst));
    result.tittelId.set(block, overskrift.id);
  }
  return result;
}
