/**
 * Hva fra rik tekst i CMS-et som får bli HTML på siden.
 *
 * richTextToHtml skrev ut tagg- og attributtnavn slik de kom, så en <script>,
 * en <iframe> eller en onerror= i innholdet kjørte på ki.norge.no. CSP-en har
 * 'unsafe-inline' i script-src og stopper det ikke.
 *
 * Taggene står på en liste over det TipTap faktisk lager, pluss vanlig
 * formatering. Ukjente tagger pakkes ut, så teksten blir stående. Tagger som
 * kan kjøre kode eller laste innhold fra andre, forsvinner med innholdet.
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'mark',
  'sub', 'sup', 'small', 'code', 'pre', 'kbd', 'blockquote', 'q', 'cite', 'abbr',
  'span', 'div', 'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'img', 'figure', 'figcaption',
]);

const DROPPED_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'noscript', 'template', 'svg', 'math', 'form', 'input', 'button', 'textarea',
  'select', 'option', 'link', 'meta', 'base', 'title', 'audio', 'video', 'source',
]);

export type TagVerdict = 'keep' | 'unwrap' | 'drop';

export function tagVerdict(tag: string): TagVerdict {
  const name = tag.toLowerCase();
  if (ALLOWED_TAGS.has(name)) return 'keep';
  if (DROPPED_WITH_CONTENT.has(name)) return 'drop';
  return 'unwrap';
}

/** Attributter som aldri er trygge, uansett verdi. */
const BLOCKED_ATTRIBUTES = new Set(['srcdoc', 'formaction', 'action', 'xmlns']);

/** Attributter som er en adresse nettleseren følger eller henter. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'cite', 'poster', 'background']);

const ATTRIBUTE_NAME = /^[a-z][a-z0-9-]*$/i;

/** Relative adresser og disse skjemaene. Ikke javascript:, data: eller vbscript:. */
const SAFE_SCHEME = /^(https?|mailto|tel):/i;

/**
 * Om attributtet får stå. Verdien escapes av den som rendrer, så her gjelder
 * det bare hva navnet og adressen kan få nettleseren til å gjøre.
 */
export function attributeIsSafe(name: string, value: string): boolean {
  if (!ATTRIBUTE_NAME.test(name)) return false;
  const key = name.toLowerCase();
  if (key.startsWith('on') || BLOCKED_ATTRIBUTES.has(key)) return false;
  if (URL_ATTRIBUTES.has(key)) return urlIsSafe(value);
  return true;
}

export function urlIsSafe(value: string): boolean {
  // Nettleseren ser bort fra mellomrom og kontrolltegn i skjemaet, så «java\tscript:» er javascript:.
  const compact = value.replace(/[\u0000- \u007F]/g, '');
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(compact);
  return scheme === null || SAFE_SCHEME.test(scheme[0]);
}
