// Embeds for digital events (#926): Vimeo and YouTube video, Slido and Vimeo chat.
//
// Editors paste an ordinary share link in the CMS, never iframe code. We parse the
// link, accept only known hosts and build the embed URL ourselves from a validated
// ID. Anything else gives null, and nothing is embedded. The hosts here must match
// frame-src in csp.ts.

export type VideoProvider = 'vimeo' | 'vimeo-event' | 'youtube';
export type InteraksjonProvider = 'slido' | 'vimeo-chat';

export interface VideoEmbed {
  provider: VideoProvider;
  /** URL for the iframe. */
  embedUrl: string;
  /** Link to the video on the provider's own site, as a fallback. */
  watchUrl: string;
}

export interface InteraksjonEmbed {
  provider: InteraksjonProvider;
  embedUrl: string;
  /** Opens the interaction in its own tab. Slido works better there with a screen reader. */
  openUrl: string;
}

const NUMERIC_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
// Slido event paths are an opaque token, sometimes followed by a page such as /live/polls.
const SLIDO_PATH = /^\/event\/[A-Za-z0-9_-]{4,64}(\/[A-Za-z0-9_\-/]*)?$/;

function parseUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function segments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}

function host(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

function vimeoVideo(id: string, hash?: string | null): VideoEmbed | null {
  if (!NUMERIC_ID.test(id)) return null;
  const h = hash && VIMEO_HASH.test(hash) ? hash : undefined;
  const params = new URLSearchParams();
  if (h) params.set('h', h);
  // dnt=1: Vimeo does not track the viewer or set cookies for analytics.
  params.set('dnt', '1');
  return {
    provider: 'vimeo',
    embedUrl: `https://player.vimeo.com/video/${id}?${params}`,
    watchUrl: h ? `https://vimeo.com/${id}/${h}` : `https://vimeo.com/${id}`,
  };
}

function vimeoEvent(id: string): VideoEmbed | null {
  if (!NUMERIC_ID.test(id)) return null;
  return {
    provider: 'vimeo-event',
    embedUrl: `https://vimeo.com/event/${id}/embed?dnt=1`,
    watchUrl: `https://vimeo.com/event/${id}`,
  };
}

function youtube(id: string | null | undefined): VideoEmbed | null {
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return {
    provider: 'youtube',
    // youtube-nocookie: no cookies until the viewer plays the video.
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

/** Vimeo video, Vimeo live event or YouTube. */
export function parseVideoUrl(value: unknown): VideoEmbed | null {
  const url = parseUrl(value);
  if (!url) return null;
  const h = host(url);
  const seg = segments(url);

  if (h === 'vimeo.com') {
    // vimeo.com/event/123, vimeo.com/event/123/embed
    if (seg[0] === 'event') return seg.length <= 3 && (seg[2] === undefined || seg[2] === 'embed') ? vimeoEvent(seg[1] ?? '') : null;
    // vimeo.com/123, vimeo.com/123/abcdef (unlisted)
    if (seg.length === 1 || seg.length === 2) return vimeoVideo(seg[0], seg[1] ?? url.searchParams.get('h'));
    return null;
  }
  if (h === 'player.vimeo.com') {
    if (seg[0] === 'video' && seg.length === 2) return vimeoVideo(seg[1], url.searchParams.get('h'));
    return null;
  }
  if (h === 'youtu.be') return seg.length === 1 ? youtube(seg[0]) : null;
  if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtube-nocookie.com') {
    if (seg[0] === 'watch' && seg.length === 1) return youtube(url.searchParams.get('v'));
    if (['embed', 'live', 'shorts'].includes(seg[0]) && seg.length === 2) return youtube(seg[1]);
    return null;
  }
  return null;
}

/** Slido or Vimeo chat. */
export function parseInteraksjonUrl(value: unknown): InteraksjonEmbed | null {
  const url = parseUrl(value);
  if (!url) return null;
  const h = host(url);
  const seg = segments(url);

  if (h === 'app.sli.do' || h === 'wall.sli.do') {
    if (!SLIDO_PATH.test(url.pathname)) return null;
    const embedUrl = `https://${h}${url.pathname}`;
    return { provider: 'slido', embedUrl, openUrl: embedUrl };
  }
  if (h === 'vimeo.com') {
    // vimeo.com/event/123/chat (live event) and vimeo.com/live-chat/123 (single video)
    if (seg[0] === 'event' && seg[2] === 'chat' && seg.length === 3 && NUMERIC_ID.test(seg[1])) {
      const embedUrl = `https://vimeo.com/event/${seg[1]}/chat/`;
      return { provider: 'vimeo-chat', embedUrl, openUrl: embedUrl };
    }
    if (seg[0] === 'live-chat' && seg.length === 2 && NUMERIC_ID.test(seg[1])) {
      const embedUrl = `https://vimeo.com/live-chat/${seg[1]}/`;
      return { provider: 'vimeo-chat', embedUrl, openUrl: embedUrl };
    }
  }
  return null;
}

export function providerNavn(provider: VideoProvider | InteraksjonProvider): string {
  switch (provider) {
    case 'vimeo':
    case 'vimeo-event':
    case 'vimeo-chat':
      return 'Vimeo';
    case 'youtube':
      return 'YouTube';
    case 'slido':
      return 'Slido';
  }
}
