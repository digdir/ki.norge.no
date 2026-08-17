/**
 * WebMCP: eksponerer nettstedets egne handlinger som verktøy for en agent som
 * står i nettleseren.
 *
 * API-et er ikke ferdig standardisert. Chrome sin tidlige implementasjon henger
 * på navigator.modelContext.provideContext(), mens W3C-utkastet bruker
 * document.modelContext.registerTool(). Vi støtter begge og gjør ingenting i en
 * nettleser som mangler dem, så dette er ren progressiv forbedring.
 *
 * Verktøynavn og beskrivelser er på engelsk med vilje: de leses av vilkårlige
 * agenter, ikke av oss.
 */

// Fra markdown-paths, IKKE html-to-markdown. Sistnevnte importerer linkedom, og
// denne modulen kjører i nettleseren, så importen sendte en hel DOM-implementasjon
// til hver besøkende for å bruke én strengfunksjon.
import { markdownPathFor } from './markdown-paths';

export interface WebMcpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

interface SearchHit {
  title?: string;
  url?: string;
  type?: string;
  excerpt?: string;
}

const SITE_DESCRIPTION =
  'ki.norge.no is the Norwegian government portal for artificial intelligence in the public sector, run by the Norwegian Digitalisation Agency. Content is in Norwegian.';

function text(value: string): ToolResult {
  return { content: [{ type: 'text', text: value }] };
}

function failure(value: string): ToolResult {
  return { content: [{ type: 'text', text: value }], isError: true };
}

function formatHits(hits: SearchHit[]): string {
  return hits
    .map((hit, i) => {
      const title = hit.title?.trim() || 'Uten tittel';
      const url = hit.url ? new URL(hit.url, location.origin).toString() : '';
      const head = url ? `${i + 1}. [${title}](${url})` : `${i + 1}. ${title}`;
      const meta = hit.type ? ` (${hit.type})` : '';
      const excerpt = hit.excerpt?.trim() ? `\n   ${hit.excerpt.trim()}` : '';
      return `${head}${meta}${excerpt}`;
    })
    .join('\n');
}

export function createTools(): WebMcpTool[] {
  return [
    {
      name: 'search_ki_norge',
      title: 'Search ki.norge.no',
      description:
        `Search ${SITE_DESCRIPTION} Covers guidance on adopting AI, documented public sector use cases, ` +
        'news articles and events. Returns ranked results with title, URL and excerpt. ' +
        'Use this to find source pages before answering questions about Norwegian AI policy or practice.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search terms. Norwegian gives the best results, since the content is Norwegian.',
          },
        },
        required: ['query'],
      },
      annotations: { readOnlyHint: true },
      async execute({ query }) {
        if (typeof query !== 'string' || !query.trim()) {
          return failure('The "query" parameter is required.');
        }
        try {
          const res = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query.trim() }),
          });
          if (!res.ok) return failure(`Search failed with status ${res.status}.`);

          const data = (await res.json()) as { results?: SearchHit[] };
          const hits = data.results ?? [];
          if (!hits.length) return text(`No results for "${query}".`);
          return text(formatHits(hits));
        } catch (error) {
          return failure(`Search failed: ${(error as Error).message}`);
        }
      },
    },
    {
      name: 'get_page_content',
      title: 'Read the current page',
      description:
        'Return the main content of the page the user is currently viewing, as markdown. ' +
        'Strips navigation, header and footer. Use this instead of reading the rendered DOM.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        // .md-varianten, ikke Accept-headeren: den siste kan bli servert fra
        // edge-cachen som HTML uten at Workeren kjører.
        const url = new URL(location.href);
        url.pathname = markdownPathFor(url.pathname);
        try {
          const res = await fetch(url, { headers: { Accept: 'text/markdown' } });
          if (!res.ok) return failure(`Could not read the page (status ${res.status}).`);
          return text(await res.text());
        } catch (error) {
          return failure(`Could not read the page: ${(error as Error).message}`);
        }
      },
    },
    {
      name: 'open_search_dialog',
      title: 'Open the search dialog',
      description:
        'Open the site search dialog for the user, optionally prefilled with a query. ' +
        'This changes what the user sees. To retrieve results without touching the UI, use search_ki_norge.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional query to prefill and run.' },
        },
      },
      async execute({ query }) {
        const initial = typeof query === 'string' ? query.trim() : '';
        window.dispatchEvent(new CustomEvent('open-search-dialog', { detail: { query: initial } }));
        return text(initial ? `Opened the search dialog for "${initial}".` : 'Opened the search dialog.');
      },
    },
  ];
}

// De to formene API-et finnes i. Ingen av dem er i TypeScript sine lib-typer.
type ProvideContextTarget = { provideContext: (ctx: { tools: WebMcpTool[] }) => unknown };
type RegisterToolTarget = { registerTool: (tool: WebMcpTool) => unknown };

function hasProvideContext(value: unknown): value is ProvideContextTarget {
  return typeof (value as ProvideContextTarget | null)?.provideContext === 'function';
}

function hasRegisterTool(value: unknown): value is RegisterToolTarget {
  return typeof (value as RegisterToolTarget | null)?.registerTool === 'function';
}

/**
 * Registrerer verktøyene mot den varianten av API-et nettleseren har.
 * Returnerer false når ingen av dem finnes, som er tilfellet i så godt som alle
 * nettlesere i dag.
 */
export async function registerWebMcpTools(
  scope: { navigator?: unknown; document?: unknown } = globalThis,
): Promise<boolean> {
  const tools = createTools();
  const candidates = [
    (scope.navigator as { modelContext?: unknown } | undefined)?.modelContext,
    (scope.document as { modelContext?: unknown } | undefined)?.modelContext,
  ];

  for (const target of candidates) {
    if (hasProvideContext(target)) {
      await target.provideContext({ tools });
      return true;
    }
    if (hasRegisterTool(target)) {
      for (const tool of tools) await target.registerTool(tool);
      return true;
    }
  }

  return false;
}
