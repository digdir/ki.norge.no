import { describe, expect, test } from 'vitest';
import { markdownPathFor, pathFromMarkdownPath } from './html-to-markdown';

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
    '%s er ikke en markdown-sti',
    (input) => {
      expect(pathFromMarkdownPath(input)).toBeNull();
    },
  );

  test('rundtur er stabil for vanlige sider', () => {
    for (const path of ['/veiledning', '/artikler/a', '/']) {
      expect(pathFromMarkdownPath(markdownPathFor(path))).toBe(path);
    }
  });
});
