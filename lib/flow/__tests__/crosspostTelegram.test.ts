/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/bluesky', () => ({
  publishToBluesky: jest.fn(async () => ({
    uri: 'at://did:plc:test/app.bsky.feed.post/1',
    cid: 'bafytest',
  })),
}));

import {
  crosspostFlowItem,
  FLOW_LINK_LABEL,
  formatTelegramMessage,
} from '../crosspost';

const FLOW_URL = 'https://www.merkurov.love/flow/test-slug';
const SOURCE_URL = 'https://example.com/source-article';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function deepSeekResponse(content: string | null): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: content === null ? [] : [{ message: { content } }],
    }),
  } as unknown as Response;
}

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

function flowLink(): string {
  return `<a href="${FLOW_URL}">${FLOW_LINK_LABEL}</a>`;
}

function sourceLink(): string {
  return `<a href="${SOURCE_URL}">Источник</a>`;
}

function postPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'flow-item-1',
    title: 'A Flow post',
    body_md: 'Body text with **formatting** and a #hashtag.',
    source_url: SOURCE_URL,
    slug: 'test-slug',
    lang: 'ru',
    metadata: {},
    ...overrides,
  };
}

function telegramCalls(kind: 'sendPhoto' | 'sendMessage') {
  return (global.fetch as jest.Mock).mock.calls
    .filter(([url]) => String(url).includes(`/${kind}`))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
  process.env.PIERROT_BOT_TOKEN = 'test-bot-token';
  process.env.TELEGRAM_CHANNEL_ID = '@test-channel';
  delete process.env.OSIRIS_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.OSIRIS_CHANNEL_ID;
  delete process.env.PIERROT_CHANNEL_ID;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

describe('Telegram Flow link formatting', () => {
  it('replaces a DeepSeek-rewritten Flow link with the canonical >>> label', async () => {
    global.fetch = jest.fn(async () =>
      deepSeekResponse(
        `<b>Adapted title</b>\n\nBody with a #hashtag.\n\n` +
          `<a href="https://merkurov.love/flow/test-slug/">Read on merkurov.love</a>\n\n${sourceLink()}`
      )
    ) as never;

    const text = await formatTelegramMessage(
      'A Flow post',
      'Body text with #hashtag.',
      FLOW_URL,
      'ru',
      SOURCE_URL
    );

    expect(text).toContain(flowLink());
    expect(text).not.toContain('Read on merkurov.love');
    expect(text).not.toContain('#hashtag');
    expect(text).toContain(sourceLink());
    expect(text.match(new RegExp(FLOW_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
    expect(text).toContain('<b>Adapted title</b>');
  });

  it('restores a DeepSeek-removed Flow link and keeps the source link', async () => {
    global.fetch = jest.fn(async () =>
      deepSeekResponse(`Adapted body only.`)
    ) as never;

    const text = await formatTelegramMessage(
      'A Flow post',
      'Body text.',
      FLOW_URL,
      'ru',
      SOURCE_URL
    );

    expect(text).toContain(flowLink());
    expect(text).toContain(sourceLink());
    expect(text.indexOf(sourceLink())).toBeLessThan(text.indexOf(flowLink()));
  });

  it('falls back on a DeepSeek timeout with the same canonical link', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('The operation was aborted due to timeout');
    }) as never;

    const text = await formatTelegramMessage(
      'A Flow post',
      'Body text.',
      FLOW_URL,
      'ru',
      SOURCE_URL
    );

    expect(text).toContain(flowLink());
    expect(text).toContain(sourceLink());
  });

  it('falls back on a DeepSeek HTTP error', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as never;

    const text = await formatTelegramMessage('A Flow post', 'Body.', FLOW_URL);

    expect(text).toContain(flowLink());
  });

  it('falls back on empty DeepSeek content', async () => {
    global.fetch = jest.fn(async () => deepSeekResponse(null)) as never;

    const text = await formatTelegramMessage('A Flow post', 'Body.', FLOW_URL);

    expect(text).toContain(flowLink());
  });

  it('keeps a title link to the source while canonicalizing the Источник link', async () => {
    global.fetch = jest.fn(async () =>
      deepSeekResponse(
        `<b><a href="${SOURCE_URL}">A Flow post</a></b>\n\nBody.\n\n` +
          `<a href="${SOURCE_URL}">Source</a>\n\n` +
          `<a href="${FLOW_URL}">Read more</a>`
      )
    ) as never;

    const text = await formatTelegramMessage(
      'A Flow post',
      'Body.',
      FLOW_URL,
      'ru',
      SOURCE_URL
    );

    expect(text).toContain(`<a href="${SOURCE_URL}">A Flow post</a>`);
    expect(text).toContain(sourceLink());
    expect(text).toContain(flowLink());
    expect(text).not.toContain('>Source</a>');
    expect(text).not.toContain('Read more');
  });
});

describe('Telegram crosspost links with images and source', () => {
  it('uses the canonical Flow link in a photo caption', async () => {
    global.fetch = jest.fn(async (url, init) => {
      if (String(url).includes('api.deepseek.com')) {
        return deepSeekResponse(
          `Photo post body.\n\n<a href="${FLOW_URL}">Read on site</a>\n\n${sourceLink()}`
        );
      }

      if (String(url).includes('/sendPhoto')) {
        return telegramResponse(11);
      }

      throw new Error(`Unexpected fetch: ${String(url)} ${String(init)}`);
    }) as never;

    const result = await crosspostFlowItem(
      postPayload({
        body_md: 'Photo post body.',
        imageUrl: 'https://example.com/image.jpg',
        metadata: { image: 'https://example.com/image.jpg' },
      })
    );

    expect(result.telegram?.messageId).toBe(11);
    const calls = telegramCalls('sendPhoto');
    expect(calls).toHaveLength(1);
    expect(calls[0].caption).toContain(flowLink());
    expect(calls[0].caption).toContain(sourceLink());
    expect(calls[0].caption).not.toContain('Read on site');
    expect(calls[0].photo).toBe('https://example.com/image.jpg');
  });

  it('uses the canonical Flow link in a text-only post with source_url', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('api.deepseek.com')) {
        return deepSeekResponse(`Text post body.\n\n<a href="${FLOW_URL}">Read on site</a>`);
      }

      if (String(url).includes('/sendMessage')) {
        return telegramResponse(12);
      }

      throw new Error(`Unexpected fetch: ${String(url)}`);
    }) as never;

    const result = await crosspostFlowItem(
      postPayload({ body_md: 'Text post body.', imageUrl: null, metadata: {} })
    );

    expect(result.telegram?.messageId).toBe(12);
    const calls = telegramCalls('sendMessage');
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain(flowLink());
    expect(calls[0].text).toContain(sourceLink());
    expect(calls[0].text).not.toContain('Read on site');
  });

  it('preserves the exact Flow URL passed by the item slug', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('api.deepseek.com')) {
        return deepSeekResponse('Body.');
      }

      if (String(url).includes('/sendMessage')) {
        return telegramResponse(13);
      }

      throw new Error(`Unexpected fetch: ${String(url)}`);
    }) as never;

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
      '<a href="https://www.merkurov.love/flow/exact-slug">&gt;&gt;&gt;</a>'
    );
  });
});
