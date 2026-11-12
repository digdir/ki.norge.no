import { describe, expect, test } from 'vitest';
import { withOrigin } from './link-origin';

describe('withOrigin', () => {
  test('adds the origin to an internal path', () => {
    expect(withOrigin('/om-oss', 'meny')).toBe('/om-oss?fra=meny');
    expect(withOrigin('/', 'logo')).toBe('/?fra=logo');
  });

  test('keeps an existing query and a hash, in the right order', () => {
    expect(withOrigin('/ki-tiltak?tiltak=abc', 'bunntekst')).toBe('/ki-tiltak?tiltak=abc&fra=bunntekst');
    expect(withOrigin('/veiledning#steg-2', 'meny')).toBe('/veiledning?fra=meny#steg-2');
  });

  test('replaces an origin that is already there instead of adding a second one', () => {
    expect(withOrigin('/om-oss?fra=meny', 'bunntekst')).toBe('/om-oss?fra=bunntekst');
  });

  test.each([
    'https://www.digdir.no/',
    '//example.com/side',
    'mailto:post@kin.norge.no',
    'tel:+4722450000',
    '#main-content',
    '',
  ])('leaves %s alone', (href) => {
    expect(withOrigin(href, 'bunntekst')).toBe(href);
  });
});
