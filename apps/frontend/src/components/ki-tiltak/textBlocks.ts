/**
 * Deler redaksjonell fritekst fra ki-tiltak.json i avsnitt og punktlister.
 *
 * Datasettet er en JSON-fil som redaksjonen vedlikeholder for hånd, og JSON
 * har ingen plass til markup. Linjeskift skrives derfor som \n, og linjer som
 * starter med en kulepunkt-markør blir en ekte liste ved rendring. Da slipper
 * vi både et eget skjema for punktlister og en markdown-avhengighet, og
 * skjermlesere får <ul> i stedet for et punkt-tegn midt i en setning.
 *
 * Fri for React, så oppdelingen kan testes uten DOM.
 */

/** Tegnene redaksjonen realistisk bruker som kulepunkt, inkludert lister limt fra Word. */
const BULLET = /^\s*[•·▪*-]\s+/;

/**
 * Nummererte punkt, «1.» eller «1)».
 *
 * Maks to siffer med vilje: uten den grensen ville en linje som begynner med
 * et årstall, «2026. Vi startet …», blitt tolket som et listepunkt.
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
      // Bytter markørtypen midt i en liste, begynner en ny liste.
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
 * Lenker i fritekst, skrevet som markdown: [Se rapporten](https://example.no).
 *
 * Bare lenker. Ikke fet skrift, ikke bilder, ikke rå HTML. Grunnen er at
 * beskrivelsen kommer fra et åpent innsendingsskjema, og en delvis markdown
 * som senere vokser er hvordan man ender med å rendre brukerinnsendt HTML.
 * Segmentene under blir React-elementer hos kalleren, aldri innerHTML, så
 * XSS er utelukket av konstruksjon og ikke av årvåkenhet.
 */
const LENKE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string };

/**
 * Bare http og https. En href som ikke består, rendres som den teksten den er,
 * så «[klikk](javascript:alert(1))» blir synlig tekst og ikke en lenke.
 * new URL() er strengere og mer forutsigbar enn et regex på protokollen.
 */
function erTryggLenke(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Deler en linje i tekst og lenker. Uten lenker gir den ett tekstsegment. */
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
