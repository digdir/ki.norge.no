import { describe, it, expect } from 'vitest';
import { splitLastWord } from './text';

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
