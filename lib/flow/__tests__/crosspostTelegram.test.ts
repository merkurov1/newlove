/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/bluesky', () => ({
  publishToBluesky: jest.fn(async () => ({
    uri: 'at://did:plc:test/app.bsky.feed.post/1',
    cid: 'bafytest',
  })),
}));

import { crosspostFlowItem } from '../crosspost';

const FLOW_URL = 'https://www.merkurov.love/flow/test-slug';
const SOURCE_URL = 'https://example.com/source-article';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function telegramResponse(messageId = 10): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      result: { message_id: messageId, chat: { id: -1001 } },
    }),
  } as unknown as Response;
}

function flowLink(lang: 'ru' | 'en' = 'ru'): string {
  return `<a href="${FLOW_URL}">${lang === 'en' ? 'Read on Flow' : 'Читать в Flow'}</a>`;
}

function sourceLink(lang: 'ru' | 'en' = 'ru'): string {
  return `<a href="${SOURCE_URL}">${lang === 'en' ? 'Source' : 'Источник'}</a>`;
}

function postPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flow-item-1',
    title: 'A Flow post',
    body_md: 'Body text with **formatting** and a #hashtag.',
    source_url: SOURCE_URL,
    slug: 'test-slug',
    lang: 'ru',
    type: 'note',
    metadata: {},
    ...overrides,
  };
}

function telegramCalls(kind: 'sendPhoto' | 'sendMessage' | 'sendVideo' | 'sendMediaGroup') {
  return (global.fetch as jest.Mock).mock.calls
    .filter(([url]) => String(url).includes(`/${kind}`))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.PIERROT_BOT_TOKEN = 'test-bot-token';
  process.env.TELEGRAM_CHANNEL_ID = '@test-channel';
  delete process.env.OSIRIS_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.OSIRIS_CHANNEL_ID;
  delete process.env.PIERROT_CHANNEL_ID;
  delete process.env.DEEPSEEK_API_KEY;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

describe('Telegram crosspost composition and links', () => {
  it('publishes a text note without AI rewriting and with one Flow and one source link', async () => {
    const requests: string[] = [];
    global.fetch = jest.fn(async (url) => {
      requests.push(String(url));
      if (String(url).includes('/sendMessage')) return telegramResponse(12);
      throw new Error(`Unexpected fetch: ${String(url)}`);
    }) as never;

    const result = await crosspostFlowItem(
      postPayload({ body_md: 'Text post body.', imageUrl: null, metadata: {} })
    );

    expect(result.telegram?.messageId).toBe(12);
    expect(requests.some((url) => url.includes('api.deepseek.com'))).toBe(false);

    const calls = telegramCalls('sendMessage');
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain('<b>A Flow post</b>');
    expect(calls[0].text).toContain('Text post body.');
    expect(calls[0].text).toContain(sourceLink());
    expect(calls[0].text).toContain(flowLink());
    expect(calls[0].text).not.toContain('&gt;&gt;&gt;');
    expect(calls[0].text.match(new RegExp(FLOW_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')))
      .toHaveLength(1);
    expect(calls[0].link_preview_options).toEqual({ is_disabled: true });
  });

  it('keeps hashtags the author explicitly wrote', async () => {
    global.fetch = jest.fn(async () => telegramResponse(13)) as never;

    await crosspostFlowItem(
      postPayload({ body_md: 'Текст #hashtag', imageUrl: null, metadata: {} })
    );

    const calls = telegramCalls('sendMessage');
    expect(calls[0].text).toContain('#hashtag');
  });

  it('links a source-derived title and does not add a second source label', async () => {
    global.fetch = jest.fn(async () => telegramResponse(14)) as never;

    await crosspostFlowItem({
      id: 'flow-link-1',
      body_md: 'Авторский комментарий.',
      source_url: SOURCE_URL,
      slug: 'test-slug',
      lang: 'en',
      type: 'link',
      metadata: {
        link_preview: {
          url: SOURCE_URL,
          title: 'A Source Article',
          site_name: 'Example',
        },
      },
    });

    const calls = telegramCalls('sendMessage');
    expect(calls[0].text).toContain(
      `<b><a href="${SOURCE_URL}">A Source Article</a></b>`
    );
    expect(calls[0].text).toContain('Read on Flow');
    expect(calls[0].text).not.toContain('>Source</a>');
  });

  it('allows one source preview for an external link post', async () => {
    global.fetch = jest.fn(async () => telegramResponse(15)) as never;

    await crosspostFlowItem({
      id: 'flow-link-2',
      title: 'External source',
      body_md: 'Commentary.',
      source_url: SOURCE_URL,
      slug: 'test-slug',
      lang: 'en',
      type: 'link',
      metadata: {},
    });

    const calls = telegramCalls('sendMessage');
    expect(calls[0].link_preview_options).toEqual({
      url: SOURCE_URL,
      prefer_large_media: true,
    });
  });

  it('uses the canonical Flow link in a photo caption and keeps the photo first', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('/sendPhoto')) return telegramResponse(11);
      if (String(url).includes('/sendMessage')) return telegramResponse(16);
      throw new Error(`Unexpected fetch: ${String(url)}`);
    }) as never;

    const result = await crosspostFlowItem(
      postPayload({
        type: 'photo',
        body_md: 'Photo post body.',
        imageUrl: 'https://example.com/image.jpg',
        metadata: { image: 'https://example.com/image.jpg' },
      })
    );

    expect(result.telegram?.messageId).toBe(11);
    const photos = telegramCalls('sendPhoto');
    const messages = telegramCalls('sendMessage');
    expect(photos).toHaveLength(1);
    expect(messages).toHaveLength(0);
    expect(photos[0].caption).toContain('Photo post body.');
    expect(photos[0].caption).toContain(flowLink());
    expect(photos[0].caption).toContain(sourceLink());
    expect(photos[0].show_caption_above_media).toBe(true);
    expect(photos[0].photo).toBe('https://example.com/image.jpg');
  });

  it('preserves the exact Flow URL passed by the item slug', async () => {
    global.fetch = jest.fn(async () => telegramResponse(17)) as never;

    await crosspostFlowItem(
      postPayload({
        slug: 'exact-slug',
        body_md: 'Body.',
        imageUrl: null,
        metadata: {},
      })
    );

    const calls = telegramCalls('sendMessage');
    expect(calls[0].text).toContain(
      '<a href="https://www.merkurov.love/flow/exact-slug">Читать в Flow</a>'
    );
  });
});
