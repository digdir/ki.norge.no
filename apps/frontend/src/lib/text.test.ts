import { describe, it, expect } from 'vitest';
import { ordlengde, splitLastWord } from './text';

describe('splitLastWord', () => {
  it('deler ved siste mellomrom og beholder mellomrommet i head', () => {
    expect(splitLastWord('Hva er KI og hva kan du bruke det til?')).toEqual({
      head: 'Hva er KI og hva kan du bruke det ',
      last: 'til?',
    });
  });

  it('gir tomt head for ett ord', () => {
    expect(splitLastWord('Eksempler')).toEqual({ head: '', last: 'Eksempler' });
  });

  it('tåler tom og undefined-aktig input', () => {
    expect(splitLastWord('')).toEqual({ head: '', last: '' });
    expect(splitLastWord('   ')).toEqual({ head: '', last: '' });
  });

  it('trimmer ytterkanter', () => {
    expect(splitLastWord('  Kom i gang  ')).toEqual({ head: 'Kom i ', last: 'gang' });
  });
});

describe('ordlengde', () => {
  it('gir lengden på det lengste ordet', () => {
    expect(ordlengde('KI Norge veiledningsmøte 7. oktober')).toBe('--lengste-ord: 15');
    expect(ordlengde('Digitaliseringskonferansen 2026')).toBe('--lengste-ord: 26');
  });

  it('bindestrek deler ord, hard bindestrek gjør det ikke', () => {
    expect(ordlengde('Nye krav for merking av KI-innhold')).toBe('--lengste-ord: 7');
    expect(ordlengde('KI\u2011regnekraft')).toBe('--lengste-ord: 13');
  });

  it('æøå teller som ett tegn, og tom tittel gir 0', () => {
    expect(ordlengde('Blåbærsyltetøy')).toBe('--lengste-ord: 14');
    expect(ordlengde(undefined)).toBe('--lengste-ord: 0');
  });
});
