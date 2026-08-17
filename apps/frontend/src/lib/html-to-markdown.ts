/**
 * Konverterer en rendret side til markdown for agenter som ber om det med
 * Accept: text/markdown.
 *
 * Bruker linkedom, som allerede er en avhengighet (se richtext-classes.ts) og
 * virker både i Node og på Workers. Cloudflare har en egen bryter for det samme
 * (content_converter på sone-nivå), men den konverterer origin-HTML, og her er
 * det Workeren som lager svaret.
 *
 * Kun innholdet i <main> konverteres. Header, footer, søkedialog og
 * tilbake-til-toppen-knappen er navigasjon, ikke innhold, og ville bare blitt
 * støy øverst i hvert eneste dokument.
 */
import { parseHTML } from 'linkedom';

// Elementer som aldri skal bidra med tekst.
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME',
  'FORM', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DIALOG',
]);

const HEADING_LEVELS: Record<string, number> = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };

type Ctx = {
  /** Absolutt base for å gjøre relative lenker og bilder komplette. */
  baseUrl: string;
};

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function absolutize(href: string, baseUrl: string): string {
  if (!href) return '';
  // Anker og spesialskjemaer skal stå urørt.
  if (/^(#|mailto:|tel:|data:)/i.test(href)) return href;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

// Tegn som ville blitt lest som markdown-syntaks midt i brødtekst.
function escapeInline(text: string): string {
  return text.replace(/([\\`*_[\]])/g, '\\$1');
}

function isSkipped(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.getAttribute('hidden') !== null) return true;
  return false;
}

/**
 * Legger markørene rundt selve teksten og lar omkringliggende luft stå utenfor.
 * Redaktørene skriver ofte <strong>Tittel<br><br></strong>, og en enkel trim
 * ville spist linjeskiftene så neste avsnitt klistret seg til uthevingen.
 */
function wrapEmphasis(rendered: string, marker: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(rendered);
  if (!match) return rendered;
  const [, lead, core, trail] = match;
  return core ? `${lead}${marker}${core}${marker}${trail}` : lead + trail;
}

/** Inline-innhold: tekst, lenker, utheving, kode, bilder, linjeskift. */
function renderInline(node: Node, ctx: Ctx): string {
  if (node.nodeType === 3) return escapeInline(collapse(node.textContent ?? ''));
  if (node.nodeType !== 1) return '';

  const el = node as Element;
  if (isSkipped(el)) return '';

  const children = () =>
    [...el.childNodes].map((child) => renderInline(child, ctx)).join('');

  switch (el.tagName) {
    case 'BR':
      return '  \n';
    case 'A': {
      const href = absolutize(el.getAttribute('href') ?? '', ctx.baseUrl);
      const text = children().trim();
      if (!text) return '';
      return href ? `[${text}](${href})` : text;
    }
    case 'STRONG':
    case 'B':
      return wrapEmphasis(children(), '**');
    case 'EM':
    case 'I':
      return wrapEmphasis(children(), '*');
    case 'CODE': {
      // Kode inni <pre> håndteres av blokk-renderen.
      const text = collapse(el.textContent ?? '').trim();
      return text ? `\`${text}\`` : '';
    }
    case 'IMG': {
      const src = absolutize(el.getAttribute('src') ?? '', ctx.baseUrl);
      const alt = collapse(el.getAttribute('alt') ?? '').trim();
      // Tom alt betyr dekorativt bilde. Da er det ingenting å lese, og en
      // naken ![](...) er bare støy i teksten.
      return src && alt ? `![${alt}](${src})` : '';
    }
    default:
      return children();
  }
}

function inlineOf(el: Element, ctx: Ctx): string {
  return renderInline(el, ctx).replace(/[ \t]+/g, ' ').replace(/ +\n/g, '\n').trim();
}

function renderList(el: Element, ctx: Ctx, depth: number): string {
  const ordered = el.tagName === 'OL';
  const indent = '  '.repeat(depth);
  const lines: string[] = [];
  let index = 1;

  for (const child of [...el.children]) {
    if (child.tagName !== 'LI') continue;

    // Nøstede lister rendres for seg og trekkes ut av punktets egen tekst.
    const nested = [...child.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
    for (const list of nested) list.remove();

    const marker = ordered ? `${index}. ` : '- ';
    // Blokk-aware: et punkt kan inneholde en lenke etterfulgt av et avsnitt
    // med beskrivelse. Flatet vi det til inline, klistret de to seg sammen.
    const text = renderChildren(child, ctx).trim();
    if (text) {
      const [first, ...rest] = text.split('\n');
      lines.push(`${indent}${marker}${first}`);
      for (const line of rest) lines.push(line ? `${indent}  ${line}` : '');
    }
    for (const list of nested) lines.push(renderList(list, ctx, depth + 1));
    index += 1;
  }

  // Tomme linjer beholdes: de skiller flere avsnitt inni ett listepunkt. Bare
  // blanke linjer i endene fjernes, ikke innrykket til en nøstet liste.
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\s+$/g, '');
}

function renderTable(el: Element, ctx: Ctx): string {
  const rows = [...el.querySelectorAll('tr')];
  if (!rows.length) return '';

  const cellsOf = (row: Element) =>
    [...row.children]
      .filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
      // Rørtegn ville delt kolonnen i to.
      .map((c) => inlineOf(c, ctx).replace(/\n/g, ' ').replaceAll('|', '\\|'));

  const table = rows.map(cellsOf).filter((r) => r.length);
  if (!table.length) return '';

  const width = Math.max(...table.map((r) => r.length));
  const pad = (row: string[]) => [...row, ...Array(width - row.length).fill('')];

  const [head, ...body] = table;
  return [
    `| ${pad(head).join(' | ')} |`,
    `| ${Array(width).fill('---').join(' | ')} |`,
    ...body.map((row) => `| ${pad(row).join(' | ')} |`),
  ].join('\n');
}

/** Blokknivå: overskrifter, avsnitt, lister, sitater, kode, tabeller. */
function renderBlock(el: Element, ctx: Ctx): string {
  if (isSkipped(el)) return '';

  const level = HEADING_LEVELS[el.tagName];
  if (level) {
    const text = inlineOf(el, ctx).replace(/\n/g, ' ');
    return text ? `${'#'.repeat(level)} ${text}` : '';
  }

  switch (el.tagName) {
    case 'P':
      return inlineOf(el, ctx);
    case 'UL':
    case 'OL':
      return renderList(el, ctx, 0);
    case 'BLOCKQUOTE': {
      const inner = renderChildren(el, ctx);
      return inner
        ? inner.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n')
        : '';
    }
    case 'PRE': {
      const code = el.textContent ?? '';
      return code.trim() ? `\`\`\`\n${code.replace(/\n+$/, '')}\n\`\`\`` : '';
    }
    case 'HR':
      return '---';
    case 'TABLE':
      return renderTable(el, ctx);
    case 'FIGURE': {
      const inner = renderChildren(el, ctx);
      return inner;
    }
    case 'FIGCAPTION': {
      const text = inlineOf(el, ctx);
      return text ? `*${text}*` : '';
    }
    case 'IMG':
    case 'A':
    case 'CODE':
    case 'STRONG':
    case 'EM':
    case 'SPAN':
      // Et inline-element som står alene i en beholder blir sitt eget avsnitt.
      return inlineOf(el, ctx);
    default:
      return renderChildren(el, ctx);
  }
}

function renderChildren(el: Element, ctx: Ctx): string {
  const blocks: string[] = [];
  let inlineRun = '';

  const flush = () => {
    const text = inlineRun.replace(/[ \t]+/g, ' ').trim();
    if (text) blocks.push(text);
    inlineRun = '';
  };

  for (const child of [...el.childNodes]) {
    if (child.nodeType === 3) {
      inlineRun += collapse(child.textContent ?? '');
      continue;
    }
    if (child.nodeType !== 1) continue;

    const childEl = child as Element;
    // Rene inline-elementer samles til ett avsnitt med teksten rundt dem.
    if (['A', 'STRONG', 'B', 'EM', 'I', 'CODE', 'SPAN', 'BR', 'IMG'].includes(childEl.tagName)) {
      inlineRun += renderInline(childEl, ctx);
      continue;
    }

    flush();
    const block = renderBlock(childEl, ctx);
    if (block) blocks.push(block);
  }

  flush();
  return blocks.join('\n\n');
}

function yamlString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export interface MarkdownPage {
  markdown: string;
  title: string;
}

// Stifunksjonene bor i markdown-paths.ts, som ikke importerer noe. Ligger de her,
// drar en klient-import av dem hele linkedom med seg inn i nettleser-bundlen.
// Re-eksporten står for at serverkode som allerede henter dem herfra virker som
// før; klientkode MÅ importere fra markdown-paths direkte.
export { markdownPathFor, pathFromMarkdownPath } from './markdown-paths';

type MediaRange = { type: string; q: number };

function parseAccept(header: string): MediaRange[] {
  return header
    .split(',')
    .map((part) => {
      const [type, ...params] = part.split(';').map((s) => s.trim());
      const qParam = params.find((p) => p.toLowerCase().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { type: type.toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((range) => range.type);
}

/**
 * Sant bare når klienten uttrykkelig ber om markdown og ikke foretrekker HTML.
 *
 * Nettlesere sender `text/html,...,*​/*;q=0.8`. Wildcard teller derfor ikke som
 * et ønske om markdown, ellers ville hver eneste nettleser fått markdown.
 */
export function prefersMarkdown(acceptHeader: string | null): boolean {
  if (!acceptHeader) return false;
  const ranges = parseAccept(acceptHeader);

  const qOf = (type: string) => ranges.find((r) => r.type === type)?.q ?? 0;
  const markdown = Math.max(qOf('text/markdown'), qOf('text/x-markdown'));
  if (markdown <= 0) return false;

  return markdown >= qOf('text/html');
}

/**
 * Trekker ut <main> fra et rendret HTML-dokument og returnerer det som markdown
 * med en liten YAML-header (tittel, kanonisk URL, beskrivelse).
 *
 * Returnerer null når dokumentet ikke har noe hovedinnhold. Da skal kalleren
 * beholde HTML-svaret i stedet for å sende en tom side.
 */
export function htmlToMarkdown(html: string, baseUrl: string): MarkdownPage | null {
  const { document } = parseHTML(html);

  const main = document.querySelector('main#main-content') ?? document.querySelector('main');
  if (!main) return null;

  const ctx: Ctx = { baseUrl };
  const body = renderChildren(main, ctx)
    // Tre eller flere linjeskift blir aldri meningsbærende i markdown.
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!body) return null;

  const rawTitle = document.querySelector('title')?.textContent?.trim() ?? '';
  const h1 = document.querySelector('main h1')?.textContent?.trim() ?? '';
  const title = h1 || rawTitle.replace(/\s*\|\s*KI Norge$/, '').trim() || 'KI Norge';

  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? baseUrl;
  const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';

  const frontMatter = [
    '---',
    `title: ${yamlString(title)}`,
    `url: ${yamlString(canonical)}`,
    ...(description ? [`description: ${yamlString(collapse(description).trim())}`] : []),
    '---',
  ].join('\n');

  return { markdown: `${frontMatter}\n\n${body}\n`, title };
}
