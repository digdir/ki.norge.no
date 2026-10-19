/**
 * Path conversion between a regular page and its markdown variant.
 *
 * Lives in a SEPARATE module, without imports, on purpose. The functions used to live
 * in html-to-markdown.ts, which imports linkedom. When webmcp.ts fetched
 * markdownPathFor from there, all of linkedom came along into the client bundle, and
 * every visitor downloaded a DOM implementation to use two string functions.
 * WebMCP is also a no-op in almost all browsers, so the bytes were never used.
 *
 * Put nothing here that needs the DOM or other modules.
 */

/**
 * The path an agent can fetch as markdown with its own cache key.
 * `/veiledning` -> `/veiledning.md`, the front page -> `/index.md`.
 */
export function markdownPathFor(pathname: string): string {
  const clean = pathname.replace(/\/+$/, '');
  return clean ? `${clean}.md` : '/index.md';
}

/**
 * The opposite direction. Returns null when the path is not a markdown variant, so
 * middleware can leave everything else untouched.
 */
export function pathFromMarkdownPath(pathname: string): string | null {
  if (!pathname.endsWith('.md')) return null;
  const stripped = pathname.slice(0, -3);
  if (stripped === '' || stripped === '/index') return '/';
  return stripped;
}
