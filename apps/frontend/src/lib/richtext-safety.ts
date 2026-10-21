/**
 * What from rich text in the CMS is allowed to become HTML on the page.
 *
 * richTextToHtml wrote out tag and attribute names as they came, so a <script>,
 * an <iframe> or an onerror= in the content ran on ki.norge.no. The CSP has
 * 'unsafe-inline' in script-src and does not stop it.
 *
 * The tags are on a list of what TipTap actually produces, plus regular
 * formatting. Unknown tags are unwrapped, so the text stays. Tags that
 * can run code or load content from others disappear along with their content.
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

/** Attributes that are never safe, regardless of value. */
const BLOCKED_ATTRIBUTES = new Set(['srcdoc', 'formaction', 'action', 'xmlns']);

/** Attributes that are an address the browser follows or fetches. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'cite', 'poster', 'background']);

const ATTRIBUTE_NAME = /^[a-z][a-z0-9-]*$/i;

/** Relative addresses and these schemes. Not javascript:, data: or vbscript:. */
const SAFE_SCHEME = /^(https?|mailto|tel):/i;

/**
 * Whether the attribute may stay. The value is escaped by whoever renders, so here it
 * is only about what the name and the address can make the browser do.
 */
export function attributeIsSafe(name: string, value: string): boolean {
  if (!ATTRIBUTE_NAME.test(name)) return false;
  const key = name.toLowerCase();
  if (key.startsWith('on') || BLOCKED_ATTRIBUTES.has(key)) return false;
  if (URL_ATTRIBUTES.has(key)) return urlIsSafe(value);
  return true;
}

export function urlIsSafe(value: string): boolean {
  // The browser ignores whitespace and control characters in the scheme, so "java\tscript:" is javascript:.
  // oxlint-disable-next-line no-control-regex -- matching control characters is the point
  const compact = value.replace(/[\u0000- \u007F]/g, '');
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(compact);
  return scheme === null || SAFE_SCHEME.test(scheme[0]);
}
