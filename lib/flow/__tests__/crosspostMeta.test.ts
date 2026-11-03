/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { crosspostFlowItem, type CrosspostChannelState, type CrosspostPayload } from '../crosspost';
import type { MetaPublishResult } from '@/lib/meta/types';

const NOW = new Date('2026-11-03T12:00:00.000Z');
const originalFacebookCrosspostEnabled =
  process.env.META_FACEBOOK_CROSSPOST_ENABLED;
const originalThreadsCrosspostEnabled =
  process.env.META_THREADS_CROSSPOST_ENABLED;

beforeEach(() => {
  delete process.env.META_FACEBOOK_CROSSPOST_ENABLED;
  process.env.META_THREADS_CROSSPOST_ENABLED = 'true';
});

afterEach(() => {
  if (originalFacebookCrosspostEnabled === undefined) {
    delete process.env.META_FACEBOOK_CROSSPOST_ENABLED;
  } else {
    process.env.META_FACEBOOK_CROSSPOST_ENABLED =
      originalFacebookCrosspostEnabled;
  }

  if (originalThreadsCrosspostEnabled === undefined) {
    delete process.env.META_THREADS_CROSSPOST_ENABLED;
  } else {
    process.env.META_THREADS_CROSSPOST_ENABLED =
      originalThreadsCrosspostEnabled;
  }
});

function payload(overrides: Record<string, unknown> = {}): CrosspostPayload {
  return {
    id: 'item-meta-1',
    slug: 'meta-post',
    title: 'Meta post',
    body_md: 'A short Flow post for Meta channels.',
    type: 'note',
    lang: 'ru',
    source_url: null,
    metadata: {},
    published_at: '2026-11-03T10:00:00.000Z',
    updated_at: '2026-11-03T11:00:00.000Z',
    ...overrides,
  } as CrosspostPayload;
}

function publishedMeta(id: string, url: string | null): MetaPublishResult {
  return {
    ok: true,
    externalId: id,
    externalUri: url,
    phase: 'published',
  };
}

function failedMeta(error: string, uncertain = false): MetaPublishResult {
  return {
    ok: false,
    uncertain,
    externalId: null,
    externalUri: null,
    error,
    phase: null,
  };
}

function channel(overrides: Partial<CrosspostChannelState> = {}): CrosspostChannelState {
  return {
    status: 'published',
    externalId: '1',
    externalUri: 'https://example.com/1',
    messageIds: [],
    chatId: null,
    attempts: 1,
    lastError: null,
    uncertain: false,
    contentHash: 'hash',
    startedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    publishedAt: NOW.toISOString(),
    textPartsSent: 0,
    sentImageUrls: [],
    phase: 'published',
    ...overrides,
  };
}

function itemWithChannels(channels: Record<string, CrosspostChannelState>): CrosspostPayload {
  return payload({
    metadata: {
      crosspost: {
        channels,
        attempted_at: NOW.toISOString(),
      },
    },
  });
}

function fakeSupabase() {
  const updates: Record<string, any>[] = [];
  const distributions: Record<string, any>[] = [];

  const client = {
    from(table: string) {
      if (table === 'items') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          update: (value: Record<string, any>) => ({
            eq: async () => {
              updates.push(value);
              return { error: null };
            },
          }),
        };
      }

      if (table === 'distributions') {
        return {
          upsert: async (value: Record<string, any>) => {
            distributions.push(value);
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { client: client as any, updates, distributions };
}

describe('Facebook and Threads crossposting', () => {
  it('publishes Facebook by default while Threads remains disabled', async () => {
    delete process.env.META_THREADS_CROSSPOST_ENABLED;
    const publishFacebook = jest.fn(async () =>
      publishedMeta('fb-default', 'https://www.facebook.com/page-1/posts/default')
    );
    const publishThreads = jest.fn(async () =>
      publishedMeta('th-disabled', null)
    );

    const result = await crosspostFlowItem(payload(), {
      channels: ['facebook', 'threads'],
      deps: {
        supabase: null,
        now: () => NOW,
        publishFacebook,
        publishThreads,
      },
    });

    expect(result.attemptedChannels).toEqual(['facebook']);
    expect(publishFacebook).toHaveBeenCalledTimes(1);
    expect(publishThreads).not.toHaveBeenCalled();
    expect(result.channels?.facebook?.status).toBe('published');
    expect(result.channels?.threads).toBeUndefined();
  });

  it('publishes both Meta channels independently and stores their IDs', async () => {
    const publishFacebook = jest.fn(async () =>
      publishedMeta('fb-1', 'https://www.facebook.com/page-1/posts/1')
    );
    const publishThreads = jest.fn(async () =>
      publishedMeta('th-1', 'https://www.threads.net/@m/post/1')
    );

    const result = await crosspostFlowItem(payload(), {
      channels: ['facebook', 'threads'],
      deps: {
        supabase: null,
        now: () => NOW,
        publishFacebook,
        publishThreads,
      },
    });

    expect(result.attemptedChannels).toEqual(['facebook', 'threads']);
    expect(result.channels?.facebook?.status).toBe('published');
    expect(result.channels?.threads?.status).toBe('published');
    expect(result.channels?.facebook?.externalId).toBe('fb-1');
    expect(result.channels?.facebook?.externalUri).toBe('https://www.facebook.com/page-1/posts/1');
    expect(result.channels?.threads?.externalId).toBe('th-1');
    expect(result.channels?.threads?.externalUri).toBe('https://www.threads.net/@m/post/1');
    expect(result.facebook).toEqual({
      id: 'fb-1',
      url: 'https://www.facebook.com/page-1/posts/1',
    });
    expect(result.threads).toEqual({
      id: 'th-1',
      url: 'https://www.threads.net/@m/post/1',
    });
    expect(publishFacebook).toHaveBeenCalledTimes(1);
    expect(publishThreads).toHaveBeenCalledTimes(1);
  });

  it('keeps Threads published when Facebook fails', async () => {
    const result = await crosspostFlowItem(payload(), {
      channels: ['facebook', 'threads'],
      deps: {
        supabase: null,
        now: () => NOW,
        publishFacebook: async () => failedMeta('Facebook rejected the post.'),
        publishThreads: async () => publishedMeta('th-2', 'https://www.threads.net/@m/post/2'),
      },
    });

    expect(result.channels?.facebook?.status).toBe('failed');
    expect(result.channels?.facebook?.lastError).toBe('Facebook rejected the post.');
    expect(result.channels?.threads?.status).toBe('published');
    expect(result.facebook).toBeNull();
    expect(result.threads?.id).toBe('th-2');
  });

  it('retries only the failed Meta channel', async () => {
    const first = await crosspostFlowItem(payload(), {
      channels: ['facebook', 'threads'],
      deps: {
        supabase: null,
        now: () => NOW,
        publishFacebook: async () => failedMeta('Temporary Facebook error.'),
        publishThreads: async () => publishedMeta('th-3', 'https://www.threads.net/@m/post/3'),
      },
    });

    const retryFacebook = jest.fn(async () =>
      publishedMeta('fb-3', 'https://www.facebook.com/page-1/posts/3')
    );
    const retryThreads = jest.fn(async () => publishedMeta('th-should-not-run', null));

    const retry = await crosspostFlowItem(
      itemWithChannels(first.channels as Record<string, CrosspostChannelState>),
      {
        channels: ['facebook', 'threads'],
        retryFailed: true,
        deps: {
          supabase: null,
          now: () => NOW,
          publishFacebook: retryFacebook,
          publishThreads: retryThreads,
        },
      }
    );

    expect(retry.attemptedChannels).toEqual(['facebook']);
    expect(retryFacebook).toHaveBeenCalledTimes(1);
    expect(retryThreads).not.toHaveBeenCalled();
    expect(retry.channels?.threads?.status).toBe('published');
    expect(retry.channels?.threads?.externalId).toBe('th-3');
  });

  it('never reposts a Meta channel that is already published', async () => {
    const publishFacebook = jest.fn(async () => publishedMeta('fb-new', null));
    const publishThreads = jest.fn(async () => publishedMeta('th-new', null));

    const result = await crosspostFlowItem(
      itemWithChannels({
        facebook: channel({ externalId: 'fb-old' }),
        threads: channel({ externalId: 'th-old' }),
      }),
      {
        channels: ['facebook', 'threads'],
        deps: {
          supabase: null,
          now: () => NOW,
          publishFacebook,
          publishThreads,
        },
      }
    );

    expect(result.attemptedChannels).toEqual([]);
    expect(publishFacebook).not.toHaveBeenCalled();
    expect(publishThreads).not.toHaveBeenCalled();
  });

  it('keeps an uncertain Meta result and skips it until explicitly confirmed', async () => {
    const publishFacebook = jest.fn(async () => failedMeta('Facebook request timed out.', true));

    const first = await crosspostFlowItem(payload(), {
      channels: ['facebook'],
      deps: {
        supabase: null,
        now: () => NOW,
        publishFacebook,
      },
    });

    expect(first.channels?.facebook?.status).toBe('failed');
    expect(first.channels?.facebook?.uncertain).toBe(true);

    const automaticRetry = await crosspostFlowItem(
      itemWithChannels(first.channels as Record<string, CrosspostChannelState>),
      {
        channels: ['facebook'],
        deps: {
          supabase: null,
          now: () => NOW,
          publishFacebook,
        },
      }
    );

    expect(automaticRetry.attemptedChannels).toEqual([]);

    const confirmedRetry = await crosspostFlowItem(
      itemWithChannels(first.channels as Record<string, CrosspostChannelState>),
      {
        channels: ['facebook'],
        retryUncertain: true,
        deps: {
          supabase: null,
          now: () => NOW,
          publishFacebook: async () =>
            publishedMeta('fb-confirmed', 'https://www.facebook.com/page-1/posts/9'),
        },
      }
    );

    expect(confirmedRetry.attemptedChannels).toEqual(['facebook']);
    expect(confirmedRetry.channels?.facebook?.status).toBe('published');
    expect(confirmedRetry.channels?.facebook?.uncertain).toBe(false);
  });

  it('marks Meta channels as skipped when credentials are missing, without calling the APIs', async () => {
    const originalEnv = { ...process.env };
    const originalFetch = global.fetch;
    const fetchMock = jest.fn();

    delete process.env.META_FACEBOOK_PAGE_ID;
    delete process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN;
    delete process.env.META_THREADS_USER_ID;
    delete process.env.META_THREADS_ACCESS_TOKEN;
    global.fetch = fetchMock as unknown as typeof fetch;

    try {
      const result = await crosspostFlowItem(payload(), {
        channels: ['facebook', 'threads'],
        deps: { supabase: null, now: () => NOW },
      });

      expect(result.attemptedChannels).toEqual(['facebook', 'threads']);
      expect(result.channels?.facebook?.status).toBe('skipped');
      expect(result.channels?.threads?.status).toBe('skipped');
      expect(result.channels?.facebook?.lastError).toBe('Facebook Page is not configured.');
      expect(result.channels?.threads?.lastError).toBe('Threads is not configured.');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      process.env = { ...originalEnv };
      global.fetch = originalFetch;
    }
  });

  it('persists Meta state in metadata and mirrors both distributions', async () => {
    const { client, updates, distributions } = fakeSupabase();

    const result = await crosspostFlowItem(payload(), {
      channels: ['facebook', 'threads'],
      deps: {
        supabase: client,
        now: () => NOW,
        publishFacebook: async () =>
          publishedMeta('fb-5', 'https://www.facebook.com/page-1/posts/5'),
        publishThreads: async () => publishedMeta('th-5', 'https://www.threads.net/@m/post/5'),
      },
    });

    expect(result.channels?.facebook?.status).toBe('published');
    expect(result.channels?.threads?.status).toBe('published');

    const last = updates.at(-1)!;
    const metadata = last.metadata;

    expect(metadata.facebook_post_id).toBe('fb-5');
    expect(metadata.facebook_url).toBe('https://www.facebook.com/page-1/posts/5');
    expect(metadata.threads_post_id).toBe('th-5');
    expect(metadata.threads_url).toBe('https://www.threads.net/@m/post/5');
    expect(metadata.crosspost.channels.facebook.status).toBe('published');
    expect(metadata.crosspost.channels.facebook.externalId).toBe('fb-5');
    expect(metadata.crosspost.channels.threads.status).toBe('published');
    expect(metadata.crosspost.channels.threads.externalUri).toBe(
      'https://www.threads.net/@m/post/5'
    );

    expect(distributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'facebook',
          status: 'posted',
          external_id: 'https://www.facebook.com/page-1/posts/5',
        }),
        expect.objectContaining({
          channel: 'threads',
          status: 'posted',
          external_id: 'https://www.threads.net/@m/post/5',
        }),
      ])
    );
  });
});
