import { describe, expect, test } from 'vitest';
import { videoEmbedUrl, vimeoEmbedUrl, vimeoInteraksjonUrl, interaksjonEmbedUrl, slidoEmbedUrl, youtubeEmbedUrl } from './video-embed';

describe('youtubeEmbedUrl', () => {
  const embed = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
  test('the common link shapes', () => {
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share')).toBe(embed);
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe(embed);
    expect(youtubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe(embed);
    expect(youtubeEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(embed);
  });
  test('keeps the start time', () => {
    expect(youtubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(`${embed}?start=90`);
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toBe(`${embed}?start=90`);
  });
  test('rejects other hosts, bad ids and playlists', () => {
    expect(youtubeEmbedUrl('https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).toBeUndefined();
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=kort')).toBeUndefined();
    expect(youtubeEmbedUrl('https://www.youtube.com/playlist?list=PL123')).toBeUndefined();
    expect(youtubeEmbedUrl('http://youtu.be/dQw4w9WgXcQ')).toBeUndefined();
  });
});

describe('videoEmbedUrl', () => {
  test('picks Vimeo or YouTube', () => {
    expect(videoEmbedUrl('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871');
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('https://example.com/video.mp4')).toBeUndefined();
  });
});

describe('vimeoEmbedUrl', () => {
  test('live event, with and without /embed', () => {
    expect(vimeoEmbedUrl('https://vimeo.com/event/3862320/embed')).toBe('https://vimeo.com/event/3862320/embed');
    expect(vimeoEmbedUrl(' https://vimeo.com/event/3862320 ')).toBe('https://vimeo.com/event/3862320/embed');
  });
  test('recording', () => {
    expect(vimeoEmbedUrl('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871');
    expect(vimeoEmbedUrl('https://player.vimeo.com/video/76979871')).toBe('https://player.vimeo.com/video/76979871');
  });
  test('unlisted recording keeps the hash', () => {
    expect(vimeoEmbedUrl('https://vimeo.com/76979871/abc123')).toBe('https://player.vimeo.com/video/76979871?h=abc123');
    expect(vimeoEmbedUrl('https://player.vimeo.com/video/76979871?h=abc123')).toBe('https://player.vimeo.com/video/76979871?h=abc123');
  });
  test('rejects other hosts, http and junk', () => {
    expect(vimeoEmbedUrl(undefined)).toBeUndefined();
    expect(vimeoEmbedUrl('')).toBeUndefined();
    expect(vimeoEmbedUrl('ikke en url')).toBeUndefined();
    expect(vimeoEmbedUrl('http://vimeo.com/event/1/embed')).toBeUndefined();
    expect(vimeoEmbedUrl('https://evil.example/event/1/embed')).toBeUndefined();
    expect(vimeoEmbedUrl('https://vimeo.com.evil.example/1')).toBeUndefined();
    expect(vimeoEmbedUrl('javascript:alert(1)')).toBeUndefined();
    expect(vimeoEmbedUrl('https://vimeo.com/channels/staffpicks')).toBeUndefined();
  });
});

describe('vimeoInteraksjonUrl', () => {
  test('interaction tools URL', () => {
    expect(vimeoInteraksjonUrl('https://vimeo.com/live/interaction_tools/live_event/3862320'))
      .toBe('https://vimeo.com/live/interaction_tools/live_event/3862320');
  });
  test('rejects anything else', () => {
    expect(vimeoInteraksjonUrl('https://vimeo.com/event/3862320/embed')).toBeUndefined();
    expect(vimeoInteraksjonUrl('https://evil.example/live/interaction_tools/live_event/1')).toBeUndefined();
  });
});

describe('Slido interactions', () => {
  test('normalizes the shared event URL and accepts the live panel URL', () => {
    const embed = 'https://app.sli.do/event/event-123/live/questions';
    expect(slidoEmbedUrl('https://app.sli.do/event/event-123')).toBe(embed);
    expect(slidoEmbedUrl('https://app.sli.do/event/event-123/live/polls?section=questions')).toBe(embed);
    expect(interaksjonEmbedUrl('https://app.sli.do/event/event-123')).toBe(embed);
  });

  test('rejects other hosts and paths', () => {
    expect(slidoEmbedUrl('https://sli.do/event/event-123')).toBeUndefined();
    expect(slidoEmbedUrl('https://app.sli.do/other/event-123')).toBeUndefined();
    expect(slidoEmbedUrl('http://app.sli.do/event/event-123')).toBeUndefined();
  });
});
