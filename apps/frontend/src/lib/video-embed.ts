// Turns the video URLs editors paste into the CMS into URLs that are safe to put in
// an iframe. Only Vimeo and YouTube are allowed, and the CSP frame-src (csp.ts) lists
// the same hosts. Anything else gives undefined, and the page shows no player.

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function parse(url: string | undefined, hosts: Set<string>): URL | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' || !hosts.has(u.hostname)) return undefined;
    return u;
  } catch {
    return undefined;
  }
}

/**
 * Embed URL for a Vimeo live stream or video.
 * - vimeo.com/event/123/embed (and /event/123) → vimeo.com/event/123/embed
 * - vimeo.com/123 and player.vimeo.com/video/123 → player.vimeo.com/video/123
 * Unlisted videos keep their hash: vimeo.com/123/abc → ...?h=abc
 */
export function vimeoEmbedUrl(url: string | undefined): string | undefined {
  const u = parse(url, VIMEO_HOSTS);
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

/** "90", "90s" or "1h2m3s" → seconds. Anything else → undefined. */
function seconds(t: string | null): number | undefined {
  if (!t) return undefined;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10) || undefined;
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !t) return undefined;
  const total = (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  return total || undefined;
}

/**
 * Embed URL for a YouTube video, on youtube-nocookie.com so YouTube does not set
 * cookies before the visitor presses play (we have no consent banner for that).
 * Takes watch?v=, youtu.be/, /embed/, /shorts/ and /live/ links, and keeps the start time.
 */
export function youtubeEmbedUrl(url: string | undefined): string | undefined {
  const u = parse(url, YOUTUBE_HOSTS);
  if (!u) return undefined;

  let id: string | null | undefined;
  if (u.hostname === 'youtu.be') {
    id = u.pathname.slice(1).replace(/\/$/, '');
  } else if (u.pathname === '/watch') {
    id = u.searchParams.get('v');
  } else {
    id = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)\/?$/)?.[1];
  }
  if (!id || !YOUTUBE_ID.test(id)) return undefined;

  const start = seconds(u.searchParams.get('start') ?? u.searchParams.get('t'));
  return `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`;
}

/** Vimeo or YouTube, whichever the URL is. */
export function videoEmbedUrl(url: string | undefined): string | undefined {
  return vimeoEmbedUrl(url) ?? youtubeEmbedUrl(url);
}

/** Vimeo interaction tools (Q&A, polls) for a live event. Kept as is when it is on vimeo.com. */
export function vimeoInteraksjonUrl(url: string | undefined): string | undefined {
  const u = parse(url, VIMEO_HOSTS);
  if (!u || !/^\/live\/interaction_tools\/live_event\/\d+\/?$/.test(u.pathname)) return undefined;
  return `https://vimeo.com${u.pathname.replace(/\/$/, '')}`;
}
