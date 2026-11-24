/** @jest-environment node */

import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from '@jest/globals';

const { POST } = require('@/app/api/telegram/group-vigil/route') as {
  POST: (req: Request) => Promise<Response>;
};

const BOT_TOKEN = '123456:test-bot-token';

function signedInitData(fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = Array.from(params.entries())
    .map(([key, value]) => [key, value] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();

  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));

  return params.toString();
}

function request(body: Record<string, unknown>) {
  return new Request('https://www.merkurov.love/api/telegram/group-vigil', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.PIERROT_BOT_TOKEN = BOT_TOKEN;
});

describe('Shared Vigil authorization', () => {
  it('cannot bind a group from a client-supplied chat_instance', async () => {
    const dmInitData = signedInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 97518066 }),
    });

    const response = await POST(
      request({
        action: 'join',
        initData: dmInitData,
        // An attacker adds these fields to the request body. They are ignored.
        chat_instance: '-987654321',
        chat_type: 'supergroup',
        chat: JSON.stringify({ id: -100123 }),
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      shared: false,
    });
  });

  it('rejects tampered initData before any persistence', async () => {
    const signed = signedInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 97518066 }),
      chat_type: 'supergroup',
      chat_instance: '-987654321',
    });

    const response = await POST(
      request({ action: 'join', initData: signed.replace('97518066', '11111111') })
    );

    expect(response.status).toBe(401);
  });

  it('fails closed when the bot token is missing', async () => {
    delete process.env.PIERROT_BOT_TOKEN;
    delete process.env.OSIRIS_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;

    const response = await POST(
      request({
        action: 'join',
        initData: signedInitData({
          auth_date: String(Math.floor(Date.now() / 1000)),
          user: JSON.stringify({ id: 97518066 }),
        }),
      })
    );

    expect(response.status).toBe(503);
  });
});
