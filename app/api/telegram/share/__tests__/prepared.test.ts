/** @jest-environment node */

import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/flow/items-cash', () => ({ getCachedFlowItem: jest.fn() }));
jest.mock('@/lib/flow/content', () => ({ normalizeFlowItem: jest.fn(() => ({ id: 'item-1' })) }));
jest.mock('@/lib/flow/metadata', () => ({
  resolveFlowMetadataFromContent: jest.fn(() => ({
    title: 'Structural Integrity',
    description: 'A note on what holds.',
    canonicalUrl: 'https://www.merkurov.love/flow/structural-integrity',
  })),
}));

const { getCachedFlowItem } = require('@/lib/flow/items-cash') as { getCachedFlowItem: jest.Mock };
const { POST } = require('@/app/api/telegram/share/prepared/route') as {
  POST: (req: Request) => Promise<Response>;
};

const BOT_TOKEN = '123456:test-bot-token';

function signedInitData(): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 97518066, first_name: 'Anton' }),
  });
  const dataCheckString = Array.from(params.entries())
    .map(([key, value]) => [key, value] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();

  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));

  return params.toString();
}

function request(body: unknown, initData = signedInitData()) {
  return new Request('https://www.merkurov.love/api/telegram/share/prepared', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(initData ? { 'x-telegram-init-data': initData } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.PIERROT_BOT_TOKEN = BOT_TOKEN;
  getCachedFlowItem.mockReset();
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: { id: 'prepared-real-id' } }),
  })) as never;
});

describe('Telegram prepared Flow share', () => {
  it('rejects unverified launch data', async () => {
    const response = await POST(request({ slug: 'structural-integrity' }, ''));

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('never prepares a message for a draft or missing publication', async () => {
    getCachedFlowItem.mockResolvedValueOnce(null);
    const response = await POST(request({ slug: 'private-draft' }));

    expect(response.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('creates a prepared message for published canonical content only', async () => {
    getCachedFlowItem.mockResolvedValueOnce({ item: { id: 'item-1' }, media: [] });
    const response = await POST(request({ slug: 'structural-integrity' }));
    const json = (await response.json()) as { preparedMessageId?: string };

    expect(response.status).toBe(200);
    expect(json.preparedMessageId).toBe('prepared-real-id');
    expect(getCachedFlowItem).toHaveBeenCalledWith('structural-integrity');

    const call = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(call[1].body)) as {
      user_id: number;
      result: { input_message_content: { message_text: string } };
    };

    expect(body.user_id).toBe(97518066);
    expect(body.result.input_message_content.message_text).toContain(
      'https://www.merkurov.love/flow/structural-integrity'
    );
  });

  it('fails closed when the bot cannot create prepared messages', async () => {
    getCachedFlowItem.mockResolvedValueOnce({ item: { id: 'item-1' }, media: [] });
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, description: 'Bad Request: method not found' }),
    })) as never;

    const response = await POST(request({ slug: 'structural-integrity' }));

    expect(response.status).toBe(503);
  });
});
