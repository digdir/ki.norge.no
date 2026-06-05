import { describe, expect, test } from 'vitest';
import { applyDsClasses } from './richtext-classes';

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
