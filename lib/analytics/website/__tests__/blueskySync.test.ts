/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@atproto/api', () => ({
  BskyAgent: jest.fn(),
}));

const { BskyAgent } = require('@atproto/api') as {
  BskyAgent: jest.Mock;
};
const { fetchBlueskyAnalytics } = require('../providers/bluesky') as typeof import('../providers/bluesky');

const ownerDid = 'did:plc:owner';

function item(input: {
  uri: string;
  did?: string;
  likes?: number;
  kind?: 'post' | 'reply' | 'repost';
}) {
  return {
    ...(input.kind === 'repost'
      ? { reason: { $type: 'app.bsky.feed.defs#reasonRepost' } }
      : {}),
    post: {
      uri: input.uri,
      cid: 'cid',
      author: { did: input.did ?? ownerDid },
      likeCount: input.likes ?? 0,
      repostCount: 0,
      replyCount: 0,
      quoteCount: 0,
      record: {
        text: 'Text',
        createdAt: '2026-11-09T10:00:00.000Z',
        ...(input.kind === 'reply' ? { reply: { parent: { uri: 'at://parent' } } } : {}),
      },
    },
  };
}

describe('Bluesky feed sync', () => {
  const login = jest.fn(async () => undefined);
  const getProfile = jest.fn(async () => ({
    data: {
      did: ownerDid,
      handle: 'owner.bsky.social',
      displayName: 'Owner',
      followersCount: 42,
      followsCount: 10,
      postsCount: 100,
    },
  }));
  const getAuthorFeed = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    BskyAgent.mockImplementation(() => ({ login, getProfile, getAuthorFeed }));

    getAuthorFeed
      .mockResolvedValueOnce({
        data: {
          cursor: 'page-2',
          feed: [
            item({ uri: 'at://foreign', did: 'did:plc:other', likes: 999 }),
            item({ uri: 'at://known-a', likes: 12, kind: 'post' }),
            item({ uri: 'at://new-b', likes: 3, kind: 'post' }),
            item({ uri: 'at://reply', likes: 4, kind: 'reply' }),
            item({ uri: 'at://repost', likes: 5, kind: 'repost' }),
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          cursor: 'page-3',
          feed: [item({ uri: 'at://known-c', likes: 7, kind: 'post' })],
        },
      });
  });

  it('refreshes known counters, stops on an all-known page and excludes foreign reposts', async () => {
    const result = await fetchBlueskyAnalytics({
      identifier: 'owner.bsky.social',
      password: 'app-password',
      knownPostUris: ['at://known-a', 'at://known-c'],
      maxPages: 10,
    });

    expect(result.pages).toBe(2);
    expect(result.posts.map((post) => post.uri)).toEqual([
      'at://known-a',
      'at://new-b',
      'at://reply',
      'at://repost',
      'at://known-c',
    ]);
    expect(result.posts.find((post) => post.uri === 'at://known-a')?.likes).toBe(12);
    expect(result.posts.find((post) => post.uri === 'at://reply')?.kind).toBe('reply');
    expect(result.posts.find((post) => post.uri === 'at://repost')?.kind).toBe('repost');
    expect(result.posts.some((post) => post.uri === 'at://foreign')).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('keeps normal sync to the latest page and marks a still-open cursor as partial', async () => {
    const result = await fetchBlueskyAnalytics({
      identifier: 'owner.bsky.social',
      password: 'app-password',
      knownPostUris: [],
      maxPages: 1,
    });

    expect(result.pages).toBe(1);
    expect(result.posts).toHaveLength(4);
    expect(result.truncated).toBe(true);
    expect(result.cursor).toBe('page-2');
  });
});
