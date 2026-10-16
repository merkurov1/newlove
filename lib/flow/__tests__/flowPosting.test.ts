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
import { fetchLinkPreview } from '@/lib/linkPreview';
import { publishToBluesky } from '@/lib/bluesky';

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

    it('extracts rich metadata from medium.com article links', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        url: 'https://merkurov.medium.com/russia-is-cutting-off-the-world-7b9e42be7031',
        text: async () => `
          <html>
            <head>
              <title>Medium</title>
              <meta property="og:title" content="Russia Is Cutting Off the World" />
              <meta property="og:description" content="The Kremlin's war on messengers marks a new phase of digital isolation" />
              <meta property="og:image" content="https://miro.medium.com/v2/resize:fit:1200/1*zEC4BgcdsCfxy26u7SPYUg.jpeg" />
              <meta property="og:site_name" content="Medium" />
            </head>
            <body>
              <article>
                <h1>Russia Is Cutting Off the World</h1>
              </article>
            </body>
          </html>
        `,
      });

      const result = await parseUrl('https://merkurov.medium.com/russia-is-cutting-off-the-world-7b9e42be7031');
      expect(result.isYouTube).toBe(false);
      expect(result.site_name).toBe('Medium');
      expect(result.title).toBe('Russia Is Cutting Off the World');
      expect(result.description).toContain('Kremlin');
      expect(result.image).toBe('https://miro.medium.com/v2/resize:fit:1200/1*zEC4BgcdsCfxy26u7SPYUg.jpeg');
      expect(result.favicon).toBe('https://medium.com/favicon.ico');

      global.fetch = originalFetch;
    });

    it('falls back to article h1 when Medium title is generic Medium', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <head>
              <title>Medium</title>
              <meta property="og:site_name" content="Medium" />
            </head>
            <body>
              <article>
                <h1>Exclusive Headline from Medium Article</h1>
                <p>Article body content...</p>
              </article>
            </body>
          </html>
        `,
      });

      const result = await parseUrl('https://medium.com/@merkurov/test-post-12345');
      expect(result.title).toBe('Exclusive Headline from Medium Article');
      expect(result.site_name).toBe('Medium');

      global.fetch = originalFetch;
    });

    it('retries with bot user-agent if initial fetch receives 403 on medium.com', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest
        .fn()
        // First attempt: blocked by 403
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
        })
        // Second attempt: social bot fallback succeeds
        .mockResolvedValueOnce({
          ok: true,
          text: async () => `
            <html>
              <head>
                <meta property="og:title" content="Recovered via Bot UA" />
                <meta property="og:description" content="Social bot allowed through WAF" />
                <meta property="og:image" content="https://miro.medium.com/v2/resize:fit:1200/bot-image.jpeg" />
                <meta property="og:site_name" content="Medium" />
              </head>
            </html>
          `,
        });

      const result = await parseUrl('https://medium.com/@merkurov/protected-post');
      expect(result.title).toBe('Recovered via Bot UA');
      expect(result.image).toBe('https://miro.medium.com/v2/resize:fit:1200/bot-image.jpeg');
      expect(global.fetch).toHaveBeenCalledTimes(2);

      global.fetch = originalFetch;
    });
  });

  describe('fetchLinkPreview', () => {
    it('returns preview data for Medium URLs', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <head>
              <meta property="og:title" content="Medium Link Preview Title" />
              <meta property="og:description" content="Link preview description" />
              <meta property="og:image" content="https://miro.medium.com/preview.jpg" />
            </head>
          </html>
        `,
      });

      const preview = await fetchLinkPreview('https://merkurov.medium.com/preview-test');
      expect(preview).not.toBeNull();
      expect(preview?.title).toBe('Medium Link Preview Title');
      expect(preview?.image).toBe('https://miro.medium.com/preview.jpg');

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

    it('preserves medium.com source_url when crossposting to Bluesky', async () => {
      const mediumUrl = 'https://merkurov.medium.com/russia-is-cutting-off-the-world-7b9e42be7031';
      const payload = {
        id: 'flow-medium-item-1',
        title: 'Russia Is Cutting Off the World',
        body_md: 'Short comment on the article.',
        source_url: mediumUrl,
        slug: 'russia-is-cutting-off-the-world',
        type: 'article',
        metadata: {
          link_preview: {
            url: mediumUrl,
            title: 'Russia Is Cutting Off the World',
            description: 'The Kremlin’s war on messengers',
            image: 'https://miro.medium.com/v2/resize:fit:1200/1*zEC4BgcdsCfxy26u7SPYUg.jpeg',
            site_name: 'Medium',
          },
        },
      };

      await crosspostFlowItem(payload);

      expect(publishToBluesky).toHaveBeenCalledWith(
        expect.objectContaining({
          source_url: mediumUrl,
          title: 'Russia Is Cutting Off the World',
        })
      );
    });
  });
});
