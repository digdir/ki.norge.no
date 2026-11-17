import { describe, expect, test } from 'vitest';
import { vimeoEmbedUrl, vimeoInteraksjonUrl } from './video-embed';

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
