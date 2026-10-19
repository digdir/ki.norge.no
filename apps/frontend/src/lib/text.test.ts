import { describe, it, expect } from 'vitest';
import { ordlengde, splitLastWord } from './text';

describe('splitLastWord', () => {
  it('splits at the last space and keeps the space in head', () => {
    expect(splitLastWord('Hva er KI og hva kan du bruke det til?')).toEqual({
      head: 'Hva er KI og hva kan du bruke det ',
      last: 'til?',
    });
  });

  it('gives an empty head for a single word', () => {
    expect(splitLastWord('Eksempler')).toEqual({ head: '', last: 'Eksempler' });
  });

  it('handles empty and undefined-like input', () => {
    expect(splitLastWord('')).toEqual({ head: '', last: '' });
    expect(splitLastWord('   ')).toEqual({ head: '', last: '' });
  });

  it('trims the edges', () => {
    expect(splitLastWord('  Kom i gang  ')).toEqual({ head: 'Kom i ', last: 'gang' });
  });
});

describe('ordlengde', () => {
  it('gives the length of the longest word', () => {
    expect(ordlengde('KI Norge veiledningsmøte 7. oktober')).toBe('--lengste-ord: 15');
    expect(ordlengde('Digitaliseringskonferansen 2026')).toBe('--lengste-ord: 26');
  });

  it('a hyphen splits words, a non-breaking hyphen does not', () => {
    expect(ordlengde('Nye krav for merking av KI-innhold')).toBe('--lengste-ord: 7');
    expect(ordlengde('KI\u2011regnekraft')).toBe('--lengste-ord: 13');
  });

  it('æøå count as one character, and an empty title gives 0', () => {
    expect(ordlengde('Blåbærsyltetøy')).toBe('--lengste-ord: 14');
    expect(ordlengde(undefined)).toBe('--lengste-ord: 0');
  });
});
