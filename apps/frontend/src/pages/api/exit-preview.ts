import type { APIRoute } from 'astro';
import { PREVIEW_COOKIE, previewCookieDeleteOptions } from '../../lib/preview';

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  // Clear the preview cookie
  cookies.delete(PREVIEW_COOKIE, previewCookieDeleteOptions());

  // Redirect back to the referring page or home
  const referer = url.searchParams.get('redirect') || '/';
  return redirect(referer, 307);
};
