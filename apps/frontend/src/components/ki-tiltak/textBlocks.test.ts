import { describe, expect, test } from 'vitest';
import { toTextBlocks, toInline } from './textBlocks';

describe('toTextBlocks', () => {
  test('vanlig tekst uten linjeskift blir ett avsnitt', () => {
    expect(toTextBlocks('En helt vanlig beskrivelse.')).toEqual([
      { kind: 'paragraph', text: 'En helt vanlig beskrivelse.' },
    ]);
  });

  test('kulepunkter blir en liste, med markøren fjernet', () => {
    expect(toTextBlocks('Eksempler:\n• Første\n• Andre')).toEqual([
      { kind: 'paragraph', text: 'Eksempler:' },
      { kind: 'list', ordered: false, items: ['Første', 'Andre'] },
    ]);
  });

  test.each(['•', '·', '▪', '-', '*'])('godtar %s som kulepunkt', (markor) => {
    expect(toTextBlocks(`${markor} Punkt`)).toEqual([{ kind: 'list', ordered: false, items: ['Punkt'] }]);
  });

  test('tekst etter lista starter et nytt avsnitt', () => {
    expect(toTextBlocks('Intro:\n• Ett\nAvslutning.')).toEqual([
      { kind: 'paragraph', text: 'Intro:' },
      { kind: 'list', ordered: false, items: ['Ett'] },
      { kind: 'paragraph', text: 'Avslutning.' },
    ]);
  });

  test('tomme linjer skiller to lister fra hverandre', () => {
    expect(toTextBlocks('• Ett\n\n• To')).toEqual([
      { kind: 'list', ordered: false, items: ['Ett'] },
      { kind: 'list', ordered: false, items: ['To'] },
    ]);
  });

  test('bindestrek inne i en setning er ikke et kulepunkt', () => {
    const tekst = 'KI-tiltak i offentlig sektor - en oversikt.';
    expect(toTextBlocks(tekst)).toEqual([{ kind: 'paragraph', text: tekst }]);
  });

  test('nummererte linjer blir en nummerert liste', () => {
    expect(toTextBlocks('Tre områder:\n 1. Først\n 2. Så\n 3. Til slutt')).toEqual([
      { kind: 'paragraph', text: 'Tre områder:' },
      { kind: 'list', ordered: true, items: ['Først', 'Så', 'Til slutt'] },
    ]);
  });

  test.each(['1.', '1)', '10.'])('godtar %s som nummermarkør', (markor) => {
    expect(toTextBlocks(`${markor} Punkt`)).toEqual([
      { kind: 'list', ordered: true, items: ['Punkt'] },
    ]);
  });

  test('årstall midt i teksten er ikke et listepunkt', () => {
    const tekst = '2026. Vi startet arbeidet med tilsyn.';
    expect(toTextBlocks(tekst)).toEqual([{ kind: 'paragraph', text: tekst }]);
  });

  test('kulepunkt og nummer blir to atskilte lister', () => {
    expect(toTextBlocks('• Ett\n 1. To')).toEqual([
      { kind: 'list', ordered: false, items: ['Ett'] },
      { kind: 'list', ordered: true, items: ['To'] },
    ]);
  });

  test('tom tekst gir ingen blokker', () => {
    expect(toTextBlocks('')).toEqual([]);
    expect(toTextBlocks('   \n  ')).toEqual([]);
  });

  test('teksten i datasettet i dag er uendret, siden den ikke har linjeskift', () => {
    const dagens = 'Dette er noen andre eksempler: • Vi har forenklet IT-løsninger.';
    expect(toTextBlocks(dagens)).toEqual([{ kind: 'paragraph', text: dagens }]);
  });
});

describe('toInline (lenker i fritekst)', () => {
  test('gir ett tekstsegment når det ikke er lenker', () => {
    expect(toInline('Bare tekst.')).toEqual([{ kind: 'text', text: 'Bare tekst.' }]);
  });

  test('plukker ut en lenke midt i en setning', () => {
    expect(toInline('Se [rapporten](https://example.no/a) for mer.')).toEqual([
      { kind: 'text', text: 'Se ' },
      { kind: 'link', text: 'rapporten', href: 'https://example.no/a' },
      { kind: 'text', text: ' for mer.' },
    ]);
  });

  test('takler flere lenker på samme linje', () => {
    const ut = toInline('[en](https://a.no) og [to](https://b.no)');
    expect(ut.filter((d) => d.kind === 'link')).toHaveLength(2);
  });

  test('lenke helt i starten og helt i slutten gir ingen tomme tekstsegmenter', () => {
    expect(toInline('[a](https://a.no)')).toEqual([
      { kind: 'link', text: 'a', href: 'https://a.no' },
    ]);
  });

  // Det viktigste her. Teksten kommer fra et åpent innsendingsskjema.
  test.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '/relativ/sti',
    'ikke-en-url',
  ])('rendrer ikke %s som lenke', (href) => {
    const ut = toInline(`[klikk](${href})`);
    expect(ut.every((d) => d.kind === 'text')).toBe(true);
    expect(ut.map((d) => d.text).join('')).toBe(`[klikk](${href})`);
  });

  test('lar ufullstendig markdown stå som vanlig tekst', () => {
    expect(toInline('[mangler parentes](https://a.no')).toEqual([
      { kind: 'text', text: '[mangler parentes](https://a.no' },
    ]);
  });

  test('tolker ikke HTML i etiketten som markup', () => {
    const ut = toInline('[<img src=x onerror=alert(1)>](https://a.no)');
    expect(ut).toEqual([
      { kind: 'link', text: '<img src=x onerror=alert(1)>', href: 'https://a.no' },
    ]);
  });
});
