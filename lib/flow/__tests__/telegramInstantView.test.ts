/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { normalizeFlowItem } from '../content';
import { publishTelegramContent } from '../telegram';

const HASH = '22e613409c3e034789';
const CANONICAL = 'https://www.merkurov.love/flow/telegram-test';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function content() {
  return normalizeFlowItem({
    id: 'flow-iv-1',
    slug: 'telegram-test',
    title: 'Instant View test',
    body_md: 'A short public note.',
    type: 'note',
    lang: 'en',
    metadata: {},
  } as any);
}

function installFetch() {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

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
});

describe('Telegram publication Instant View link', () => {
  it('uses the verified Instant View wrapper for the canonical Flow post', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    const calls = installFetch();

    const result = await publishTelegramContent(content());

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    const text = String(calls[0].body.text);
    const wrapper = `https://t.me/iv?url=${encodeURIComponent(CANONICAL)}&rhash=${HASH}`;

    expect(text).toContain(wrapper.replace(/&/g, '&amp;'));
    expect(text).toContain('>[ Flow ]</a>');
    expect(text).not.toContain('startapp=');
  });

  it('prefers a verified Instant View link over the Mini App link', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = HASH;
    process.env.TELEGRAM_MINI_APP_BOT_USERNAME = 'PierrotAi_bot';
    const calls = installFetch();

    await publishTelegramContent(content());

    const text = String(calls[0].body.text);
    expect(text).toContain('https://t.me/iv?url=');
    expect(text).toContain(`rhash=${HASH}`);
    expect(text).not.toContain('startapp=');
  });

  it('keeps the existing canonical link when the hash is missing or invalid', async () => {
    process.env.TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH = 'not-a-real-hash';
    const calls = installFetch();

    await publishTelegramContent(content());

    const text = String(calls[0].body.text);
    expect(text).toContain(CANONICAL);
    expect(text).not.toContain('t.me/iv');
  });
});
