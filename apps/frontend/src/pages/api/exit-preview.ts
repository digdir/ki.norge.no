import type { APIRoute } from 'astro';
import { PREVIEW_COOKIE, exitTarget, previewCookieDeleteOptions } from '../../lib/preview';

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  cookies.delete(PREVIEW_COOKIE, previewCookieDeleteOptions());
  return redirect(exitTarget(url.searchParams.get('redirect'), url), 307);
};
