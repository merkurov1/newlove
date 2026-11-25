/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  VIGIL_CHANNEL_LINK_LABEL,
  VIGIL_CHANNEL_MESSAGE,
  buildVigilChannelPost,
  getVigilChannelDestination,
  publishVigilChannelPost,
} from '../channelPost';

const originalEnv = { ...process.env };

type FetchCall = {
  url: string;
  body: Record<string, unknown>;
};

function installFetch(
  handler: (call: FetchCall) => {
    ok: boolean;
    result?: unknown;
    description?: string;
  }
) {
  const calls: FetchCall[] = [];

  const fetcher = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = {
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    };
    calls.push(call);

    const response = handler(call);

    return {
      ok: response.ok,
      status: response.ok ? 200 : 400,
      json: async () => ({
        ok: response.ok,
        result: response.result,
        description: response.description,
      }),
    } as unknown as Response;
  });

  return { calls, fetcher: fetcher as unknown as typeof fetch };
}

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.TEMPLE_BOT_TOKEN;
  delete process.env.TEMPLE_CHANNEL_ID;
  delete process.env.HEART_AND_ANGEL_CHANNEL_ID;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterEach(() => {
  process.env = { ...originalEnv };
  jest.restoreAllMocks();
});

describe('Vigil channel post', () => {
  it('builds one short anonymous post with a direct Temple link', () => {
    expect(buildVigilChannelPost('https://www.merkurov.love/')).toBe(
      `${VIGIL_CHANNEL_MESSAGE}\n\n<a href="https://www.merkurov.love/temple">${VIGIL_CHANNEL_LINK_LABEL}</a>`
    );
    expect(getVigilChannelDestination()).toBe('https://www.merkurov.love/temple');
  });

  it('uses the public site URL when one is configured', () => {
    expect(buildVigilChannelPost('https://staging.example.test')).toContain(
      'href="https://staging.example.test/temple"'
    );
  });

  it('sends through the Temple bot to the Heart & Angel channel', async () => {
    const { calls, fetcher } = installFetch(() => ({
      ok: true,
      result: { message_id: 42, chat: { id: -1001 } },
    }));

    const result = await publishVigilChannelPost({
      fetch: fetcher,
      token: 'temple-token',
      channelId: '@heartandangel',
    });

    expect(result).toEqual({ ok: true, messageId: 42, chatId: -1001 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.telegram.org/bottemple-token/sendMessage');
    expect(calls[0].body).toEqual({
      chat_id: '@heartandangel',
      text: buildVigilChannelPost(),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    expect(calls[0].body.text).not.toContain('Anna');
    expect(calls[0].body.text).not.toContain('intention');
  });

  it('does not call Telegram when the bot token is missing', async () => {
    const { calls, fetcher } = installFetch(() => ({ ok: true }));

    const result = await publishVigilChannelPost({
      fetch: fetcher,
      token: '',
      channelId: '@heartandangel',
    });

    expect(result).toEqual({ ok: false, reason: 'not_configured' });
    expect(calls).toHaveLength(0);
  });

  it('reports a failed publish without throwing', async () => {
    const { calls, fetcher } = installFetch(() => ({
      ok: false,
      description: 'Forbidden: bot is not a member of the channel chat',
    }));

    const result = await publishVigilChannelPost({
      fetch: fetcher,
      token: 'temple-token',
      channelId: '@heartandangel',
    });

    expect(result).toEqual({ ok: false, reason: 'request_failed' });
    expect(calls).toHaveLength(1);
  });

  it('reads the Temple bot configuration from the environment', async () => {
    process.env.TEMPLE_BOT_TOKEN = 'env-temple-token';
    process.env.TEMPLE_CHANNEL_ID = '@env-channel';

    const { calls, fetcher } = installFetch(() => ({
      ok: true,
      result: { message_id: 7, chat: { id: -1002 } },
    }));

    const result = await publishVigilChannelPost({ fetch: fetcher });

    expect(result).toEqual({ ok: true, messageId: 7, chatId: -1002 });
    expect(calls[0].url).toBe('https://api.telegram.org/botenv-temple-token/sendMessage');
    expect(calls[0].body.chat_id).toBe('@env-channel');
  });
});
