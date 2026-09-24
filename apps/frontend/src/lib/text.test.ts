import { describe, it, expect } from 'vitest';
import { splitLastChar, splitLastWord } from './text';

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

describe('splitLastChar', () => {
  it('skiller ut bare siste tegn, resten er uendret', () => {
    expect(splitLastChar('Ny oversikt viser hvordan det offentlige bruker KI')).toEqual({
      head: 'Ny oversikt viser hvordan det offentlige bruker K',
      last: 'I',
    });
  });

  it('holder æøå og tegn utenfor BMP hele', () => {
    expect(splitLastChar('Ny KI-strategi for Tromsø')).toEqual({ head: 'Ny KI-strategi for Troms', last: 'ø' });
    expect(splitLastChar('KI 🙂').last).toBe('🙂');
  });

  it('tåler tom input og trimmer', () => {
    expect(splitLastChar('')).toEqual({ head: '', last: '' });
    expect(splitLastChar('  KI  ')).toEqual({ head: 'K', last: 'I' });
  });
});
