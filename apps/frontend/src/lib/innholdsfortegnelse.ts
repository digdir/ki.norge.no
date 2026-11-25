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

// Ids the layout uses, which a heading must not take.
const RESERVERT = new Set(['main-content', 'header-mobile-menu', 'cookie-notice', 'search-dialog-heading']);

export function lagId(tekst: string): string {
  const id = tekst
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id || 'seksjon';
}

/**
 * Finds the h2s of an article and gives each a unique id. The page and
 * ArticleBlocksRenderer both call it on the same blocks, so the links in the
 * table of contents and the ids on the headings always match.
 *
 * Headings inside accordions are left out, since they are hidden until the
 * accordion is opened. So is the contact card, which closes the page rather
 * than being a section of it.
 */
export function artikkelOverskrifter(blocks?: UmbracoBlock[]): ArtikkelOverskrifter {
  const result: ArtikkelOverskrifter = { overskrifter: [], html: new Map(), tittelId: new Map() };
  const brukt = new Set(RESERVERT);

  const nyId = (tekst: string): string => {
    const base = lagId(tekst);
    let id = base;
    for (let n = 2; brukt.has(id); n++) id = `${base}-${n}`;
    brukt.add(id);
    return id;
  };

  const tittel = (block: UmbracoBlock, tekst: unknown) => {
    const t = typeof tekst === 'string' ? tekst.trim() : '';
    if (!t) return;
    const id = nyId(t);
    result.tittelId.set(block, id);
    result.overskrifter.push({ id, tekst: t });
  };

  for (const block of blocks ?? []) {
    const c = block.content as Record<string, unknown>;
    switch (block.contentType) {
      case 'artikkelTrekkspill':
        // Only the block that starts a titled group renders the h2, see ArticleBlocksRenderer.
        tittel(block, block.settings?.gruppeTittel);
        break;
      case 'artikkelProsessteg':
        tittel(block, c.tittel);
        break;
      default: {
        if (!RIK_TEKST.has(block.contentType) || typeof c.innhold !== 'string') break;
        if (!/<h2[\s>]/i.test(c.innhold)) break;
        const { document } = parseHTML(`<div>${c.innhold}</div>`);
        const root = document.querySelector('div')!;
        let funnet = false;
        for (const h2 of Array.from(root.children).filter(el => el.tagName === 'H2')) {
          const tekst = (h2.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (!tekst) continue;
          const id = nyId(tekst);
          h2.setAttribute('id', id);
          result.overskrifter.push({ id, tekst });
          funnet = true;
        }
        if (funnet) result.html.set(block, root.innerHTML);
      }
    }
  }
  return result;
}
