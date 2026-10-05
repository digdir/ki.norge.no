/**
 * Deler en tekst i «alt før siste ord» og «siste ord», slik at pil-ikoner
 * kan limes til siste ord med en white-space: nowrap-wrapper (.u-nowrap).
 * Uten dette brekker pilen alene ned på egen linje ved smale bredder (#464).
 *
 * `head` beholder mellomrommet på slutten, så rendering blir
 * `{head}<span class="u-nowrap">{last}<ikon /></span>`.
 */
export function splitLastWord(text: string): { head: string; last: string } {
  const trimmed = (text ?? '').trim();
  const i = trimmed.lastIndexOf(' ');
  if (i === -1) return { head: '', last: trimmed };
  return { head: trimmed.slice(0, i + 1), last: trimmed.slice(i + 1) };
}

/**
 * Lengden på det lengste ordet i en tittel, som CSS-variabelen --lengste-ord.
 * På mobil krymper titler med lange ord akkurat nok til at ordet får plass på
 * én linje, i stedet for å brytes midt i. Bindestrek og tankestrek er
 * bruddpunkter, så de deler ord. Hard bindestrek (U+2011) gjør det ikke.
 */
export function ordlengde(text: string | undefined): string {
  const lengste = Math.max(0, ...(text ?? '').split(/[\s\-\u2010\u2013\u2014\/]+/).map((ord) => Array.from(ord).length));
  return `--lengste-ord: ${lengste}`;
}

