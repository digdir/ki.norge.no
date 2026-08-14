import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { createTools, registerWebMcpTools, type WebMcpTool } from './webmcp';

function toolNamed(name: string): WebMcpTool {
  const tool = createTools().find((t) => t.name === name);
  if (!tool) throw new Error(`fant ikke verktøyet ${name}`);
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

describe('verktøydefinisjonene', () => {
  test('navnene følger WebMCP-reglene for tegn og lengde', () => {
    for (const tool of createTools()) {
      expect(tool.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  test('navnene er unike', () => {
    const names = createTools().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('lesende verktøy er merket readOnlyHint, det som endrer UI er ikke', () => {
    expect(toolNamed('search_ki_norge').annotations?.readOnlyHint).toBe(true);
    expect(toolNamed('get_page_content').annotations?.readOnlyHint).toBe(true);
    expect(toolNamed('open_search_dialog').annotations?.readOnlyHint).toBeUndefined();
  });
});

describe('search_ki_norge', () => {
  test('poster spørringen til /api/search og formaterer treffene', async () => {
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

  test('tom spørring gir feil uten å kalle API-et', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await toolNamed('search_ki_norge').execute({ query: '   ' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  test('null treff sies tydelig i stedet for å returnere tomt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }));
    const result = await toolNamed('search_ki_norge').execute({ query: 'xyzzy' });
    expect(result.content[0].text).toContain('No results');
  });

  test('feilstatus og nettverksfeil rapporteres som isError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    expect((await toolNamed('search_ki_norge').execute({ query: 'a' })).isError).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await toolNamed('search_ki_norge').execute({ query: 'a' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('offline');
  });
});

describe('get_page_content', () => {
  test('henter gjeldende URL med Accept: text/markdown', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '# Veiledning' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await toolNamed('get_page_content').execute({});

    expect(fetchMock).toHaveBeenCalledWith('https://ki.norge.no/veiledning', {
      headers: { Accept: 'text/markdown' },
    });
    expect(result.content[0].text).toBe('# Veiledning');
  });
});

describe('open_search_dialog', () => {
  test('sender open-search-dialog med spørringen i detail', async () => {
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

  test('uten spørring sendes tom streng', async () => {
    const events: CustomEvent[] = [];
    vi.stubGlobal('window', { dispatchEvent: (e: CustomEvent) => events.push(e) });

    await toolNamed('open_search_dialog').execute({});

    expect(events[0].detail).toEqual({ query: '' });
  });
});

describe('registerWebMcpTools', () => {
  test('bruker navigator.modelContext.provideContext når den finnes', async () => {
    const provideContext = vi.fn();
    const registered = await registerWebMcpTools({ navigator: { modelContext: { provideContext } } });

    expect(registered).toBe(true);
    expect(provideContext).toHaveBeenCalledTimes(1);
    expect(provideContext.mock.calls[0][0].tools).toHaveLength(createTools().length);
  });

  test('faller tilbake på document.modelContext.registerTool', async () => {
    const registerTool = vi.fn();
    const registered = await registerWebMcpTools({ document: { modelContext: { registerTool } } });

    expect(registered).toBe(true);
    expect(registerTool).toHaveBeenCalledTimes(createTools().length);
  });

  test('provideContext vinner over registerTool på samme objekt', async () => {
    const provideContext = vi.fn();
    const registerTool = vi.fn();
    await registerWebMcpTools({ navigator: { modelContext: { provideContext, registerTool } } });

    expect(provideContext).toHaveBeenCalled();
    expect(registerTool).not.toHaveBeenCalled();
  });

  test('gjør ingenting og kaster ikke når API-et mangler', async () => {
    await expect(registerWebMcpTools({ navigator: {}, document: {} })).resolves.toBe(false);
    await expect(registerWebMcpTools({})).resolves.toBe(false);
  });
});
