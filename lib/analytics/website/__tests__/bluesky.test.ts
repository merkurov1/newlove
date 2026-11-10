/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { normalizeBlueskyPost, postPermalink } from '../providers/bluesky';

describe('Bluesky analytics normalization', () => {
  it('extracts public engagement and site links from a feed item', () => {
    const post = normalizeBlueskyPost({
      post: {
        uri: 'at://did:plc:test/app.bsky.feed.post/abc123',
        cid: 'cid',
        indexedAt: '2026-11-10T10:00:00.000Z',
        likeCount: 12,
        repostCount: 3,
        replyCount: 2,
        quoteCount: 1,
        record: {
          text: 'Read more https://www.merkurov.love/journal/test',
          createdAt: '2026-11-10T09:00:00.000Z',
          facets: [
            {
              features: [
                {
                  $type: 'app.bsky.richtext.facet#link',
                  uri: 'https://www.merkurov.love/journal/test',
                },
              ],
            },
          ],
        },
      },
    });

    expect(post).toMatchObject({
      likes: 12,
      reposts: 3,
      replies: 2,
      quotes: 1,
      links: 1,
      siteLinks: 1,
    });
    expect(post?.url).toBe('https://www.merkurov.love/journal/test');
  });

  it('does not claim a site link for an unrelated outbound URL', () => {
    const post = normalizeBlueskyPost({
      post: {
        uri: 'at://did:plc:test/app.bsky.feed.post/abc124',
        record: {
          text: 'External read',
          facets: [
            {
              features: [
                {
                  $type: 'app.bsky.richtext.facet#link',
                  uri: 'https://example.com/story',
                },
              ],
            },
          ],
        },
      },
    });

    expect(post?.links).toBe(1);
    expect(post?.siteLinks).toBe(0);
    expect(post?.url).toBeNull();
  });

  it('builds a public permalink without inventing a post id', () => {
    expect(
      postPermalink('merkurov.love', 'at://did:plc:test/app.bsky.feed.post/abc123')
    ).toBe('https://bsky.app/profile/merkurov.love/post/abc123');
    expect(postPermalink(null, 'at://did:plc:test/app.bsky.feed.post/abc123')).toBeNull();
  });
});
