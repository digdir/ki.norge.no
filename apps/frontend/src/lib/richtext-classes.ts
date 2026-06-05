// Tagger ds-klasser på bare HTML fra Umbraco RichText. Legg til/fjern linjer.
import { parseHTML } from 'linkedom';

const RULES: Record<string, string> = {
  'ul, ol':                  'ds-list',
  'a':                    'ds-link',
  'p':                   'ds-paragraph',
  // 'table':                'ds-table',
  'h1, h2, h3, h4, h5, h6': 'ds-heading',
  // 'hr':                   'ds-divider',
};

// Vi fjerner font-relaterte inline-stiler fra RTE-HTML uansett verdi. Sjekken
// matcher CSS-egenskapen (font-family/font-size), ikke et bestemt font-navn, så
// ingen font er hardkodet her: appens CSS er eneste kilde for hvilke fonter som
// gjelder (--ds-font-family for brødtekst, --ki-heading-font for overskrift, se
// global.css). Da kan ikke fremmede fonter fra innliming (Word o.l.) overstyre
// dem. Overskrifter kommer inn som ekte h2–h4 og får overskriftsfonten via CSS.
// Andre inline-stiler redaktøren bruker bevisst (text-align, text-indent) beholdes.
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
