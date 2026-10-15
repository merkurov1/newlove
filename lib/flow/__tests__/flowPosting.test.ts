jest.mock('@/lib/bluesky', () => ({
  publishToBluesky: jest.fn().mockResolvedValue({
    uri: 'at://did:plc:mock/app.bsky.feed.post/mock',
    cid: 'bafyreimock',
  }),
  deleteFromBluesky: jest.fn().mockResolvedValue(true),
}));

import {
  isYouTubeVideo,
  getYouTubeVideoId,
  getYouTubeCanonicalUrl,
  getYouTubeEmbedUrl,
  isProbablyImageUrl,
} from '@/components/flow/new-post/utils';
import { parseUrl } from '../parseUrl';
import { crosspostFlowItem } from '../crosspost';

describe('Flow Post Multi-Media Utilities', () => {
  describe('YouTube URL recognition and extraction', () => {
    it('recognizes standard YouTube video URLs', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(isYouTubeVideo(url)).toBe(true);
      expect(getYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
      expect(getYouTubeCanonicalUrl(url)).toBe(url);
      expect(getYouTubeEmbedUrl(url)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('recognizes youtu.be short URLs', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ';
      expect(isYouTubeVideo(url)).toBe(true);
      expect(getYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
      expect(getYouTubeCanonicalUrl(url)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('recognizes YouTube Shorts URLs', () => {
      const url = 'https://youtube.com/shorts/dQw4w9WgXcQ';
      expect(isYouTubeVideo(url)).toBe(true);
      expect(getYouTubeVideoId(url)).toBe('dQw4w9WgXcQ');
    });

    it('returns false for non-YouTube URLs', () => {
      expect(isYouTubeVideo('https://example.com/watch?v=123')).toBe(false);
      expect(isYouTubeVideo('https://twitter.com/user/status/123')).toBe(false);
    });
  });

  describe('Image URL recognition', () => {
    it('detects common image file extensions', () => {
      expect(isProbablyImageUrl('https://example.com/photo.jpg')).toBe(true);
      expect(isProbablyImageUrl('https://example.com/art.png?v=2')).toBe(true);
      expect(isProbablyImageUrl('https://example.com/asset.webp')).toBe(true);
      expect(isProbablyImageUrl('https://example.com/page.html')).toBe(false);
    });
  });

  describe('parseUrl', () => {
    it('resolves YouTube URLs accurately', async () => {
      const result = await parseUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.isYouTube).toBe(true);
      expect(result.videoId).toBe('dQw4w9WgXcQ');
      expect(result.domain).toBe('youtube.com');
      expect(result.embedUrl).toContain('dQw4w9WgXcQ');
      expect(result.youtube?.video_id).toBe('dQw4w9WgXcQ');
    });

    it('handles generic web links gracefully', async () => {
      // Mock global fetch for testing generic link parsing
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <head>
              <title>Test Page Title</title>
              <meta property="og:description" content="This is a test description" />
              <meta property="og:image" content="https://example.com/test-og.png" />
              <meta property="og:site_name" content="ExampleSite" />
            </head>
            <body>Content</body>
          </html>
        `,
      });

      const result = await parseUrl('https://example.com/article');
      expect(result.isYouTube).toBe(false);
      expect(result.title).toBe('Test Page Title');
      expect(result.description).toBe('This is a test description');
      expect(result.image).toBe('https://example.com/test-og.png');
      expect(result.site_name).toBe('ExampleSite');

      global.fetch = originalFetch;
    });
  });

  describe('Crossposting Engine (Pierrot / Osiris / Bluesky)', () => {
    it('executes without crashing and supports multi-channel payload', async () => {
      // Test payload containing all four elements: text, link, image, and youtube
      const payload = {
        id: 'test-item-123',
        title: 'Rich Flow Post with Everything',
        body_md: 'This is the body containing rich text thoughts and insights.',
        source_url: 'https://example.com/source',
        slug: 'rich-flow-post-test',
        imageUrl: 'https://example.com/image.png',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        metadata: {
          youtube: { video_id: 'dQw4w9WgXcQ' },
          image: 'https://example.com/image.png',
          link_preview: { url: 'https://example.com/source', title: 'Example Source' },
        },
      };

      const result = await crosspostFlowItem(payload);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });
});
