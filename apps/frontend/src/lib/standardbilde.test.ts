import { describe, it, expect } from 'vitest';
import { velgStandardbilde, STANDARDBILDE_DEFAULT, STANDARDBILDE_VARIANTER } from './standardbilde';

const url = (query = '') => new URL(`https://ki.norge.no/${query}`);

describe('velgStandardbilde', () => {
  it('bruker standardvarianten uten parameter', () => {
    expect(velgStandardbilde(url())).toBe(STANDARDBILDE_DEFAULT);
  });

  it('lar parameteret velge hver variant', () => {
    for (const v of STANDARDBILDE_VARIANTER) {
      expect(velgStandardbilde(url(`?standardbilde=${v}`))).toBe(v);
    }
  });

  it('faller tilbake til standard på ukjent verdi', () => {
    expect(velgStandardbilde(url('?standardbilde=tull'))).toBe(STANDARDBILDE_DEFAULT);
    expect(velgStandardbilde(url('?standardbilde='))).toBe(STANDARDBILDE_DEFAULT);
  });
});
