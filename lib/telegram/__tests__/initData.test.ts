/** @jest-environment node */

import { createHmac } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';

import { verifyTelegramInitData } from '../initData';

const BOT_TOKEN = '123456:test-bot-token';

function signedInitData(fields: Record<string, string>, botToken = BOT_TOKEN): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = Array.from(params.entries())
    .map(([key, value]) => [key, value] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);

  return params.toString();
}

function validFields(now = Math.floor(Date.now() / 1000)) {
  return {
    auth_date: String(now),
    query_id: 'AAH-test-query',
    user: JSON.stringify({
      id: 97518066,
      username: 'merkurov',
      first_name: 'Anton',
      language_code: 'en',
      is_premium: true,
    }),
  };
}

describe('Telegram initData verification', () => {
  it('accepts a correctly signed initData payload', () => {
    const result = verifyTelegramInitData(signedInitData(validFields()), BOT_TOKEN);

    expect(result).toMatchObject({
      ok: true,
      queryId: 'AAH-test-query',
      user: {
        id: '97518066',
        username: 'merkurov',
        firstName: 'Anton',
        languageCode: 'en',
        isPremium: true,
      },
    });
  });

  it('rejects a tampered payload and a wrong bot token', () => {
    const signed = signedInitData(validFields());

    expect(verifyTelegramInitData(signed.replace('merkurov', 'attacker'), BOT_TOKEN)).toEqual({
      ok: false,
      reason: 'invalid_hash',
    });

    expect(verifyTelegramInitData(signed, '654321:other-token')).toEqual({
      ok: false,
      reason: 'invalid_hash',
    });
  });

  it('rejects stale and future-dated initData', () => {
    const now = Math.floor(Date.now() / 1000);

    expect(
      verifyTelegramInitData(signedInitData(validFields(now - 24 * 60 * 60 - 1)), BOT_TOKEN)
    ).toEqual({ ok: false, reason: 'stale' });

    expect(verifyTelegramInitData(signedInitData(validFields(now + 120)), BOT_TOKEN)).toEqual({
      ok: false,
      reason: 'future',
    });
  });

  it('rejects missing or invalid users even with a valid signature', () => {
    const now = Math.floor(Date.now() / 1000);

    expect(verifyTelegramInitData(signedInitData({ auth_date: String(now) }), BOT_TOKEN)).toEqual({
      ok: false,
      reason: 'missing_user',
    });

    expect(
      verifyTelegramInitData(
        signedInitData({
          auth_date: String(now),
          user: JSON.stringify({ id: 'not-a-user' }),
        }),
        BOT_TOKEN
      )
    ).toEqual({ ok: false, reason: 'invalid_user' });
  });

  it('fails closed when initData or the bot token is missing', () => {
    expect(verifyTelegramInitData('', BOT_TOKEN)).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(verifyTelegramInitData(signedInitData(validFields()), '')).toEqual({
      ok: false,
      reason: 'missing',
    });
  });
});
