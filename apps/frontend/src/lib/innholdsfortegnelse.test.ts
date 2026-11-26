import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { artikkelOverskrifter, lagId, RESERVERT } from './innholdsfortegnelse';
import type { UmbracoBlock } from './umbraco';

const tekst = (innhold: string): UmbracoBlock => ({ contentType: 'artikkelTekst', content: { innhold } } as UmbracoBlock);

describe('lagId', () => {
  it('keeps æ, ø and å and joins words with hyphens, as links to existing headings expect', () => {
    expect(lagId('Gå i dialog med leverandører')).toBe('gå-i-dialog-med-leverandører');
    expect(lagId('Avklaringer om KI i behov- og planfasen')).toBe('avklaringer-om-ki-i-behov-og-planfasen');
    expect(lagId('Hvilket problem skal du løse?')).toBe('hvilket-problem-skal-du-løse');
    expect(lagId('Ærlig talt')).toBe('ærlig-talt');
  });
});

describe('artikkelOverskrifter', () => {
  it('finds the h2s in rich text, in order, and puts the ids on them', () => {
    const block = tekst('<h2 class="ds-heading">Utfordring</h2><p class="ds-paragraph">Tekst</p><h3>Under</h3><h2>Løsning</h2>');
    const r = artikkelOverskrifter([block]);
    expect(r.overskrifter).toEqual([
      { id: 'utfordring', tekst: 'Utfordring' },
      { id: 'løsning', tekst: 'Løsning' },
    ]);
    expect(r.html.get(block)).toBe(
      '<h2 id="utfordring" class="ds-heading">Utfordring</h2><p class="ds-paragraph">Tekst</p><h3>Under</h3><h2 id="løsning">Løsning</h2>',
    );
  });

  it('keeps the ids richTextToHtml gave the headings, and leaves the html as it was', () => {
    const block = tekst('<h2 id="gå-i-dialog-med-leverandører">Gå i dialog med leverandører</h2><h2 id="løsning">Løsning</h2>');
    const r = artikkelOverskrifter([block]);
    expect(r.overskrifter.map(o => o.id)).toEqual(['gå-i-dialog-med-leverandører', 'løsning']);
    expect(r.html.has(block)).toBe(false);
  });

  it('gives an h2 a new id when an element before it on the page has its id', () => {
    const forst = tekst('<h3 id="resultat">Resultat</h3><p>Tekst</p>');
    const infoboks = { contentType: 'artikkelInfoBoks', content: { tittel: 'x', innhold: '<h4 id="bakgrunn">Bakgrunn</h4>' } } as UmbracoBlock;
    const senere = tekst('<h2 id="resultat">Resultat</h2><h2 id="bakgrunn">Bakgrunn</h2>');
    const r = artikkelOverskrifter([forst, infoboks, senere]);
    expect(r.overskrifter.map(o => o.id)).toEqual(['resultat-2', 'bakgrunn-2']);
    expect(r.html.get(senere)).toBe('<h2 id="resultat-2">Resultat</h2><h2 id="bakgrunn-2">Bakgrunn</h2>');
  });

  it('keeps an h2 its id when the same id only comes after it', () => {
    const block = tekst('<h2 id="resultat">Resultat</h2><h3 id="resultat">Resultat</h3>');
    const r = artikkelOverskrifter([block]);
    expect(r.overskrifter.map(o => o.id)).toEqual(['resultat']);
    expect(r.html.has(block)).toBe(false);
  });

  it('uses the text of inline markup and skips empty headings', () => {
    const r = artikkelOverskrifter([tekst('<h2><strong>Dette</strong> lærte   vi</h2><h2> </h2>')]);
    expect(r.overskrifter).toEqual([{ id: 'dette-lærte-vi', tekst: 'Dette lærte vi' }]);
  });

  it('keeps ids unique across blocks, and off the layout ids', () => {
    const r = artikkelOverskrifter([tekst('<h2>Resultat</h2>'), tekst('<h2>Resultat</h2><h2>Main content</h2>')]);
    expect(r.overskrifter.map(o => o.id)).toEqual(['resultat', 'resultat-2', 'main-content-2']);
  });

  it('keeps block titles off the ids in earlier blocks', () => {
    const prosess = { contentType: 'artikkelProsessteg', content: { tittel: 'Slik gjør du', steg: [] } } as unknown as UmbracoBlock;
    const r = artikkelOverskrifter([tekst('<h3 id="slik-gjør-du">Slik gjør du</h3>'), prosess]);
    expect(r.tittelId.get(prosess)).toBe('slik-gjør-du-2');
  });

  it('includes block titles that render as h2, in page order', () => {
    const prosess = { contentType: 'artikkelProsessteg', content: { tittel: 'Slik gjør du', steg: [] } } as unknown as UmbracoBlock;
    const gruppe = { contentType: 'artikkelTrekkspill', content: { tittel: 'Spørsmål 1', innhold: '<h2>Skjult</h2>' }, settings: { gruppeTittel: 'Ofte stilte spørsmål' } } as unknown as UmbracoBlock;
    const iGruppe = { contentType: 'artikkelTrekkspill', content: { tittel: 'Spørsmål 2', innhold: '' }, settings: { gruppeTittel: '' } } as unknown as UmbracoBlock;
    const r = artikkelOverskrifter([tekst('<h2>Innledning</h2>'), prosess, gruppe, iGruppe]);
    expect(r.overskrifter.map(o => o.tekst)).toEqual(['Innledning', 'Slik gjør du', 'Ofte stilte spørsmål']);
    expect(r.tittelId.get(prosess)).toBe('slik-gjør-du');
    expect(r.tittelId.get(gruppe)).toBe('ofte-stilte-spørsmål');
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

describe('RESERVERT', () => {
  it('has every fixed id in the markup', () => {
    const src = fileURLToPath(new URL('..', import.meta.url));
    const filer = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(f => /\.(astro|tsx)$/.test(f));
    const mangler = new Set<string>();
    for (const fil of filer) {
      for (const m of readFileSync(join(src, fil), 'utf8').matchAll(/\sid="([^"]+)"/g)) {
        if (!RESERVERT.has(m[1])) mangler.add(`${m[1]} (${fil})`);
      }
    }
    expect([...mangler]).toEqual([]);
  });
});
