/**
 * Shared Telegram Mini App initData verification.
 *
 * Official algorithm:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 *
 * This module never reads `initDataUnsafe`; callers must pass the raw initData
 * string and a server-side bot token.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
export const TELEGRAM_INIT_DATA_FUTURE_TOLERANCE_SECONDS = 60;

export type TelegramInitDataUser = {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  isPremium: boolean;
};

export type TelegramInitDataResult =
  | {
      ok: true;
      user: TelegramInitDataUser;
      authDate: number;
      queryId: string | null;
    }
  | {
      ok: false;
      reason:
        | 'missing'
        | 'invalid_hash'
        | 'missing_auth_date'
        | 'stale'
        | 'future'
        | 'missing_user'
        | 'invalid_user'
        | 'malformed';
    };

function readString(value: string | null): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeHexEqual(expectedHex: string, receivedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');

  if (!expected.length || expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  options: {
    maxAgeSeconds?: number;
    futureToleranceSeconds?: number;
    nowSeconds?: number;
  } = {}
): TelegramInitDataResult {
  if (!initData || !botToken) return { ok: false, reason: 'missing' };

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
      return { ok: false, reason: 'invalid_hash' };
    }

    const authDateRaw = params.get('auth_date');

    if (!authDateRaw || !/^\d+$/.test(authDateRaw)) {
      return { ok: false, reason: 'missing_auth_date' };
    }

    const authDate = Number(authDateRaw);
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const maxAge = options.maxAgeSeconds ?? TELEGRAM_INIT_DATA_MAX_AGE_SECONDS;
    const futureTolerance =
      options.futureToleranceSeconds ?? TELEGRAM_INIT_DATA_FUTURE_TOLERANCE_SECONDS;

    if (!Number.isSafeInteger(authDate)) {
      return { ok: false, reason: 'missing_auth_date' };
    }

    if (authDate > now + futureTolerance) {
      return { ok: false, reason: 'future' };
    }

    if (now - authDate > maxAge) {
      return { ok: false, reason: 'stale' };
    }

    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .map(([key, value]) => [key, value] as const)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (!safeHexEqual(calculatedHash, hash.toLowerCase())) {
      return { ok: false, reason: 'invalid_hash' };
    }

    const userRaw = params.get('user');

    if (!userRaw) return { ok: false, reason: 'missing_user' };

    let parsed: unknown;

    try {
      parsed = JSON.parse(userRaw);
    } catch {
      return { ok: false, reason: 'invalid_user' };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'invalid_user' };
    }

    const record = parsed as Record<string, unknown>;
    const rawId = record.id;
    const id =
      typeof rawId === 'number' && Number.isSafeInteger(rawId)
        ? String(rawId)
        : typeof rawId === 'string'
          ? rawId.trim()
          : '';

    if (!/^\d+$/.test(id)) return { ok: false, reason: 'invalid_user' };

    return {
      ok: true,
      authDate,
      queryId: readString(params.get('query_id')),
      user: {
        id,
        username: readString(typeof record.username === 'string' ? record.username : null),
        firstName: readString(typeof record.first_name === 'string' ? record.first_name : null),
        lastName: readString(typeof record.last_name === 'string' ? record.last_name : null),
        languageCode: readString(
          typeof record.language_code === 'string' ? record.language_code : null
        ),
        isPremium: record.is_premium === true,
      },
    };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}
