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
