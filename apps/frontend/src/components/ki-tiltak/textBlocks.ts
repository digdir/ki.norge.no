/**
 * Splits editorial free text from ki-tiltak.json into paragraphs and bullet lists.
 *
 * The dataset is a JSON file the editors maintain by hand, and JSON
 * has no room for markup. Line breaks are therefore written as \n, and lines that
 * start with a bullet marker become a real list when rendered. That way we avoid
 * both a separate schema for bullet lists and a markdown dependency, and
 * screen readers get <ul> instead of a bullet character in the middle of a sentence.
 *
 * Free of React, so the splitting can be tested without a DOM.
 */

/** The characters editors realistically use as bullets, including lists pasted from Word. */
const BULLET = /^\s*[•·▪*-]\s+/;

/**
 * Numbered items, "1." or "1)".
 *
 * At most two digits on purpose: without that limit a line that starts with
 * a year, "2026. Vi startet …", would be read as a list item.
 */
const NUMBERED = /^\s*\d{1,2}[.)]\s+/;

export type TextBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

export function toTextBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let list: string[] = [];
  let ordered = false;

  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'list', ordered, items: list });
      list = [];
    }
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) {
      flushList();
      continue;
    }

    const marker = NUMBERED.test(line) ? NUMBERED : BULLET.test(line) ? BULLET : null;
    if (marker !== null) {
      const isOrdered = marker === NUMBERED;
      // If the marker type changes in the middle of a list, a new list starts.
      if (list.length > 0 && isOrdered !== ordered) flushList();
      ordered = isOrdered;
      list.push(line.replace(marker, '').trim());
      continue;
    }

    flushList();
    blocks.push({ kind: 'paragraph', text: line });
  }
  flushList();

  return blocks;
}

/**
 * Links in free text, written as markdown: [Se rapporten](https://example.no).
 *
 * Only links. No bold, no images, no raw HTML. The reason is that
 * the description comes from an open submission form, and a partial markdown
 * that grows later is how you end up rendering user-submitted HTML.
 * The segments below become React elements in the caller, never innerHTML, so
 * XSS is ruled out by construction and not by vigilance.
 */
const LENKE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string };

/**
 * Only http and https. An href that does not pass is rendered as the text it is,
 * so "[klikk](javascript:alert(1))" becomes visible text and not a link.
 * new URL() is stricter and more predictable than a regex on the protocol.
 */
function erTryggLenke(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Splits a line into text and links. Without links it gives one text segment. */
export function toInline(text: string): Inline[] {
  const ut: Inline[] = [];
  let sist = 0;

  for (const treff of text.matchAll(LENKE)) {
    const [hele, etikett, href] = treff;
    const start = treff.index;
    if (!erTryggLenke(href)) continue;

    if (start > sist) ut.push({ kind: 'text', text: text.slice(sist, start) });
    ut.push({ kind: 'link', text: etikett, href });
    sist = start + hele.length;
  }

  if (sist < text.length) ut.push({ kind: 'text', text: text.slice(sist) });
  return ut;
}
