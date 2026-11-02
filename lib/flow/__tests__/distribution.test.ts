/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

import {
  crosspostFlowItem,
  readCrosspostState,
  selectChannels,
  type CrosspostChannelState,
  type CrosspostPayload,
} from '../crosspost';
import type { TelegramPublishResult } from '../telegram';

const NOW = new Date('2026-11-02T12:00:00.000Z');

function payload(overrides: Record<string, unknown> = {}): CrosspostPayload {
  return {
    id: 'item-1',
    slug: 'memory-notes',
    title: 'Память и сети',
    body_md: 'Короткий текст о памяти и сетях.',
    type: 'note',
    lang: 'ru',
    source_url: null,
    metadata: {},
    published_at: '2026-11-02T10:00:00.000Z',
    updated_at: '2026-11-02T11:00:00.000Z',
    ...overrides,
  } as CrosspostPayload;
}

function telegramSuccess(ids = [101]): TelegramPublishResult {
  return {
    ok: true,
    messageId: ids[0],
    messageIds: ids,
    chatId: '-1001',
    bot: 'pierrot',
    textPartsSent: 1,
    sentImageUrls: [],
    failedImages: 0,
  };
}

function channel(
  overrides: Partial<CrosspostChannelState> = {}
): CrosspostChannelState {
  return {
    status: 'published',
    externalId: '1',
    externalUri: 'at://did:plc:test/app.bsky.feed.post/1',
    messageIds: [1],
    chatId: '-1001',
    attempts: 1,
    lastError: null,
    uncertain: false,
    contentHash: 'hash',
    startedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    publishedAt: NOW.toISOString(),
    textPartsSent: 1,
    sentImageUrls: [],
    ...overrides,
  };
}

function itemWithChannels(
  channels: Record<string, CrosspostChannelState>
): CrosspostPayload {
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

describe('independent distribution channels', () => {
  it('publishes both channels independently', async () => {
    const publishTelegram = jest.fn(async () => telegramSuccess());
    const publishBluesky = jest.fn(async () => ({
      uri: 'at://did:plc:test/app.bsky.feed.post/2',
      cid: 'cid-2',
    }));

    const result = await crosspostFlowItem(payload(), {
      deps: {
        supabase: null,
        now: () => NOW,
        publishTelegram,
        publishBluesky,
      },
    });

    expect(result.attemptedChannels).toEqual(['telegram', 'bluesky']);
    expect(result.channels?.telegram?.status).toBe('published');
    expect(result.channels?.bluesky?.status).toBe('published');
    expect(result.telegram?.messageId).toBe(101);
    expect(result.bluesky?.cid).toBe('cid-2');
    expect(publishTelegram).toHaveBeenCalledTimes(1);
    expect(publishBluesky).toHaveBeenCalledTimes(1);
  });

  it('keeps Telegram published when Bluesky fails, then retries only Bluesky', async () => {
    const publishTelegram = jest.fn(async () => telegramSuccess());
    const failedBluesky = jest.fn(async () => null);

    const first = await crosspostFlowItem(payload(), {
      deps: {
        supabase: null,
        now: () => NOW,
        publishTelegram,
        publishBluesky: failedBluesky,
      },
    });

    expect(first.channels?.telegram?.status).toBe('published');
    expect(first.channels?.bluesky?.status).toBe('failed');

    const retryTelegram = jest.fn(async () => telegramSuccess());
    const retryBluesky = jest.fn(async () => ({
      uri: 'at://did:plc:test/app.bsky.feed.post/3',
      cid: 'cid-3',
    }));

    const retry = await crosspostFlowItem(
      itemWithChannels(first.channels as Record<string, CrosspostChannelState>),
      {
        retryFailed: true,
        deps: {
          supabase: null,
          now: () => NOW,
          publishTelegram: retryTelegram,
          publishBluesky: retryBluesky,
        },
      }
    );

    expect(retry.attemptedChannels).toEqual(['bluesky']);
    expect(retryTelegram).not.toHaveBeenCalled();
    expect(retryBluesky).toHaveBeenCalledTimes(1);
    expect(retry.channels?.telegram?.status).toBe('published');
    expect(retry.channels?.bluesky?.status).toBe('published');
  });

  it('does not repost channels that already succeeded', async () => {
    const publishTelegram = jest.fn(async () => telegramSuccess());
    const publishBluesky = jest.fn(async () => ({
      uri: 'at://did:plc:test/app.bsky.feed.post/4',
      cid: 'cid-4',
    }));

    const result = await crosspostFlowItem(
      itemWithChannels({
        telegram: channel(),
        bluesky: channel(),
      }),
      {
        deps: {
          supabase: null,
          now: () => NOW,
          publishTelegram,
          publishBluesky,
        },
      }
    );

    expect(result.attemptedChannels).toEqual([]);
    expect(publishTelegram).not.toHaveBeenCalled();
    expect(publishBluesky).not.toHaveBeenCalled();
  });

  it('marks timeout results as uncertain and skips them by default', () => {
    const state = readCrosspostState(
      itemWithChannels({
        telegram: channel({
          status: 'failed',
          uncertain: true,
          lastError: 'Telegram request timed out.',
        }),
        bluesky: channel(),
      })
    );

    expect(selectChannels(state, {}, NOW)).toEqual([]);
    expect(selectChannels(state, { retryFailed: true }, NOW)).toEqual([]);
    expect(
      selectChannels(state, { retryFailed: true, retryUncertain: true }, NOW)
    ).toEqual(['telegram']);
    expect(selectChannels(state, { force: true }, NOW)).toEqual([
      'telegram',
      'bluesky',
    ]);
  });

  it('persists independent channel statuses and mirrors distributions', async () => {
    const { client, updates, distributions } = fakeSupabase();

    const result = await crosspostFlowItem(payload(), {
      deps: {
        supabase: client,
        now: () => NOW,
        publishTelegram: async () => telegramSuccess([201, 202]),
        publishBluesky: async () => ({
          uri: 'at://did:plc:test/app.bsky.feed.post/5',
          cid: 'cid-5',
        }),
      },
    });

    expect(result.channels?.telegram?.status).toBe('published');
    expect(result.channels?.bluesky?.status).toBe('published');

    const last = updates.at(-1)!;
    const metadata = last.metadata;

    expect(metadata.crosspost.channels.telegram.status).toBe('published');
    expect(metadata.crosspost.channels.telegram.messageIds).toEqual([201, 202]);
    expect(metadata.crosspost.channels.bluesky.status).toBe('published');
    expect(metadata.bluesky_uri).toBe(
      'at://did:plc:test/app.bsky.feed.post/5'
    );
    expect(metadata.telegram_message_id).toBe(201);

    expect(distributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: 'telegram', status: 'posted' }),
        expect.objectContaining({ channel: 'bluesky', status: 'posted' }),
      ])
    );
  });
});
