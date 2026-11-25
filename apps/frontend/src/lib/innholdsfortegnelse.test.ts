import { describe, expect, it } from 'vitest';
import { artikkelOverskrifter, lagId } from './innholdsfortegnelse';
import type { UmbracoBlock } from './umbraco';

const tekst = (innhold: string): UmbracoBlock => ({ contentType: 'artikkelTekst', content: { innhold } } as UmbracoBlock);

describe('lagId', () => {
  it('writes æ, ø and å as ascii and joins words with hyphens', () => {
    expect(lagId('Gå i dialog med leverandører')).toBe('ga-i-dialog-med-leverandorer');
    expect(lagId('Avklaringer om KI i behov- og planfasen')).toBe('avklaringer-om-ki-i-behov-og-planfasen');
    expect(lagId('Hvilket problem skal du løse?')).toBe('hvilket-problem-skal-du-lose');
    expect(lagId('Ærlig talt')).toBe('aerlig-talt');
  });

  it('falls back when nothing is left', () => {
    expect(lagId('???')).toBe('seksjon');
  });
});

describe('artikkelOverskrifter', () => {
  it('finds the h2s in rich text, in order, and puts the ids on them', () => {
    const block = tekst('<h2 class="ds-heading">Utfordring</h2><p class="ds-paragraph">Tekst</p><h3>Under</h3><h2>Løsning</h2>');
    const r = artikkelOverskrifter([block]);
    expect(r.overskrifter).toEqual([
      { id: 'utfordring', tekst: 'Utfordring' },
      { id: 'losning', tekst: 'Løsning' },
    ]);
    expect(r.html.get(block)).toBe(
      '<h2 id="utfordring" class="ds-heading">Utfordring</h2><p class="ds-paragraph">Tekst</p><h3>Under</h3><h2 id="losning">Løsning</h2>',
    );
  });

  it('uses the text of inline markup and skips empty headings', () => {
    const r = artikkelOverskrifter([tekst('<h2><strong>Dette</strong> lærte   vi</h2><h2> </h2>')]);
    expect(r.overskrifter).toEqual([{ id: 'dette-laerte-vi', tekst: 'Dette lærte vi' }]);
  });

  it('keeps ids unique across blocks, and off the layout ids', () => {
    const r = artikkelOverskrifter([tekst('<h2>Resultat</h2>'), tekst('<h2>Resultat</h2><h2>Main content</h2>')]);
    expect(r.overskrifter.map(o => o.id)).toEqual(['resultat', 'resultat-2', 'main-content-2']);
  });

  it('includes block titles that render as h2, in page order', () => {
    const prosess = { contentType: 'artikkelProsessteg', content: { tittel: 'Slik gjør du', steg: [] } } as unknown as UmbracoBlock;
    const gruppe = { contentType: 'artikkelTrekkspill', content: { tittel: 'Spørsmål 1', innhold: '<h2>Skjult</h2>' }, settings: { gruppeTittel: 'Ofte stilte spørsmål' } } as unknown as UmbracoBlock;
    const iGruppe = { contentType: 'artikkelTrekkspill', content: { tittel: 'Spørsmål 2', innhold: '' }, settings: { gruppeTittel: '' } } as unknown as UmbracoBlock;
    const r = artikkelOverskrifter([tekst('<h2>Innledning</h2>'), prosess, gruppe, iGruppe]);
    expect(r.overskrifter.map(o => o.tekst)).toEqual(['Innledning', 'Slik gjør du', 'Ofte stilte spørsmål']);
    expect(r.tittelId.get(prosess)).toBe('slik-gjor-du');
    expect(r.tittelId.get(gruppe)).toBe('ofte-stilte-sporsmal');
    expect(r.tittelId.has(iGruppe)).toBe(false);
  });

  it('leaves out the contact card, which is not a section', () => {
    const kort = { contentType: 'artikkelKontaktkort', content: { tittel: 'Kontaktperson', navn: 'Test' } } as unknown as UmbracoBlock;
    const r = artikkelOverskrifter([tekst('<h2>Utfordring</h2><h2>Løsning</h2>'), kort]);
    expect(r.overskrifter.map(o => o.tekst)).toEqual(['Utfordring', 'Løsning']);
    expect(r.tittelId.has(kort)).toBe(false);
  });

  it('leaves rich text without h2s alone', () => {
    const block = tekst('<p>Bare tekst</p><h3>Liten</h3>');
    const r = artikkelOverskrifter([block, { contentType: 'artikkelInfoBoks', content: { tittel: 'x', innhold: '<h2>Ikke med</h2>' } } as UmbracoBlock]);
    expect(r.overskrifter).toEqual([]);
    expect(r.html.has(block)).toBe(false);
  });

  it('handles no blocks', () => {
    expect(artikkelOverskrifter(undefined).overskrifter).toEqual([]);
  });
});
