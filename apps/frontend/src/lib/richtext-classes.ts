// Tags ds classes onto bare HTML from Umbraco RichText. Add/remove lines.
import { parseHTML } from 'linkedom';

const RULES: Record<string, string> = {
  'ul, ol':                  'ds-list',
  'a':                    'ds-link',
  'p':                   'ds-paragraph',
  // 'table':                'ds-table',
  'h1, h2, h3, h4, h5, h6': 'ds-heading',
  // 'hr':                   'ds-divider',
};

// We remove font-related inline styles from RTE HTML regardless of value. The check
// matches the CSS property (font-family/font-size), not a specific font name, so
// no font is hardcoded here: the app's CSS is the only source for which fonts
// apply (--ds-font-family for body text, --ki-heading-font for headings, see
// global.css). Then foreign fonts from pasting (Word etc.) cannot override
// them. Headings come in as real h2–h4 and get the heading font via CSS.
// Other inline styles the editor uses deliberately (text-align, text-indent) are kept.
const STRIP_STYLE_PROPS = /^(font-family|font-size)\s*:/i;

function stripForeignFonts(el: Element): void {
  const style = el.getAttribute('style');
  if (!style) return;
  const kept = style
    .split(';')
    .map(d => d.trim())
    .filter(d => d && !STRIP_STYLE_PROPS.test(d));
  if (kept.length) el.setAttribute('style', kept.join('; ') + ';');
  else el.removeAttribute('style');
}

// Non-breaking space (U+00A0) and literal nbsp entities sneak in when pasting
// from Word etc. They give a fixed space that does not break at line wraps, and an entity
// pasted as plain text (&nbsp;) shows up as a visible "&nbsp;" on the page. We turn all
// nbsp into regular spaces: a run of spaces that contains at least one nbsp
// is collapsed to ONE regular space. Then "word<nbsp>word" becomes "word word", and an
// nbsp next to a regular space disappears. We do not trim start/end here in
// the code, because a text node can have a deliberate space next to an inline element
// (<em>, <strong> ...) that must not be glued together, and "start/end of line" is
// a layout thing the browser trims itself when rendering anyway. Plain regular
// spaces (without nbsp) are not touched; HTML collapses them when rendering. Called on raw
// text nodes before escaping, so it catches both the character and entity-as-text.
const NBSP_ENTITY = /&nbsp;|&#0*160;|&#x0*A0;/gi;
const NBSP_RUN = /[ \t]*\u00A0[ \t\u00A0]*/g;

export function normalizeNbsp(text: string): string {
  if (!text) return text;
  return text.replace(NBSP_ENTITY, '\u00A0').replace(NBSP_RUN, ' ');
}

export function applyDsClasses(html: string): string {
  if (!html) return '';
  const { document } = parseHTML(`<div>${html}</div>`);
  const root = document.querySelector('div')!;
  for (const [sel, cls] of Object.entries(RULES)) {
    root.querySelectorAll(sel).forEach(el => el.classList.add(cls));
  }
  root.querySelectorAll('[style]').forEach(el => stripForeignFonts(el));
  return root.innerHTML;
}
