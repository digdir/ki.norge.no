import { describe, expect, test } from 'vitest';
import { attributeIsSafe, tagVerdict, urlIsSafe } from './richtext-safety';
import { richTextToHtml } from './umbraco';

type Node = { tag: string; text?: string; attributes?: Record<string, string>; elements?: Node[] };
const root = (...elements: Node[]): Node => ({ tag: '#root', elements });
const text = (t: string): Node => ({ tag: '#text', text: t });
const el = (tag: string, attributes: Record<string, string> = {}, ...elements: Node[]): Node => ({ tag, attributes, elements });

describe('richTextToHtml med fiendtlig innhold', () => {
  // Fixturen «fiendtlig innhold» på tt02 rendret denne og kjørte den.
  test('script og iframe forsvinner med innholdet', () => {
    const html = richTextToHtml(root(
      el('p', {}, text('før')),
      el('script', {}, text("alert('x')")),
      el('iframe', { src: 'https://example.com' }),
      el('p', {}, text('etter')),
    ));
    expect(html).not.toMatch(/script|iframe|alert|example\.com/);
    expect(html).toMatch(/før<\/p><p[^>]*>etter/);
  });

  test('hendelsesattributter fjernes, resten står', () => {
    const html = richTextToHtml(root(el('img', { src: '/bilde.png', alt: 'Bilde', onerror: 'alert(1)', ONLOAD: 'x' })));
    expect(html).not.toMatch(/onerror|onload|alert/i);
    expect(html).toContain('src="/bilde.png"');
    expect(html).toContain('alt="Bilde"');
  });

  test('javascript- og data-lenker mister adressen', () => {
    const html = richTextToHtml(root(
      el('a', { href: 'javascript:alert(1)' }, text('a')),
      el('a', { href: ' java\tscript:alert(1)' }, text('b')),
      el('a', { href: 'data:text/html,<script>' }, text('c')),
    ));
    expect(html).not.toMatch(/href/);
    expect(html).toContain('>a</a>');
  });

  test('ukjente tagger pakkes ut, teksten blir stående', () => {
    const html = richTextToHtml(root(el('p', {}, el('blink', {}, text('hei')))));
    expect(html).not.toContain('blink');
    expect(html).toMatch(/<p[^>]*>hei<\/p>/);
  });

  test('vanlig innhold er uendret', () => {
    const html = richTextToHtml(root(
      el('p', { style: 'text-align: center', class: 'x' }, text('Midt')),
      el('a', { href: 'https://ki.norge.no', target: '_blank', title: 'KI' }, text('lenke')),
      el('a', { href: 'mailto:post@kin.norge.no' }, text('e-post')),
      el('ol', { start: '3' }, el('li', {}, text('tre'))),
    ));
    expect(html).toMatch(/<p style="text-align: center;?" class="x[^"]*">Midt<\/p>/);
    expect(html).toContain('href="https://ki.norge.no" target="_blank" title="KI"');
    expect(html).toContain('href="mailto:post@kin.norge.no"');
    expect(html).toContain('start="3"');
  });
});

describe('tagVerdict', () => {
  test('kjente, farlige og ukjente tagger', () => {
    expect(tagVerdict('p')).toBe('keep');
    expect(tagVerdict('H2')).toBe('keep');
    expect(tagVerdict('SCRIPT')).toBe('drop');
    expect(tagVerdict('svg')).toBe('drop');
    expect(tagVerdict('custom-element')).toBe('unwrap');
  });
});

describe('attributeIsSafe og urlIsSafe', () => {
  test('navn som ikke er rene attributtnavn avvises', () => {
    expect(attributeIsSafe('x" onmouseover="alert(1)', 'y')).toBe(false);
    expect(attributeIsSafe('srcdoc', '<p>')).toBe(false);
    expect(attributeIsSafe('data-internal-link-id', 'abc')).toBe(true);
  });

  test('relative adresser og trygge skjemaer slipper gjennom', () => {
    expect(urlIsSafe('/artikler/x')).toBe(true);
    expect(urlIsSafe('#seksjon')).toBe(true);
    expect(urlIsSafe('?q=1')).toBe(true);
    expect(urlIsSafe('tel:+4712345678')).toBe(true);
    expect(urlIsSafe('vbscript:x')).toBe(false);
    expect(urlIsSafe('JAVASCRIPT:x')).toBe(false);
  });
});
