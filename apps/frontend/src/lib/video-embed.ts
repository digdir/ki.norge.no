// Turns the video URLs editors paste into the CMS into URLs that are safe to put in
// an iframe. Only Vimeo is allowed, and the CSP frame-src (csp.ts) lists the same hosts.
// Anything else gives undefined, and the page shows no player.

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

function parse(url: string | undefined): URL | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' || !VIMEO_HOSTS.has(u.hostname)) return undefined;
    return u;
  } catch {
    return undefined;
  }
}

/**
 * Embed URL for a live stream or a recording.
 * - vimeo.com/event/123/embed (and /event/123) → vimeo.com/event/123/embed
 * - vimeo.com/123 and player.vimeo.com/video/123 → player.vimeo.com/video/123
 * Unlisted videos keep their hash: vimeo.com/123/abc → ...?h=abc
 */
export function vimeoEmbedUrl(url: string | undefined): string | undefined {
  const u = parse(url);
  if (!u) return undefined;

  const event = u.pathname.match(/^\/event\/(\d+)(?:\/embed)?\/?$/);
  if (event && u.hostname !== 'player.vimeo.com') {
    return `https://vimeo.com/event/${event[1]}/embed`;
  }

  const video = u.hostname === 'player.vimeo.com'
    ? u.pathname.match(/^\/video\/(\d+)\/?$/)
    : u.pathname.match(/^\/(\d+)(?:\/([0-9a-f]+))?\/?$/);
  if (!video) return undefined;

  const hash = video[2] || u.searchParams.get('h');
  return `https://player.vimeo.com/video/${video[1]}${hash ? `?h=${hash}` : ''}`;
}

/** Vimeo interaction tools (Q&A, polls) for a live event. Kept as is when it is on vimeo.com. */
export function vimeoInteraksjonUrl(url: string | undefined): string | undefined {
  const u = parse(url);
  if (!u || !/^\/live\/interaction_tools\/live_event\/\d+\/?$/.test(u.pathname)) return undefined;
  return `https://vimeo.com${u.pathname.replace(/\/$/, '')}`;
}
