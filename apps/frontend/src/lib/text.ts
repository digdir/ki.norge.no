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
 * Som splitLastWord, men bare siste tegn limes til ikonet. Et span midt i et ord
 * lager ikke noe bruddpunkt, så ordet brekker ikke der. Et ord som er lengre enn
 * hele linja kan fortsatt brytes, så dette trenger ikke unntaket .u-nowrap har
 * under 768px, der pilen kan falle alene ned på en ny linje.
 */
export function splitLastChar(text: string): { head: string; last: string } {
  const chars = Array.from((text ?? '').trim());
  const last = chars.pop() ?? '';
  return { head: chars.join(''), last };
}
