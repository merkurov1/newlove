/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { normalizeFlowItem } from '../content';
import { publishTelegramContent } from '../telegram';

// Fixture only. The production hash is server configuration and is never
// committed to the repository.
const HASH = '22e613409c3e034789';
const CANONICAL = 'https://www.merkurov.love/flow/telegram-test';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function content(overrides: Record<string, unknown> = {}) {
  return normalizeFlowItem({
    id: 'flow-iv-1',
    slug: 'telegram-test',
    title: 'Instant View test',
    body_md: 'A short public note.',
    type: 'note',
    lang: 'en',
    status: 'published',
    visibility: 'public',
    published_at: '2026-11-28T07:10:27.959Z',
    metadata: {},
    ...overrides,
  } as any);
}

type FetchCall = { url: string; body: Record<string, unknown> };

function installFetch() {
  const calls: FetchCall[] = [];

  global.fetch = jest.fn(async (url, init) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String((init as RequestInit).body)),
    });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        result: { message_id: 42, chat: { id: -1001 } },
      }),
    } as unknown as Response;
  }) as never;

  return calls;
}

/** Every user-visible text/caption the publisher sent, in delivery order. */
function deliveredText(calls: FetchCall[]): string {
  return calls
    .map((call) => {
      const body = call.body;
      const parts: string[] = [];

      if (typeof body.text === 'string') parts.push(body.text);
      if (typeof body.caption === 'string') parts.push(body.caption);

      if (Array.isArray(body.media)) {
        for (const entry of body.media) {
          if (entry && typeof entry === 'object' && typeof entry.caption === 'string') {
            parts.push(entry.caption);
          }
        }
      }

      return parts.join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

function instantViewLinks(text: string) {
  return [...text.matchAll(/https:\/\/t\.me\/iv\?url=([^&"]+)&amp;rhash=([a-f0-9]+)/g)].map(
    (match) => ({
      wrapper: `https://t.me/iv?url=${match[1]}&rhash=${match[2]}`,
      pageUrl: decodeURIComponent(match[1]),
      hash: match[2],
    })
  );
}

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.PIERROT_BOT_TOKEN = 'test-bot-token';
  process.env.TELEGRAM_CHANNEL_ID = '@test-channel';
  delete process.env.OSIRIS_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_MINI_APP_BOT_USERNAME;
  delete process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  delete process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH;
  delete process.env.TELEGRAM_INSTANT_VIEW_HASH;
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('Telegram publication Instant View link', () => {
  it('uses the verified Instant View wrapper for the canonical Flow post', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const calls = installFetch();

    const result = await publishTelegramContent(content());

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const text = deliveredText(calls);
    const links = instantViewLinks(text);

    expect(links).toHaveLength(1);
    expect(links[0].pageUrl).toBe(CANONICAL);
    expect(links[0].hash).toBe(HASH);
    expect(text).toContain('>[ Flow ]</a>');
    expect(text).not.toContain('startapp=');
  });

  it('prefers a verified Instant View link over the Mini App link', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    process.env.TELEGRAM_MINI_APP_BOT_USERNAME = 'PierrotAi_bot';
    const calls = installFetch();

    await publishTelegramContent(content());

    const text = deliveredText(calls);
    expect(text).toContain('https://t.me/iv?url=');
    expect(text).toContain(`rhash=${HASH}`);
    expect(text).not.toContain('startapp=');
  });

  it('keeps the [ Flow ] label on one line with its href intact', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const calls = installFetch();

    await publishTelegramContent(content());

    const text = deliveredText(calls);
    const flowLines = text.split('\n').filter((line) => line.includes('[ Flow ]'));
    expect(flowLines).toHaveLength(1);
    expect(flowLines[0]).toMatch(
      /<a href="https:\/\/t\.me\/iv\?url=[^"]+&amp;rhash=[a-f0-9]+">\[ Flow \]<\/a>/
    );
  });

  it('keeps the existing canonical link when the hash is missing or invalid', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = 'not-a-real-hash';
    const calls = installFetch();

    await publishTelegramContent(content());

    const text = deliveredText(calls);
    expect(text).toContain(CANONICAL);
    expect(text).not.toContain('t.me/iv');
  });

  it('falls back to the existing Mini App link when the hash is missing', async () => {
    process.env.TELEGRAM_MINI_APP_BOT_USERNAME = 'PierrotAi_bot';
    const calls = installFetch();

    await publishTelegramContent(content());

    const text = deliveredText(calls);
    expect(text).toContain('https://t.me/PierrotAi_bot?startapp=');
    expect(text).not.toContain('t.me/iv');
  });

  it('falls back to the Mini App link for a malformed hash', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = '<real editor hash>';
    process.env.TELEGRAM_MINI_APP_BOT_USERNAME = 'PierrotAi_bot';
    const calls = installFetch();

    await publishTelegramContent(content());

    const text = deliveredText(calls);
    expect(text).toContain('https://t.me/PierrotAi_bot?startapp=');
    expect(text).not.toContain('t.me/iv');
  });

  it.each([
    ['draft', 'public'],
    ['published', 'private'],
    ['pending', 'public'],
    ['archived', 'private'],
    [null, 'public'],
    ['published', null],
    [null, null],
  ])('never wraps a row without explicit public state (status=%s visibility=%s)', async (status, visibility) => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const calls = installFetch();

    await publishTelegramContent(content({ status, visibility }));

    const text = deliveredText(calls);
    expect(text).not.toContain('t.me/iv');
    expect(text).toContain(CANONICAL);
  });

  it('does not leak the hash to console output', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    installFetch();
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined)
    );

    const result = await publishTelegramContent(content());

    const consoleOutput = spies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map((value) => (typeof value === 'string' ? value : ''))
      .join('\n');

    expect(result.ok).toBe(true);
    expect(consoleOutput).not.toContain(HASH);
  });
});

describe.each([
  {
    name: 'text-only note',
    overrides: { type: 'note', body_md: 'First paragraph.\n\nSecond paragraph.' },
  },
  {
    name: 'Markdown article',
    overrides: {
      type: 'article',
      title: 'Markdown article',
      body_md: '## Section one\n\n**Bold** and *italic*.\n\n- one\n- two',
    },
  },
  {
    name: 'image post with caption',
    overrides: {
      type: 'photo',
      title: 'Image post',
      body_md: '',
      metadata: {
        image: 'https://cdn.example.com/photo.jpg',
        caption: 'A caption',
      },
    },
  },
  {
    name: 'link-only post',
    overrides: {
      type: 'link',
      title: 'My Flow title',
      body_md: '',
      source_url: 'https://example.com/linked-article',
      metadata: {
        link_preview: {
          url: 'https://example.com/linked-article',
          title: 'Linked page OG title',
          description: 'Linked description',
          site_name: 'example.com',
        },
      },
    },
  },
  {
    name: 'video / supported media',
    overrides: {
      type: 'video',
      title: 'Video post',
      body_md: 'Video description.',
      source_url: 'https://www.youtube.com/watch?v=abc123def45',
    },
  },
  {
    name: 'quote post',
    overrides: {
      type: 'quote',
      title: 'Quote post',
      body_md: '> Quoted line.',
    },
  },
  {
    name: 'mixed post',
    overrides: {
      type: 'mixed',
      title: 'Mixed post',
      body_md: 'Commentary about the image.',
      metadata: { image: 'https://cdn.example.com/mixed.jpg' },
    },
  },
])('Instant View for $name', ({ overrides }) => {
  it('keeps the Instant View Flow link and all publication content', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const calls = installFetch();

    const result = await publishTelegramContent(content(overrides));

    expect(result.ok).toBe(true);
    const text = deliveredText(calls);
    const links = instantViewLinks(text);

    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links.every((link) => link.pageUrl === CANONICAL)).toBe(true);
    expect(links.every((link) => link.hash === HASH)).toBe(true);
    expect(text).toContain('>[ Flow ]</a>');
    expect(text).not.toContain('startapp=');
  });
});
