import { describe, expect, test } from 'vitest';
import { collectInternalLinkIds, replaceInternalLinks, collectRteFields } from './umbraco';

describe('collectInternalLinkIds', () => {
  test('plukker ut id-er fra anker-placeholdere', () => {
    const html = '<a href="#" data-internal-link-id="abc">x</a> og <a href="#" data-internal-link-id="def">y</a>';
    expect(collectInternalLinkIds(html)).toEqual(new Set(['abc', 'def']));
  });

  test('dedupliserer gjentatte id-er', () => {
    const html = '<a data-internal-link-id="abc">a</a> <a data-internal-link-id="abc">b</a>';
    expect(collectInternalLinkIds(html)).toEqual(new Set(['abc']));
  });

  test('tom html gir tom Set', () => {
    expect(collectInternalLinkIds('')).toEqual(new Set());
    expect(collectInternalLinkIds('<p>ingen lenker</p>')).toEqual(new Set());
  });
});

describe('replaceInternalLinks', () => {
  test('erstatter href="#" med oppløst URL og stripper data-internal-link-* attrs', () => {
    const html = '<a href="#" data-internal-link-id="abc" data-internal-link-type="document">tekst</a>';
    const out = replaceInternalLinks(html, new Map([['abc', '/artikler/min-artikkel']]));
    expect(out).toBe('<a href="/artikler/min-artikkel">tekst</a>');
  });

  test('legger til queryString fra data-internal-link-query', () => {
    const html = '<a href="#" data-internal-link-id="abc" data-internal-link-query="?ref=x">tekst</a>';
    const out = replaceInternalLinks(html, new Map([['abc', '/artikler/x']]));
    expect(out).toBe('<a href="/artikler/x?ref=x">tekst</a>');
  });

  test('uoppløst id blir til href="#" (men data-attrs strippes likevel)', () => {
    const html = '<a href="#" data-internal-link-id="ukjent">x</a>';
    const out = replaceInternalLinks(html, new Map());
    expect(out).toBe('<a href="#">x</a>');
  });

  test('rører ikke ankertagger uten data-internal-link-id', () => {
    const html = '<a href="/eksisterende">x</a>';
    expect(replaceInternalLinks(html, new Map())).toBe(html);
  });

  test('escaper URL i href-output (XSS-vern på underlig data fra Umbraco)', () => {
    const html = '<a href="#" data-internal-link-id="abc">x</a>';
    const out = replaceInternalLinks(html, new Map([['abc', '/foo?"><script>']]));
    expect(out).not.toContain('<script>');
    expect(out).toContain('&quot;');
  });

  test('håndterer flere ankertagger i samme html', () => {
    const html = '<a href="#" data-internal-link-id="a">en</a> og <a href="#" data-internal-link-id="b">to</a>';
    const out = replaceInternalLinks(html, new Map([['a', '/x'], ['b', '/y']]));
    expect(out).toBe('<a href="/x">en</a> og <a href="/y">to</a>');
  });
});

describe('collectRteFields', () => {
  const MARKER_HTML = '<p><a href="#" data-internal-link-id="abc">x</a></p>';
  const NO_MARKER = '<p>vanlig tekst</p>';

  test('finner strenger med markøren i flate objekter', () => {
    const obj = { innhold: MARKER_HTML, tittel: 'uten markør' };
    const fields = collectRteFields(obj);
    expect(fields).toHaveLength(1);
    expect(fields[0].get()).toBe(MARKER_HTML);
  });

  test('felter er settbare (in-place mutation)', () => {
    const obj: any = { innhold: MARKER_HTML };
    const fields = collectRteFields(obj);
    fields[0].set('<p>erstattet</p>');
    expect(obj.innhold).toBe('<p>erstattet</p>');
  });

  test('hopper over strenger uten markøren', () => {
    const obj = { tittel: NO_MARKER, beskrivelse: 'kort tekst' };
    expect(collectRteFields(obj)).toHaveLength(0);
  });

  test('går rekursivt ned i nestede objekter', () => {
    const tree = {
      content: {
        innhold: MARKER_HTML,
        meta: { underTekst: MARKER_HTML },
      },
    };
    const fields = collectRteFields(tree);
    expect(fields).toHaveLength(2);
  });

  test('går rekursivt ned i array-elementer (f.eks. trekkspill)', () => {
    const blocks = [
      { content: { trekkspill: [{ innhold: MARKER_HTML }, { innhold: NO_MARKER }] } },
      { content: { steg: [{ beskrivelse: MARKER_HTML }] } },
    ];
    const fields = collectRteFields(blocks);
    expect(fields).toHaveLength(2);
    fields[0].set('A');
    fields[1].set('B');
    expect((blocks[0].content.trekkspill as any)[0].innhold).toBe('A');
    expect((blocks[1].content.steg as any)[0].beskrivelse).toBe('B');
  });

  test('strenger inni array (uten objekt-wrapper) støttes også', () => {
    const arr = [MARKER_HTML, NO_MARKER, MARKER_HTML];
    const fields = collectRteFields(arr);
    expect(fields).toHaveLength(2);
    fields[0].set('X');
    expect(arr[0]).toBe('X');
  });

  test('tomt input gir ingen felter', () => {
    expect(collectRteFields(null)).toEqual([]);
    expect(collectRteFields(undefined)).toEqual([]);
    expect(collectRteFields({})).toEqual([]);
    expect(collectRteFields([])).toEqual([]);
  });

  test('feltagnostisk: finner markøren uavhengig av nøkkelnavn', () => {
    // Stikkprøve: en hypotetisk fremtidig blokk med et helt nytt RTE-feltnavn.
    const obj = { helt_ny_rte_feltnavn: MARKER_HTML, ogEnTil: { dypereNy: MARKER_HTML } };
    expect(collectRteFields(obj)).toHaveLength(2);
  });
});
