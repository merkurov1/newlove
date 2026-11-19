/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { authorizePersonalAssistantUpdate, isTelegramWebhookAuthentic } from '../webhookAuth';

const SECRET = 'webhook-secret-value';
const ALLOWLISTED_ID = 291983727;

function headers(value?: string) {
  return {
    get(name: string) {
      return name === 'x-telegram-bot-api-secret-token' ? (value ?? null) : null;
    },
  };
}

function update(fromId: number, chatType = 'private') {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: fromId },
      chat: { id: fromId, type: chatType },
      text: 'hello',
    },
  };
}

const env = {
  TELEGRAM_WEBHOOK_ENFORCE_SECRET: '1',
  TELEGRAM_WEBHOOK_SECRET: SECRET,
};

describe('personal assistant webhook authenticity', () => {
  it('accepts only the exact secret when enforcement is enabled', () => {
    const env = {
      TELEGRAM_WEBHOOK_ENFORCE_SECRET: '1',
      TELEGRAM_WEBHOOK_SECRET: SECRET,
    };

    expect(isTelegramWebhookAuthentic(headers(SECRET), env)).toBe(true);
    expect(isTelegramWebhookAuthentic(headers('wrong'), env)).toBe(false);
    expect(isTelegramWebhookAuthentic(headers(), env)).toBe(false);
  });

  it('fails closed when enforcement is off or the secret is missing', () => {
    expect(
      isTelegramWebhookAuthentic(headers(SECRET), {
        TELEGRAM_WEBHOOK_ENFORCE_SECRET: '0',
        TELEGRAM_WEBHOOK_SECRET: SECRET,
      })
    ).toBe(false);

    expect(
      isTelegramWebhookAuthentic(headers(SECRET), {
        TELEGRAM_WEBHOOK_ENFORCE_SECRET: '1',
        TELEGRAM_WEBHOOK_SECRET: '',
      })
    ).toBe(false);

    expect(isTelegramWebhookAuthentic(headers(SECRET), {})).toBe(false);
  });

  it('authorises only an authentic private update from the allowlisted sender', () => {
    expect(authorizePersonalAssistantUpdate(update(ALLOWLISTED_ID), headers(SECRET), env)).toBe(
      'allow'
    );
    expect(authorizePersonalAssistantUpdate(update(ALLOWLISTED_ID), headers('forged'), env)).toBe(
      'reject_unauthenticated'
    );
    expect(authorizePersonalAssistantUpdate(update(ALLOWLISTED_ID), headers(), env)).toBe(
      'reject_unauthenticated'
    );
    expect(
      authorizePersonalAssistantUpdate(update(ALLOWLISTED_ID, 'group'), headers(SECRET), env)
    ).toBe('reject_context');
    expect(authorizePersonalAssistantUpdate(update(12345), headers(SECRET), env)).toBe('ignore');
  });

  it('fails closed for a forged update when enforcement is off', () => {
    expect(
      authorizePersonalAssistantUpdate(update(ALLOWLISTED_ID), headers(SECRET), {
        TELEGRAM_WEBHOOK_ENFORCE_SECRET: '0',
        TELEGRAM_WEBHOOK_SECRET: SECRET,
      })
    ).toBe('reject_unauthenticated');
  });
});
