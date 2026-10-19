import { describe, expect, test } from 'vitest';
import { markdownPathFor, pathFromMarkdownPath } from './markdown-paths';

describe('markdownPathFor', () => {
  test.each([
    ['/veiledning', '/veiledning.md'],
    ['/veiledning/', '/veiledning.md'],
    ['/artikler/ki-i-skolen', '/artikler/ki-i-skolen.md'],
    ['/', '/index.md'],
  ])('%s -> %s', (input, expected) => {
    expect(markdownPathFor(input)).toBe(expected);
  });
});

describe('pathFromMarkdownPath', () => {
  test.each([
    ['/veiledning.md', '/veiledning'],
    ['/artikler/ki-i-skolen.md', '/artikler/ki-i-skolen'],
    ['/index.md', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(pathFromMarkdownPath(input)).toBe(expected);
  });

  test.each(['/veiledning', '/', '/llms.txt', '/robots.txt', '/bilde.md.png'])(
    '%s is not a markdown path',
    (input) => {
      expect(pathFromMarkdownPath(input)).toBeNull();
    },
  );

  test('round trip is stable for regular pages', () => {
    for (const path of ['/veiledning', '/artikler/a', '/']) {
      expect(pathFromMarkdownPath(markdownPathFor(path))).toBe(path);
    }
  });
});
