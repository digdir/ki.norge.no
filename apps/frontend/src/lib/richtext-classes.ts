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

export function applyDsClasses(html: string): string {
  if (!html) return '';
  const { document } = parseHTML(`<div>${html}</div>`);
  const root = document.querySelector('div')!;
  for (const [sel, cls] of Object.entries(RULES)) {
    root.querySelectorAll(sel).forEach(el => el.classList.add(cls));
  }
  return root.innerHTML;
}
