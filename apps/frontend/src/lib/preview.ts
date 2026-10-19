/**
 * Decides whether a request may see unpublished content.
 *
 * The CMS puts a secret on its preview links
 * (`?preview=true&secret=...`, see HeadlessPreviewUrlProvider.cs), but the frontend
 * never checked it. So it was enough to write `?preview=true` after any
 * address to read drafts that were not published.
 *
 * The cookie carries the secret itself, not a flag. A cookie is
 * client-controlled, so `preview=1` would be as easy to forge as the
 * query parameter it replaced.
 *
 * Without a usable secret, preview is OFF. Fails closed rather
 * than letting a missing variable open the drafts to everyone.
 */

/** cache-kinorgeportal goes straight to origin when a cookie with this name is present. */
export const PREVIEW_COOKIE = 'preview';

/** The editor has time to click around, without a forgotten cookie living forever. */
export const PREVIEW_COOKIE_MAX_AGE = 60 * 60 * 8;

/**
 * At least 32 characters, and only characters that survive the URL unchanged. The CMS does not
 * URL-encode the value, so a `+` from base64 becomes a space and never matches.
 * Placeholders like `change-me` from a public repo stop here.
 */
const USABLE_SECRET = /^[A-Za-z0-9_-]{32,}$/;

/**
 * Compares without revealing how far into the string the first difference came.
 * The length leaks, as in all common implementations, and is not secret here.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

export interface PreviewRequest {
  /** The `secret` parameter from the URL, as the CMS sends it. */
  secretParam: string | null;
  /** The value of the preview cookie, set by us on the previous valid link. */
  cookieValue: string | undefined;
  /** PREVIEW_SECRET from the environment. Empty or too weak means preview is turned off. */
  configuredSecret: string;
}

export interface PreviewVerdict {
  /** True only when the secret matches. Controls both content and caching. */
  isPreview: boolean;
  /** True when the secret came in the URL, and the cookie should therefore be set. */
  shouldSetCookie: boolean;
}

export function resolvePreview({
  secretParam,
  cookieValue,
  configuredSecret,
}: PreviewRequest): PreviewVerdict {
  if (!USABLE_SECRET.test(configuredSecret)) return { isPreview: false, shouldSetCookie: false };

  if (secretParam !== null && timingSafeEqual(secretParam, configuredSecret)) {
    return { isPreview: true, shouldSetCookie: true };
  }

  if (cookieValue !== undefined && timingSafeEqual(cookieValue, configuredSecret)) {
    return { isPreview: true, shouldSetCookie: false };
  }

  return { isPreview: false, shouldSetCookie: false };
}

/**
 * The address the editor is sent on to once the cookie is set. The secret must
 * not stay in the address bar, in the history, in a link pasted into
 * Teams or in location.href that the analytics scripts read. The cookie carries it on.
 */
export function withoutSecret(url: URL): string {
  const target = new URL(url);
  target.searchParams.delete('secret');
  return localPath(target);
}

/**
 * Where "Avslutt forhåndsvisning" sends the editor. Only our own pages, otherwise
 * the route is an open redirect from ki.norge.no to anywhere.
 */
export function exitTarget(redirectParam: string | null, url: URL): string {
  const target = new URL(redirectParam || '/', url);
  return target.origin === url.origin ? localPath(target) : '/';
}

// `//host/path` is an address to another host, not a path.
function localPath(target: URL): string {
  return `/${target.pathname.replace(/^\/+/, '')}${target.search}`;
}

/**
 * Attempts that did not get through are also kept out of the edge cache. Otherwise
 * a real `secret` ends up in a public cache entry as long as the frontend lacks
 * the secret, and every guess at it creates a new entry.
 */
export function bypassesCache(url: URL, isPreview: boolean): boolean {
  return isPreview || url.searchParams.has('preview') || url.searchParams.has('secret');
}

/**
 * The backoffice shows the frontend in an iframe, cms.ki.norge.no around ki.norge.no.
 * norge.no is not on the Public Suffix List, so the two are the same site, and Lax
 * is enough. That is why HeadlessPreview__FrontendUrl in syncroot points to ki.norge.no and
 * ki.test.norge.no. workers.dev is on the list, so from a workers.dev host the
 * cookie became a third-party cookie that Safari blocks.
 * The value is the secret itself, hence HttpOnly and Secure.
 */
export function previewCookieOptions() {
  return { ...previewCookieDeleteOptions(), maxAge: PREVIEW_COOKIE_MAX_AGE };
}

/**
 * The same attributes the cookie was set with. A Set-Cookie without them is rejected in
 * the iframe, and then the cookie stayed for eight hours with no way out.
 */
export function previewCookieDeleteOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  } as const;
}
