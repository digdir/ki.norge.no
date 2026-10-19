import { describe, expect, test } from 'vitest';
import { toTextBlocks, toInline } from './textBlocks';

describe('toTextBlocks', () => {
  test('plain text without line breaks becomes one paragraph', () => {
    expect(toTextBlocks('En helt vanlig beskrivelse.')).toEqual([
      { kind: 'paragraph', text: 'En helt vanlig beskrivelse.' },
    ]);
  });

  test('bullets become a list, with the marker removed', () => {
    expect(toTextBlocks('Eksempler:\n• Første\n• Andre')).toEqual([
      { kind: 'paragraph', text: 'Eksempler:' },
      { kind: 'list', ordered: false, items: ['Første', 'Andre'] },
    ]);
  });

  test.each(['•', '·', '▪', '-', '*'])('accepts %s as a bullet', (markor) => {
    expect(toTextBlocks(`${markor} Punkt`)).toEqual([{ kind: 'list', ordered: false, items: ['Punkt'] }]);
  });

  test('text after the list starts a new paragraph', () => {
    expect(toTextBlocks('Intro:\n• Ett\nAvslutning.')).toEqual([
      { kind: 'paragraph', text: 'Intro:' },
      { kind: 'list', ordered: false, items: ['Ett'] },
      { kind: 'paragraph', text: 'Avslutning.' },
    ]);
  });

  test('empty lines separate two lists', () => {
    expect(toTextBlocks('• Ett\n\n• To')).toEqual([
      { kind: 'list', ordered: false, items: ['Ett'] },
      { kind: 'list', ordered: false, items: ['To'] },
    ]);
  });

  test('a hyphen inside a sentence is not a bullet', () => {
    const tekst = 'KI-tiltak i offentlig sektor - en oversikt.';
    expect(toTextBlocks(tekst)).toEqual([{ kind: 'paragraph', text: tekst }]);
  });

  test('numbered lines become a numbered list', () => {
    expect(toTextBlocks('Tre områder:\n 1. Først\n 2. Så\n 3. Til slutt')).toEqual([
      { kind: 'paragraph', text: 'Tre områder:' },
      { kind: 'list', ordered: true, items: ['Først', 'Så', 'Til slutt'] },
    ]);
  });

  test.each(['1.', '1)', '10.'])('accepts %s as a number marker', (markor) => {
    expect(toTextBlocks(`${markor} Punkt`)).toEqual([
      { kind: 'list', ordered: true, items: ['Punkt'] },
    ]);
  });

  test('a year in the text is not a list item', () => {
    const tekst = '2026. Vi startet arbeidet med tilsyn.';
    expect(toTextBlocks(tekst)).toEqual([{ kind: 'paragraph', text: tekst }]);
  });

  test('bullet and number become two separate lists', () => {
    expect(toTextBlocks('• Ett\n 1. To')).toEqual([
      { kind: 'list', ordered: false, items: ['Ett'] },
      { kind: 'list', ordered: true, items: ['To'] },
    ]);
  });

  test('empty text gives no blocks', () => {
    expect(toTextBlocks('')).toEqual([]);
    expect(toTextBlocks('   \n  ')).toEqual([]);
  });

  test('the text in the dataset today is unchanged, since it has no line breaks', () => {
    const dagens = 'Dette er noen andre eksempler: • Vi har forenklet IT-løsninger.';
    expect(toTextBlocks(dagens)).toEqual([{ kind: 'paragraph', text: dagens }]);
  });
});

describe('toInline (links in free text)', () => {
  test('gives one text segment when there are no links', () => {
    expect(toInline('Bare tekst.')).toEqual([{ kind: 'text', text: 'Bare tekst.' }]);
  });

  test('picks out a link in the middle of a sentence', () => {
    expect(toInline('Se [rapporten](https://example.no/a) for mer.')).toEqual([
      { kind: 'text', text: 'Se ' },
      { kind: 'link', text: 'rapporten', href: 'https://example.no/a' },
      { kind: 'text', text: ' for mer.' },
    ]);
  });

  test('handles several links on the same line', () => {
    const ut = toInline('[en](https://a.no) og [to](https://b.no)');
    expect(ut.filter((d) => d.kind === 'link')).toHaveLength(2);
  });

  test('a link at the very start and very end gives no empty text segments', () => {
    expect(toInline('[a](https://a.no)')).toEqual([
      { kind: 'link', text: 'a', href: 'https://a.no' },
    ]);
  });

  // The most important one here. The text comes from an open submission form.
  test.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '/relativ/sti',
    'ikke-en-url',
  ])('does not render %s as a link', (href) => {
    const ut = toInline(`[klikk](${href})`);
    expect(ut.every((d) => d.kind === 'text')).toBe(true);
    expect(ut.map((d) => d.text).join('')).toBe(`[klikk](${href})`);
  });

  test('leaves incomplete markdown as plain text', () => {
    expect(toInline('[mangler parentes](https://a.no')).toEqual([
      { kind: 'text', text: '[mangler parentes](https://a.no' },
    ]);
  });

  test('does not interpret HTML in the label as markup', () => {
    const ut = toInline('[<img src=x onerror=alert(1)>](https://a.no)');
    expect(ut).toEqual([
      { kind: 'link', text: '<img src=x onerror=alert(1)>', href: 'https://a.no' },
    ]);
  });
});
