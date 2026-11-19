/** @jest-environment node */

import {
  extractYouTubeVideoId,
  getYouTubeCanonicalUrl,
  isYouTubeUrl,
  normalizeYouTubeUrl,
} from '../youtube';

const VIDEO_ID = 'A_lpmJ326U0';
const CANONICAL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

describe('YouTube URL normalization', () => {
  const variants = [
    `https://youtu.be/${VIDEO_ID}?si=CDQZFxpD_S2HqJYv`,
    `https://www.youtube.com/watch?v=${VIDEO_ID}&si=CDQZFxpD_S2HqJYv`,
    `https://youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
    `https://www.youtube.com/live/${VIDEO_ID}`,
    `https://www.youtube.com/v/${VIDEO_ID}`,
    `https://m.youtube.com/watch?v=${VIDEO_ID}`,
    `https://music.youtube.com/watch?v=${VIDEO_ID}`,
    `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
  ];

  it.each(variants)('resolves %s to the real video id', (url) => {
    expect(extractYouTubeVideoId(url)).toBe(VIDEO_ID);
    expect(isYouTubeUrl(url)).toBe(true);
    expect(getYouTubeCanonicalUrl(url)).toBe(CANONICAL);
    expect(normalizeYouTubeUrl(url)).toBe(CANONICAL);
  });

  it('never turns a missing id into a literal “undefined” URL', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=undefined',
      'https://www.youtube.com/undefined',
      'https://youtu.be/undefined',
      'https://www.youtube.com/shorts/null',
      'https://www.youtube.com/watch',
    ]) {
      expect(extractYouTubeVideoId(url)).toBeNull();
      expect(normalizeYouTubeUrl(url)).toBeNull();
    }
  });
});
