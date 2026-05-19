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

  test('bevarer heading-id (TOC-anker)', () => {
    const out = applyDsClasses('<h2 id="seksjon">Tittel</h2>');
    expect(out).toBe('<h2 id="seksjon">Tittel</h2>');
  });

  test('tom input', () => {
    expect(applyDsClasses('')).toBe('');
    expect(applyDsClasses(undefined as unknown as string)).toBe('');
  });
});
