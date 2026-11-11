/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockLogin = jest.fn(async () => undefined);
const mockUploadBlob = jest.fn(async () => ({
  data: { blob: { $type: 'blob', ref: { $link: 'bafy-test' } } },
}));
const mockPost = jest.fn(async () => ({
  uri: 'at://did:plc:test/app.bsky.feed.post/1',
  cid: 'cid-1',
}));

jest.mock('@atproto/api', () => ({
  RichText: jest.requireActual('@atproto/api').RichText,
  BskyAgent: jest.fn(),
}));

jest.mock('@/lib/flow/ai', () => ({
  generateFlowAIText: jest.fn(async () => {
    throw new Error('AI provider unavailable');
  }),
}));

type PublishModule = typeof import('@/lib/bluesky');

let publishToBluesky: PublishModule['publishToBluesky'];
let publishBlueskyPresentation: PublishModule['publishBlueskyPresentation'];
let BskyAgent: jest.Mock;

beforeEach(async () => {
  jest.resetModules();
  process.env.BLUESKY_IDENTIFIER = 'test.bsky.social';
  process.env.BLUESKY_PASSWORD = 'test-password';
  ({ BskyAgent } = require('@atproto/api') as { BskyAgent: jest.Mock });
  BskyAgent.mockImplementation(() => ({
    hasSession: true,
    login: mockLogin,
    uploadBlob: mockUploadBlob,
    post: mockPost,
  }));

  mockLogin.mockClear();
  mockUploadBlob.mockClear();
  mockPost.mockClear();

  ({ publishToBluesky, publishBlueskyPresentation } = await import('@/lib/bluesky'));
});

describe('Bluesky publication safety', () => {
  it('14. records a failed image upload and publishes the external-card fallback', async () => {
    // The image URL is valid, but the response is not an image. This reaches the
    // upload failure path without touching the network or sharp.
    global.fetch = jest.fn(
      async () =>
        new Response('not an image', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
    ) as unknown as typeof fetch;

    const result = await publishToBluesky({
      id: 'item-1',
      slug: 'memory-notes',
      title: 'Акварель',
      body_md: 'Фрагмент серии о памяти.',
      type: 'photo',
      lang: 'ru',
      metadata: {
        images: [
          {
            url: 'https://cdn.example.com/artwork.jpg',
            alt: 'Акварельный фрагмент с синей линией.',
          },
        ],
      },
    });

    expect(result).toMatchObject({
      uri: 'at://did:plc:test/app.bsky.feed.post/1',
    });
    expect('warnings' in result ? result.warnings : []).toEqual([
      expect.stringContaining('Native image upload failed'),
    ]);
    expect(mockUploadBlob).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(1);

    const record = mockPost.mock.calls[0][0] as any;
    expect(record.embed.$type).toBe('app.bsky.embed.external');
    expect(record.embed.external.uri).toBe('https://www.merkurov.love/flow/memory-notes');
    expect(record.embed.external.thumb).toBeUndefined();
    expect(record.text).toContain('Фрагмент серии о памяти.');
  });

  it('15. publishes a deterministic local summary when the AI provider fails', async () => {
    global.fetch = jest.fn(
      async () =>
        new Response('not an image', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
    ) as unknown as typeof fetch;

    const result = await publishToBluesky({
      id: 'item-article',
      slug: 'argument',
      title: 'Городской аргумент',
      body_md: [
        'Городская память перестаёт быть архивом и становится протоколом.',
        'Инфраструктура определяет, какие истории вообще могут быть услышаны.',
        'Третье предложение добавляет детали о скорости и доступе.',
        'Четвёртое предложение описывает последствия для публичной речи.',
      ].join(' '),
      type: 'article',
      lang: 'ru',
      metadata: {},
    });

    expect(result).toMatchObject({
      uri: 'at://did:plc:test/app.bsky.feed.post/1',
      presentation: expect.objectContaining({
        presentationMode: 'article',
        usedSummary: false,
      }),
    });

    const record = mockPost.mock.calls[0][0] as any;
    expect(record.text).toContain('Городская память');
    expect(record.text).not.toContain('undefined');
  });

  it('refuses to post when the complete presentation is invalid', async () => {
    const presentationModule = await import('@/lib/flow/blueskyPresentation');
    const contentModule = await import('@/lib/flow/content');
    const valid = presentationModule.buildBlueskyPresentation({
      content: contentModule.normalizeFlowItem({
        id: 'item-1',
        slug: 'memory-notes',
        title: 'Заметка',
        body_md: 'Короткая заметка.',
        type: 'note',
        lang: 'ru',
        metadata: {},
      }),
    });

    const agent = new BskyAgent('https://bsky.social');
    const result = await publishBlueskyPresentation(
      {
        ...valid,
        postBody: 'Дубликат',
        postText: `Дубликат\n\n${valid.flowUrl}`,
        cardTitle: 'Дубликат',
      },
      { agent }
    );

    expect(result).toMatchObject({
      error: expect.stringContaining('presentation validation failed'),
    });
    expect(mockUploadBlob).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('20. does not republish an already published Bluesky item', async () => {
    const { crosspostFlowItem } = await import('@/lib/flow/crosspost');
    const publishBluesky = jest.fn(async () => ({
      uri: 'at://did:plc:test/app.bsky.feed.post/existing',
      cid: 'cid-existing',
    }));
    const now = new Date('2026-11-10T12:00:00.000Z');

    const result = await crosspostFlowItem(
      {
        id: 'item-published',
        slug: 'memory-notes',
        title: 'Уже опубликовано',
        body_md: 'Эта запись уже есть в Bluesky.',
        type: 'note',
        lang: 'ru',
        source_url: null,
        metadata: {
          crosspost: {
            channels: {
              bluesky: {
                status: 'published',
                externalId: 'cid-existing',
                externalUri: 'at://did:plc:test/app.bsky.feed.post/existing',
                messageIds: [],
                chatId: null,
                attempts: 1,
                lastError: null,
                uncertain: false,
                contentHash: 'hash',
                startedAt: now.toISOString(),
                updatedAt: now.toISOString(),
                publishedAt: now.toISOString(),
                textPartsSent: 0,
                sentImageUrls: [],
                phase: 'published',
              },
            },
            attempted_at: now.toISOString(),
          },
        },
        published_at: '2026-11-10T10:00:00.000Z',
        updated_at: '2026-11-10T11:00:00.000Z',
      } as any,
      {
        channels: ['bluesky'],
        deps: {
          supabase: null,
          now: () => now,
          publishBluesky,
        },
      }
    );

    expect(result.attemptedChannels).toEqual([]);
    expect(publishBluesky).not.toHaveBeenCalled();
  });
});
