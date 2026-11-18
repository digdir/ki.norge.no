import { describe, expect, test, vi } from 'vitest';
import { MEDIA_CACHE_CONTROL, proxyMedia, SVG_CSP } from './media-proxy';

const CMS = 'https://cms.intern.example';
const PORTAL = 'https://ki.norge.no';

const image = (headers: Record<string, string> = {}, status = 200) =>
  new Response('bytes', { status, headers: { 'Content-Type': 'image/webp', ETag: '"abc"', 'Set-Cookie': 'x=1', ...headers } });

function proxy(path: string, upstream: () => Promise<Response> = async () => image(), method = 'GET') {
  const fetchFn = vi.fn(upstream) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  const response = proxyMedia(new Request(`${PORTAL}${path}`, { method }), CMS, fetchFn);
  return { response, fetchFn };
}

describe('proxyMedia', () => {
  test('fetches the same path and query from the CMS', async () => {
    const { response, fetchFn } = proxy('/media/dahn4vu4/tiltak.png?width=800&format=webp&quality=80');
    const r = await response;
    expect(fetchFn.mock.calls[0][0]).toBe(`${CMS}/media/dahn4vu4/tiltak.png?width=800&format=webp&quality=80`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('bytes');
  });

  test('passes content headers, not cookies, and sets a long cache', async () => {
    const r = await proxy('/media/a/b.png').response;
    expect(r.headers.get('Content-Type')).toBe('image/webp');
    expect(r.headers.get('ETag')).toBe('"abc"');
    expect(r.headers.get('Set-Cookie')).toBeNull();
    expect(r.headers.get('Cache-Control')).toBe(MEDIA_CACHE_CONTROL);
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  test('keeps Cache-Control from the CMS when it sets one', async () => {
    const r = await proxy('/media/a/b.png', async () => image({ 'Cache-Control': 'public, max-age=60' })).response;
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  test('SVG gets a CSP that keeps scripts from running', async () => {
    const r = await proxy('/media/a/logo.svg', async () => image({ 'Content-Type': 'image/svg+xml' })).response;
    expect(r.headers.get('Content-Security-Policy')).toBe(SVG_CSP);
  });

  test('404 from the CMS is 404 and never cached', async () => {
    const r = await proxy('/media/a/borte.png', async () => image({}, 404)).response;
    expect(r.status).toBe(404);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
  });

  test('CMS error or network failure gives 502, never cached', async () => {
    const r1 = await proxy('/media/a/b.png', async () => image({}, 500)).response;
    expect(r1.status).toBe(502);
    expect(r1.headers.get('Cache-Control')).toBe('private, no-store');
    const r2 = await proxy('/media/a/b.png', async () => { throw new Error('ECONNRESET'); }).response;
    expect(r2.status).toBe(502);
  });

  test.each([
    '/media/%2e%2e/umbraco/delivery/api/v2/content',
    '/media/a%2F..%2F..%2Fumbraco',
    '/media/a%5c..%5cumbraco',
  ])('does not forward paths that could leave /media: %s', async (path) => {
    const { response, fetchFn } = proxy(path);
    expect((await response).status).toBe(404);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test('HEAD gives headers without a body', async () => {
    const { response, fetchFn } = proxy('/media/a/b.png', undefined, 'HEAD');
    const r = await response;
    expect(fetchFn.mock.calls[0][1]).toMatchObject({ method: 'HEAD' });
    expect(r.headers.get('Content-Type')).toBe('image/webp');
    expect(await r.text()).toBe('');
  });

  test('other methods are refused', async () => {
    const { response, fetchFn } = proxy('/media/a/b.png', undefined, 'POST');
    expect((await response).status).toBe(405);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
