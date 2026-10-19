import { describe, expect, test } from 'vitest';
import { applyDsClasses, normalizeNbsp } from './richtext-classes';

// U+00A0 built without writing an invisible character in the source code.
const NBSP = String.fromCharCode(0xA0);

describe('normalizeNbsp', () => {
  test('replaces a real non-breaking space (U+00A0) with a regular space', () => {
    expect(normalizeNbsp('Holte' + NBSP + 'er')).toBe('Holte er');
  });

  test('replaces a literal nbsp entity pasted as text', () => {
    expect(normalizeNbsp('tekst&nbsp;her')).toBe('tekst her');
    expect(normalizeNbsp('a&#160;b')).toBe('a b');
    expect(normalizeNbsp('a&#xa0;b')).toBe('a b');
    expect(normalizeNbsp('a&#XA0;b')).toBe('a b');
  });

  test('collapses nbsp next to spaces and multiple nbsp to one space', () => {
    expect(normalizeNbsp('a' + NBSP + NBSP + 'b')).toBe('a b');
    expect(normalizeNbsp('a' + NBSP + ' b')).toBe('a b');
    expect(normalizeNbsp('a ' + NBSP + ' b')).toBe('a b');
    expect(normalizeNbsp('a&nbsp; b')).toBe('a b');
  });

  test('keeps leading/trailing spaces (the browser trims when rendering)', () => {
    expect(normalizeNbsp('slutt' + NBSP)).toBe('slutt ');
    expect(normalizeNbsp(NBSP + 'start')).toBe(' start');
  });

  test('does not touch plain regular spaces and empty input', () => {
    expect(normalizeNbsp('a b c')).toBe('a b c');
    expect(normalizeNbsp('a  b')).toBe('a  b');
    expect(normalizeNbsp('')).toBe('');
  });
});

describe('applyDsClasses', () => {
  test('adds ds-list to ul and ol', () => {
    const out = applyDsClasses('<ul><li>a</li></ul><ol><li>b</li></ol>');
    expect(out).toContain('<ul class="ds-list">');
    expect(out).toContain('<ol class="ds-list">');
  });

  test('keeps the existing class and does not duplicate', () => {
    const out = applyDsClasses('<ul class="foo"><li>a</li></ul>');
    expect(out).toBe('<ul class="foo ds-list"><li>a</li></ul>');
    const twice = applyDsClasses(out);
    expect(twice).toBe(out);
  });

  test('keeps the heading id (TOC anchor) and adds ds-heading', () => {
    const out = applyDsClasses('<h2 id="seksjon">Tittel</h2>');
    expect(out).toContain('id="seksjon"');
    expect(out).toContain('ds-heading');
  });

  test('empty input', () => {
    expect(applyDsClasses('')).toBe('');
    expect(applyDsClasses(undefined as unknown as string)).toBe('');
  });

  test('removes foreign font-family and font-size (e.g. pasting from Word)', () => {
    const out = applyDsClasses('<p style="font-family: Calibri; font-size: 11pt">Hei</p>');
    expect(out).not.toContain('font-family');
    expect(out).not.toContain('font-size');
  });

  test('keeps other inline styles (text-align, text-indent)', () => {
    const out = applyDsClasses('<p style="text-align: center; font-family: Arial">Hei</p>');
    expect(out).toContain('text-align: center');
    expect(out).not.toContain('font-family');
  });
});
