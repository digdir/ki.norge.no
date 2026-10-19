import { describe, it, expect, vi } from 'vitest';
import type { APIContext } from 'astro';
import { GET as exitPreview } from '../pages/api/exit-preview';
import {
  PREVIEW_COOKIE,
  bypassesCache,
  exitTarget,
  previewCookieOptions,
  resolvePreview,
  timingSafeEqual,
  withoutSecret,
} from './preview';

const SECRET = '59cfdda7b9140784c3c80149b5348d81';

describe('timingSafeEqual', () => {
  it('is true for equal strings', () => {
    expect(timingSafeEqual(SECRET, SECRET)).toBe(true);
  });

  it('is false for different length and for different content', () => {
    expect(timingSafeEqual(SECRET, SECRET.slice(0, -1))).toBe(false);
    expect(timingSafeEqual(SECRET, SECRET.replace(/.$/, 'X'))).toBe(false);
  });

  it('handles empty strings', () => {
    expect(timingSafeEqual('', '')).toBe(true);
    expect(timingSafeEqual('', SECRET)).toBe(false);
  });
});

describe('resolvePreview', () => {
  it('lets through with the correct secret in the URL, and sets the cookie', () => {
    expect(
      resolvePreview({ secretParam: SECRET, cookieValue: undefined, configuredSecret: SECRET }),
    ).toEqual({ isPreview: true, shouldSetCookie: true });
  });

  it('lets through on the cookie alone, without setting it again', () => {
    expect(
      resolvePreview({ secretParam: null, cookieValue: SECRET, configuredSecret: SECRET }),
    ).toEqual({ isPreview: true, shouldSetCookie: false });
  });

  // The leak itself: ?preview=true without a secret gave drafts to anyone.
  it('rejects a request without a secret', () => {
    expect(
      resolvePreview({ secretParam: null, cookieValue: undefined, configuredSecret: SECRET }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
  });

  it('rejects a wrong secret in the URL', () => {
    expect(
      resolvePreview({ secretParam: 'gjett', cookieValue: undefined, configuredSecret: SECRET }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
  });

  // The cookie is client-controlled, so a flag would be trivial to forge.
  it('rejects a forged cookie', () => {
    expect(
      resolvePreview({ secretParam: null, cookieValue: '1', configuredSecret: SECRET }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
  });

  it('is off when no secret is configured, regardless of what is sent in', () => {
    expect(
      resolvePreview({ secretParam: '', cookieValue: '', configuredSecret: '' }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
    expect(
      resolvePreview({ secretParam: SECRET, cookieValue: SECRET, configuredSecret: '' }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
  });

  // If the value is in a public repo, it is not a secret.
  it.each(['change-me', 'generate-a-random-secret-here', 'super-secret-preview-key'])(
    'is off when the secret is the placeholder %s',
    (placeholder) => {
      expect(
        resolvePreview({ secretParam: placeholder, cookieValue: placeholder, configuredSecret: placeholder }),
      ).toEqual({ isPreview: false, shouldSetCookie: false });
    },
  );

  it('is off when the secret is shorter than 32 characters', () => {
    const kort = SECRET.slice(0, 31);
    expect(
      resolvePreview({ secretParam: kort, cookieValue: undefined, configuredSecret: kort }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
  });

  // The CMS does not URL-encode the value, so + arrives as a space.
  it('is off when the secret has characters that do not survive the URL', () => {
    const base64 = 'q1w2e3r4t5y6u7i8o9p0+a/s=d1f2g3h4j5k6';
    expect(
      resolvePreview({ secretParam: base64, cookieValue: undefined, configuredSecret: base64 }),
    ).toEqual({ isPreview: false, shouldSetCookie: false });
  });
});

describe('bypassesCache', () => {
  const side = (query: string) => new URL(`https://ki.norge.no/artikler/x${query}`);

  it('lets regular pages into the cache', () => {
    expect(bypassesCache(side(''), false)).toBe(false);
    expect(bypassesCache(side('?side=2'), false)).toBe(false);
  });

  // With only the verdict, ?secret=<real value> got public, s-maxage as long as the frontend lacked the secret.
  it('keeps attempts out of the cache even when they did not get through', () => {
    expect(bypassesCache(side('?preview=true'), false)).toBe(true);
    expect(bypassesCache(side(`?preview=true&secret=${SECRET}`), false)).toBe(true);
    expect(bypassesCache(side('?secret=gjett'), false)).toBe(true);
  });

  it('keeps an approved preview out of the cache, even without anything in the URL', () => {
    expect(bypassesCache(side(''), true)).toBe(true);
  });
});

describe('exit preview', () => {
  // Inside the backoffice iframe a Set-Cookie that lacks the attributes
  // the cookie was set with is rejected, and then it stayed.
  it('deletes the cookie with the same attributes it was set with', async () => {
    const del = vi.fn();
    await exitPreview({
      cookies: { delete: del },
      redirect: (path: string, status: number) => new Response(null, { status, headers: { Location: path } }),
      url: new URL('https://ki.norge.no/api/exit-preview?redirect=/artikler/x'),
    } as unknown as APIContext);

    const { maxAge: _maxAge, ...satt } = previewCookieOptions();
    expect(del).toHaveBeenCalledWith(PREVIEW_COOKIE, satt);
  });
});

describe('withoutSecret', () => {
  const fra = (pathAndQuery: string) => new URL(`https://ki.norge.no${pathAndQuery}`);

  it('removes the secret and keeps the rest, including preview=true', () => {
    expect(withoutSecret(fra(`/artikler/x?preview=true&secret=${SECRET}`))).toBe('/artikler/x?preview=true');
    expect(withoutSecret(fra(`/eksempler?secret=${SECRET}&side=2&preview=true`))).toBe('/eksempler?side=2&preview=true');
  });

  it('gives only the path when the secret was everything', () => {
    expect(withoutSecret(fra(`/?secret=${SECRET}`))).toBe('/');
  });

  // A relative address keeps the editor on the same host that set the cookie.
  it('never gives an address to another host', () => {
    expect(withoutSecret(fra(`//evil.example/x?secret=${SECRET}`))).toBe('/evil.example/x');
  });
});

describe('exitTarget', () => {
  const exit = new URL('https://ki.norge.no/api/exit-preview');

  it('sends back to the page the editor was on', () => {
    expect(exitTarget('/artikler/x', exit)).toBe('/artikler/x');
    expect(exitTarget('/eksempler?side=2', exit)).toBe('/eksempler?side=2');
    expect(exitTarget(null, exit)).toBe('/');
  });

  it.each(['https://evil.example/', '//evil.example/x', '/.//evil.example/x', 'javascript:alert(1)'])(
    'never sends off the site: %s',
    (redirect) => {
      expect(exitTarget(redirect, exit)).not.toMatch(/^\/\/|^[a-z]+:/i);
    },
  );
});
