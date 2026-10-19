/**
 * Splits a text into "everything before the last word" and "the last word", so arrow icons
 * can be glued to the last word with a white-space: nowrap wrapper (.u-nowrap).
 * Without this the arrow breaks alone onto its own line at narrow widths (#464).
 *
 * `head` keeps the trailing space, so rendering becomes
 * `{head}<span class="u-nowrap">{last}<ikon /></span>`.
 */
export function splitLastWord(text: string): { head: string; last: string } {
  const trimmed = (text ?? '').trim();
  const i = trimmed.lastIndexOf(' ');
  if (i === -1) return { head: '', last: trimmed };
  return { head: trimmed.slice(0, i + 1), last: trimmed.slice(i + 1) };
}

/**
 * The length of the longest word in a title, as the CSS variable --lengste-ord.
 * On mobile, titles with long words shrink just enough for the word to fit on
 * one line, instead of breaking in the middle. Hyphens and dashes are
 * break points, so they split words. A non-breaking hyphen (U+2011) does not.
 */
export function ordlengde(text: string | undefined): string {
  const lengste = Math.max(0, ...(text ?? '').split(/[\s\-\u2010\u2013\u2014\/]+/).map((ord) => Array.from(ord).length));
  return `--lengste-ord: ${lengste}`;
}

