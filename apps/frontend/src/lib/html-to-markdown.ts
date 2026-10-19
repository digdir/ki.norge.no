/**
 * Converts a rendered page to markdown for agents that ask for it with
 * Accept: text/markdown.
 *
 * Uses linkedom, which is already a dependency (see richtext-classes.ts) and
 * works both in Node and on Workers. Cloudflare has its own switch for the same thing
 * (content_converter at zone level), but it converts origin HTML, and here it is
 * the Worker that produces the response.
 *
 * Only the content of <main> is converted. Header, footer, search dialog and
 * the back-to-top button are navigation, not content, and would only be
 * noise at the top of every single document.
 */
import { parseHTML } from 'linkedom';

// Elements that must never contribute text.
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME',
  'FORM', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DIALOG',
]);

const HEADING_LEVELS: Record<string, number> = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };

type Ctx = {
  /** Absolute base for making relative links and images complete. */
  baseUrl: string;
};

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function absolutize(href: string, baseUrl: string): string {
  if (!href) return '';
  // Anchors and special schemes are left untouched.
  if (/^(#|mailto:|tel:|data:)/i.test(href)) return href;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

// Characters that would be read as markdown syntax in the middle of body text.
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
 * Puts the markers around the text itself and leaves surrounding whitespace outside.
 * Editors often write <strong>Tittel<br><br></strong>, and a simple trim
 * would eat the line breaks so the next paragraph stuck to the emphasis.
 */
function wrapEmphasis(rendered: string, marker: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(rendered);
  if (!match) return rendered;
  const [, lead, core, trail] = match;
  return core ? `${lead}${marker}${core}${marker}${trail}` : lead + trail;
}

/** Inline content: text, links, emphasis, code, images, line breaks. */
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
      // Code inside <pre> is handled by the block renderer.
      const text = collapse(el.textContent ?? '').trim();
      return text ? `\`${text}\`` : '';
    }
    case 'IMG': {
      const src = absolutize(el.getAttribute('src') ?? '', ctx.baseUrl);
      const alt = collapse(el.getAttribute('alt') ?? '').trim();
      // Empty alt means a decorative image. Then there is nothing to read, and a
      // bare ![](...) is just noise in the text.
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

    // Nested lists are rendered separately and pulled out of the item's own text.
    const nested = [...child.children].filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
    for (const list of nested) list.remove();

    const marker = ordered ? `${index}. ` : '- ';
    // Block-aware: an item can contain a link followed by a paragraph
    // with a description. If we flattened it to inline, the two stuck together.
    const text = renderChildren(child, ctx).trim();
    if (text) {
      const [first, ...rest] = text.split('\n');
      lines.push(`${indent}${marker}${first}`);
      for (const line of rest) lines.push(line ? `${indent}  ${line}` : '');
    }
    for (const list of nested) lines.push(renderList(list, ctx, depth + 1));
    index += 1;
  }

  // Empty lines are kept: they separate several paragraphs inside one list item. Only
  // blank lines at the ends are removed, not the indentation of a nested list.
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
      // Pipe characters would split the column in two.
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

/** Block level: headings, paragraphs, lists, quotes, code, tables. */
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
      // An inline element standing alone in a container becomes its own paragraph.
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
    // Plain inline elements are gathered into one paragraph with the text around them.
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

// The path functions live in markdown-paths.ts, which imports nothing. If they lived here,
// a client import of them would drag all of linkedom into the browser bundle.
// The re-export is there so server code that already imports them from here works as
// before; client code MUST import from markdown-paths directly.
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
 * True only when the client explicitly asks for markdown and does not prefer HTML.
 *
 * Browsers send `text/html,...,*​/*;q=0.8`. The wildcard therefore does not count as
 * a wish for markdown, otherwise every single browser would get markdown.
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
 * Extracts <main> from a rendered HTML document and returns it as markdown
 * with a small YAML header (title, canonical URL, description).
 *
 * Returns null when the document has no main content. The caller should then
 * keep the HTML response instead of sending an empty page.
 */
export function htmlToMarkdown(html: string, baseUrl: string): MarkdownPage | null {
  const { document } = parseHTML(html);

  const main = document.querySelector('main#main-content') ?? document.querySelector('main');
  if (!main) return null;

  const ctx: Ctx = { baseUrl };
  const body = renderChildren(main, ctx)
    // Three or more line breaks never carry meaning in markdown.
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
