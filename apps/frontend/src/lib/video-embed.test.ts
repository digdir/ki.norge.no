import { describe, expect, test } from 'vitest';
import { parseInteraksjonUrl, parseVideoUrl } from './video-embed';

describe('parseVideoUrl', () => {
  test('Vimeo video', () => {
    expect(parseVideoUrl('https://vimeo.com/123456789')).toEqual({
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/123456789?dnt=1',
      watchUrl: 'https://vimeo.com/123456789',
    });
  });
  test('unlisted Vimeo video keeps the hash', () => {
    expect(parseVideoUrl('https://vimeo.com/123456789/abc123def0')?.embedUrl)
      .toBe('https://player.vimeo.com/video/123456789?h=abc123def0&dnt=1');
    expect(parseVideoUrl('https://player.vimeo.com/video/123456789?h=abc123def0')?.watchUrl)
      .toBe('https://vimeo.com/123456789/abc123def0');
  });
  test('Vimeo live event', () => {
    expect(parseVideoUrl('https://vimeo.com/event/4567890')).toEqual({
      provider: 'vimeo-event',
      embedUrl: 'https://vimeo.com/event/4567890/embed?dnt=1',
      watchUrl: 'https://vimeo.com/event/4567890',
    });
    expect(parseVideoUrl('https://vimeo.com/event/4567890/embed')?.provider).toBe('vimeo-event');
  });
  test('YouTube variants become youtube-nocookie', () => {
    const embed = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(parseVideoUrl(url)?.embedUrl, url).toBe(embed);
    }
  });
  test('rejects everything else', () => {
    for (const url of [
      undefined,
      '',
      'not a url',
      'http://vimeo.com/123456789',
      'https://vimeo.com.evil.example/123456789',
      'https://evil.example/vimeo.com/123456789',
      'https://vimeo.com/channels/staffpicks/123',
      'https://vimeo.com/abc',
      'https://youtu.be/short',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>',
      'javascript:alert(1)',
      '<iframe src="https://player.vimeo.com/video/1"></iframe>',
    ]) {
      expect(parseVideoUrl(url), String(url)).toBeNull();
    }
  });
});

describe('parseInteraksjonUrl', () => {
  test('Slido', () => {
    expect(parseInteraksjonUrl('https://app.sli.do/event/aB3dE5fG7hJ9kL1mN2pQ4r')).toEqual({
      provider: 'slido',
      embedUrl: 'https://app.sli.do/event/aB3dE5fG7hJ9kL1mN2pQ4r',
      openUrl: 'https://app.sli.do/event/aB3dE5fG7hJ9kL1mN2pQ4r',
    });
    expect(parseInteraksjonUrl('https://app.sli.do/event/abc123/live/questions?x=1')?.embedUrl)
      .toBe('https://app.sli.do/event/abc123/live/questions');
  });
  test('Vimeo chat', () => {
    expect(parseInteraksjonUrl('https://vimeo.com/event/4567890/chat')?.embedUrl).toBe('https://vimeo.com/event/4567890/chat/');
    expect(parseInteraksjonUrl('https://vimeo.com/live-chat/123456789/')?.embedUrl).toBe('https://vimeo.com/live-chat/123456789/');
  });
  test('rejects everything else', () => {
    for (const url of [
      undefined,
      'https://sli.do.evil.example/event/abc123',
      'https://app.sli.do/admin',
      'https://app.sli.do/event/a"b',
      'https://vimeo.com/event/4567890',
      'http://app.sli.do/event/abc123',
    ]) {
      expect(parseInteraksjonUrl(url), String(url)).toBeNull();
    }
  });
});
