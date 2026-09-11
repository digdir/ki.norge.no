import { describe, expect, test } from 'vitest';
import { toTextBlocks } from './textBlocks';

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
