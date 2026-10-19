import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createTools, registerWebMcpTools, type WebMcpTool } from './webmcp';

function toolNamed(name: string): WebMcpTool {
  const tool = createTools().find((t) => t.name === name);
  if (!tool) throw new Error(`could not find the tool ${name}`);
  return tool;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.stubGlobal('location', { href: 'https://ki.norge.no/veiledning', origin: 'https://ki.norge.no' });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the tool definitions', () => {
  test('the names follow the WebMCP rules for characters and length', () => {
    for (const tool of createTools()) {
      expect(tool.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  test('the names are unique', () => {
    const names = createTools().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('reading tools are marked readOnlyHint, the one that changes the UI is not', () => {
    expect(toolNamed('search_ki_norge').annotations?.readOnlyHint).toBe(true);
    expect(toolNamed('get_page_content').annotations?.readOnlyHint).toBe(true);
    expect(toolNamed('open_search_dialog').annotations?.readOnlyHint).toBeUndefined();
  });
});

describe('search_ki_norge', () => {
  test('posts the query to /api/search and formats the hits', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'Etikk og KI', url: '/veiledning/etikk-og-ki', type: 'veiledning', excerpt: 'Om etikk.' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await toolNamed('search_ki_norge').execute({ query: '  etikk  ' });

    expect(fetchMock).toHaveBeenCalledWith('/api/search', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ query: 'etikk' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('[Etikk og KI](https://ki.norge.no/veiledning/etikk-og-ki)');
    expect(result.content[0].text).toContain('Om etikk.');
  });

  test('an empty query gives an error without calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await toolNamed('search_ki_norge').execute({ query: '   ' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  test('zero hits are stated clearly instead of returning empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }));
    const result = await toolNamed('search_ki_norge').execute({ query: 'xyzzy' });
    expect(result.content[0].text).toContain('No results');
  });

  test('error status and network errors are reported as isError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    expect((await toolNamed('search_ki_norge').execute({ query: 'a' })).isError).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await toolNamed('search_ki_norge').execute({ query: 'a' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('offline');
  });
});

describe('get_page_content', () => {
  test('fetches the .md variant, not the current URL with an Accept header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '# Veiledning' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await toolNamed('get_page_content').execute({});

    // Accept alone can be served from the edge cache as HTML.
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://ki.norge.no/veiledning.md');
    expect(result.content[0].text).toBe('# Veiledning');
  });
});

describe('open_search_dialog', () => {
  test('sends open-search-dialog with the query in detail', async () => {
    const events: CustomEvent[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: (e: CustomEvent) => {
        events.push(e);
        return true;
      },
    });

    await toolNamed('open_search_dialog').execute({ query: 'personvern' });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('open-search-dialog');
    expect(events[0].detail).toEqual({ query: 'personvern' });
  });

  test('without a query an empty string is sent', async () => {
    const events: CustomEvent[] = [];
    vi.stubGlobal('window', { dispatchEvent: (e: CustomEvent) => events.push(e) });

    await toolNamed('open_search_dialog').execute({});

    expect(events[0].detail).toEqual({ query: '' });
  });
});

describe('registerWebMcpTools', () => {
  test('uses navigator.modelContext.provideContext when it exists', async () => {
    const provideContext = vi.fn();
    const registered = await registerWebMcpTools({ navigator: { modelContext: { provideContext } } });

    expect(registered).toBe(true);
    expect(provideContext).toHaveBeenCalledTimes(1);
    expect(provideContext.mock.calls[0][0].tools).toHaveLength(createTools().length);
  });

  test('falls back to document.modelContext.registerTool', async () => {
    const registerTool = vi.fn();
    const registered = await registerWebMcpTools({ document: { modelContext: { registerTool } } });

    expect(registered).toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(createTools().length);
  });

  test('provideContext wins over registerTool on the same object', async () => {
    const provideContext = vi.fn();
    const registerTool = vi.fn();
    await registerWebMcpTools({ navigator: { modelContext: { provideContext, registerTool } } });

    expect(provideContext).toHaveBeenCalled();
    expect(registerTool).not.toHaveBeenCalled();
  });

  test('does nothing and does not throw when the API is missing', async () => {
    await expect(registerWebMcpTools({ navigator: {}, document: {} })).resolves.toBe(false);
    await expect(registerWebMcpTools({})).resolves.toBe(false);
  });
});
