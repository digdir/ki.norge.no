import { describe, expect, test } from 'vitest';
import { applyDsClasses, normalizeNbsp } from './richtext-classes';

// U+00A0 bygd uten å skrive et usynlig tegn i kildekoden.
const NBSP = String.fromCharCode(0xA0);

describe('normalizeNbsp', () => {
  test('erstatter ekte non-breaking space (U+00A0) med vanlig mellomrom', () => {
    expect(normalizeNbsp('Holte' + NBSP + 'er')).toBe('Holte er');
  });

  test('erstatter literal nbsp-entitet limt inn som tekst', () => {
    expect(normalizeNbsp('tekst&nbsp;her')).toBe('tekst her');
    expect(normalizeNbsp('a&#160;b')).toBe('a b');
    expect(normalizeNbsp('a&#xa0;b')).toBe('a b');
    expect(normalizeNbsp('a&#XA0;b')).toBe('a b');
  });

  test('kollapser nbsp inntil mellomrom og flere nbsp til ett mellomrom', () => {
    expect(normalizeNbsp('a' + NBSP + NBSP + 'b')).toBe('a b');
    expect(normalizeNbsp('a' + NBSP + ' b')).toBe('a b');
    expect(normalizeNbsp('a ' + NBSP + ' b')).toBe('a b');
    expect(normalizeNbsp('a&nbsp; b')).toBe('a b');
  });

  test('beholder ledende/etterhengende mellomrom (nettleseren trimmer ved render)', () => {
    expect(normalizeNbsp('slutt' + NBSP)).toBe('slutt ');
    expect(normalizeNbsp(NBSP + 'start')).toBe(' start');
  });

  test('rører ikke rene vanlige mellomrom og tom input', () => {
    expect(normalizeNbsp('a b c')).toBe('a b c');
    expect(normalizeNbsp('a  b')).toBe('a  b');
    expect(normalizeNbsp('')).toBe('');
  });
});

describe('applyDsClasses', () => {
  test('legger ds-list på ul og ol', () => {
    const out = applyDsClasses('<ul><li>a</li></ul><ol><li>b</li></ol>');
    expect(out).toContain('<ul class="ds-list">');
    expect(out).toContain('<ol class="ds-list">');
  });

  test('bevarer eksisterende klasse og dupliserer ikke', () => {
    const out = applyDsClasses('<ul class="foo"><li>a</li></ul>');
    expect(out).toBe('<ul class="foo ds-list"><li>a</li></ul>');
    const twice = applyDsClasses(out);
    expect(twice).toBe(out);
  });

  test('bevarer heading-id (TOC-anker) og legger på ds-heading', () => {
    const out = applyDsClasses('<h2 id="seksjon">Tittel</h2>');
    expect(out).toContain('id="seksjon"');
    expect(out).toContain('ds-heading');
  });

  test('tom input', () => {
    expect(applyDsClasses('')).toBe('');
    expect(applyDsClasses(undefined as unknown as string)).toBe('');
  });

  test('fjerner fremmed font-family og font-size (f.eks. innliming fra Word)', () => {
    const out = applyDsClasses('<p style="font-family: Calibri; font-size: 11pt">Hei</p>');
    expect(out).not.toContain('font-family');
    expect(out).not.toContain('font-size');
  });

  test('beholder andre inline-stiler (text-align, text-indent)', () => {
    const out = applyDsClasses('<p style="text-align: center; font-family: Arial">Hei</p>');
    expect(out).toContain('text-align: center');
    expect(out).not.toContain('font-family');
  });
});
