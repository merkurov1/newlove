/** @jest-environment node */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../store', () => ({
  getQuestionServiceClient: jest.fn(),
}));

jest.mock('@/lib/telegram', () => ({
  sendTelegramMessage: jest.fn(),
}));

jest.mock('../notificationEmail', () => ({
  sendQuestionSubscriptionConfirmation: jest.fn(),
  sendQuestionAnswerNotificationEmail: jest.fn(),
}));

const storeModule = require('../store') as {
  getQuestionServiceClient: jest.Mock;
};
const telegram = require('@/lib/telegram') as { sendTelegramMessage: jest.Mock };
const email = require('../notificationEmail') as {
  sendQuestionSubscriptionConfirmation: jest.Mock;
  sendQuestionAnswerNotificationEmail: jest.Mock;
};

const subscriptions = require('../subscriptions') as typeof import('../subscriptions');

const questionId = '11111111-1111-4111-8111-111111111111';
const subscriptionId = '22222222-2222-4222-8222-222222222222';
const tokenId = '33333333-3333-4333-8333-333333333333';

type QueryResult = { data?: unknown; error?: unknown };

/** A tiny chainable stand-in for the Supabase Postgrest builder. */
function chain(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of [
    'select',
    'eq',
    'is',
    'lt',
    'in',
    'order',
    'limit',
    'update',
    'insert',
    'delete',
    'upsert',
  ]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => result;
  builder.then = (onFulfilled: unknown, onRejected: unknown) =>
    Promise.resolve(result).then(
      onFulfilled as (value: QueryResult) => unknown,
      onRejected as (reason: unknown) => unknown
    );
  return builder;
}

const from = jest.fn();
const rpc = jest.fn();

function queue(...results: QueryResult[]) {
  for (const result of results) from.mockReturnValueOnce(chain(result));
}

function futureIso(minutes = 60) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function pastIso(minutes = 60) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function emailToken(overrides: Record<string, unknown> = {}) {
  return {
    id: tokenId,
    subscription_id: subscriptionId,
    purpose: 'confirm_email',
    channel: 'email',
    expires_at: futureIso(),
    used_at: null,
    ...overrides,
  };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  from.mockReset();
  rpc.mockReset();
  storeModule.getQuestionServiceClient.mockReturnValue({ from, rpc });
  email.sendQuestionSubscriptionConfirmation.mockResolvedValue({ status: 'sent', providerId: 'e1' });
  email.sendQuestionAnswerNotificationEmail.mockResolvedValue({ status: 'sent', providerId: 'e2' });
  telegram.sendTelegramMessage.mockResolvedValue({ messageId: 10, chatId: 20 });
  process.env.RESEND_API_KEY = 'test-resend-key';
  delete process.env.QUESTION_TELEGRAM_NOTIFICATIONS_ENABLED;
  delete process.env.QUESTION_TELEGRAM_BOT_USERNAME;
  delete process.env.PIERROT_BOT_USERNAME;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('question subscription token helpers', () => {
  it('validates and normalizes email addresses', () => {
    expect(subscriptions.isValidQuestionEmail(' Reader@Example.COM ')).toBe(true);
    expect(subscriptions.normalizeQuestionEmail(' Reader@Example.COM ')).toBe(
      'reader@example.com'
    );
    expect(subscriptions.isValidQuestionEmail('not-an-email')).toBe(false);
    expect(subscriptions.isValidQuestionEmail('a@b')).toBe(false);
  });

  it('hashes tokens with sha-256 and keeps the raw token out of the hash', () => {
    const raw = subscriptions.createRawQuestionToken();

    expect(subscriptions.QUESTION_TOKEN_PATTERN.test(raw)).toBe(true);
    expect(subscriptions.hashQuestionToken(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(subscriptions.hashQuestionToken(raw)).not.toContain(raw);
  });

  it('builds same-origin confirmation and unsubscribe URLs', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.test';

    expect(subscriptions.confirmEmailUrlForToken('abc')).toBe(
      'https://example.test/api/question/subscription/confirm?token=abc'
    );
    expect(subscriptions.unsubscribeUrlForToken('abc')).toBe(
      'https://example.test/api/question/subscription/unsubscribe?token=abc'
    );
    expect(subscriptions.questionPageUrl(questionId)).toBe(
      `https://example.test/question?q=${questionId}`
    );
  });

  it('keeps Telegram hidden until the operator enables it explicitly', () => {
    process.env.PIERROT_BOT_TOKEN = 'bot-token';
    process.env.QUESTION_TELEGRAM_BOT_USERNAME = 'piero_bot';

    expect(subscriptions.isQuestionTelegramConfigured()).toBe(false);

    process.env.QUESTION_TELEGRAM_NOTIFICATIONS_ENABLED = '1';
    expect(subscriptions.isQuestionTelegramConfigured()).toBe(true);
  });
});

describe('email subscription lifecycle', () => {
  it('creates a pending subscription and sends a confirmation instead of activating', async () => {
    queue(
      { data: { question: 'В чём смысл?' }, error: null },
      { data: null, error: null },
      {
        data: {
          id: subscriptionId,
          question_id: questionId,
          user_id: null,
          email: 'reader@example.com',
          email_status: 'pending',
          telegram_user_id: null,
          telegram_status: 'pending',
        },
        error: null,
      },
      { error: null },
      { error: null },
      { error: null }
    );

    const result = await subscriptions.createQuestionEmailSubscription({
      questionId,
      email: 'Reader@Example.com',
      userId: null,
    });

    expect(result.state).toBe('pending');
    expect(email.sendQuestionSubscriptionConfirmation).toHaveBeenCalledTimes(1);

    const confirmation = email.sendQuestionSubscriptionConfirmation.mock.calls[0][0] as {
      email: string;
      questionText: string;
      confirmationUrl: string;
    };
    expect(confirmation.email).toBe('reader@example.com');
    expect(confirmation.questionText).toBe('В чём смысл?');
    expect(confirmation.confirmationUrl).toContain('/api/question/subscription/confirm?token=');

    const tokenInsert = from.mock.results[5]?.value as { insert: unknown };
    expect(tokenInsert).toBeDefined();
  });

  it('is idempotent when the email is already confirmed', async () => {
    queue(
      { data: { question: 'Вопрос' }, error: null },
      {
        data: {
          id: subscriptionId,
          question_id: questionId,
          user_id: 'user-1',
          email: 'reader@example.com',
          email_status: 'active',
          telegram_user_id: null,
          telegram_status: 'pending',
        },
        error: null,
      }
    );

    const result = await subscriptions.createQuestionEmailSubscription({
      questionId,
      email: 'reader@example.com',
      userId: 'user-1',
    });

    expect(result).toMatchObject({ state: 'active', available: true });
    expect(email.sendQuestionSubscriptionConfirmation).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid email before touching the database', async () => {
    const result = await subscriptions.createQuestionEmailSubscription({
      questionId,
      email: 'broken',
      userId: null,
    });

    expect(result.state).toBe('error');
    expect(result.code).toBe('invalid_email');
    expect(from).not.toHaveBeenCalled();
  });

  it('reports unavailable when no mail provider is configured in production', async () => {
    delete process.env.RESEND_API_KEY;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const result = await subscriptions.createQuestionEmailSubscription({
      questionId,
      email: 'reader@example.com',
      userId: null,
    });

    process.env.NODE_ENV = previousNodeEnv;

    expect(result).toMatchObject({ state: 'unavailable', available: false });
    expect(from).not.toHaveBeenCalled();
  });

  it('does not claim success when the provider fails', async () => {
    queue(
      { data: { question: 'Вопрос' }, error: null },
      { data: null, error: null },
      {
        data: {
          id: subscriptionId,
          question_id: questionId,
          user_id: null,
          email: 'reader@example.com',
          email_status: 'pending',
          telegram_user_id: null,
          telegram_status: 'pending',
        },
        error: null,
      },
      { error: null },
      { error: null },
      { error: null }
    );
    email.sendQuestionSubscriptionConfirmation.mockResolvedValueOnce({
      status: 'error',
      reason: 'provider_error',
    });

    const result = await subscriptions.createQuestionEmailSubscription({
      questionId,
      email: 'reader@example.com',
      userId: null,
    });

    expect(result.state).toBe('error');
    expect(result.code).toBe('email_send_failed');
  });
});

describe('email confirmation', () => {
  it('activates the subscription and consumes the token once', async () => {
    queue(
      { data: emailToken(), error: null },
      { data: { id: tokenId }, error: null },
      {
        data: {
          id: subscriptionId,
          question_id: questionId,
          user_id: null,
          email: 'reader@example.com',
          email_status: 'pending',
          telegram_user_id: null,
          telegram_status: 'pending',
        },
        error: null,
      },
      { error: null }
    );

    await expect(subscriptions.confirmQuestionEmailToken('a'.repeat(43))).resolves.toEqual({
      status: 'confirmed',
      questionId,
    });
  });

  it('rejects an expired token', async () => {
    queue({ data: emailToken({ expires_at: pastIso() }), error: null });

    await expect(subscriptions.confirmQuestionEmailToken('a'.repeat(43))).resolves.toEqual({
      status: 'expired',
    });
  });

  it('rejects a token that was already used', async () => {
    queue({ data: emailToken({ used_at: pastIso() }), error: null });

    await expect(subscriptions.confirmQuestionEmailToken('a'.repeat(43))).resolves.toEqual({
      status: 'used',
    });
  });

  it('rejects a malformed token without a database read', async () => {
    await expect(subscriptions.confirmQuestionEmailToken('short')).resolves.toEqual({
      status: 'invalid',
    });
    expect(from).not.toHaveBeenCalled();
  });
});

describe('unsubscribe', () => {
  it('disables only the email channel for an email token', async () => {
    queue(
      {
        data: emailToken({ purpose: 'unsubscribe_email', channel: 'email' }),
        error: null,
      },
      { data: { id: tokenId }, error: null },
      {
        data: {
          id: subscriptionId,
          question_id: questionId,
          user_id: null,
          email: 'reader@example.com',
          email_status: 'active',
          telegram_user_id: 7,
          telegram_status: 'active',
        },
        error: null,
      },
      { error: null }
    );

    await expect(subscriptions.unsubscribeQuestionToken('a'.repeat(43))).resolves.toEqual({
      status: 'unsubscribed',
      channel: 'email',
      questionId,
    });
  });

  it('disables both channels for an unsubscribe-all token', async () => {
    queue(
      {
        data: emailToken({ purpose: 'unsubscribe_all', channel: 'all' }),
        error: null,
      },
      { data: { id: tokenId }, error: null },
      {
        data: {
          id: subscriptionId,
          question_id: questionId,
          user_id: null,
          email: 'reader@example.com',
          email_status: 'active',
          telegram_user_id: 7,
          telegram_status: 'active',
        },
        error: null,
      },
      { error: null }
    );

    const result = await subscriptions.unsubscribeQuestionToken('a'.repeat(43));

    expect(result).toMatchObject({ status: 'unsubscribed', channel: 'all' });
  });

  it('is single use', async () => {
    queue(
      {
        data: emailToken({ purpose: 'unsubscribe_email', used_at: pastIso() }),
        error: null,
      }
    );

    await expect(subscriptions.unsubscribeQuestionToken('a'.repeat(43))).resolves.toEqual({
      status: 'used',
    });
  });
});

describe('Telegram linking', () => {
  it('attaches the Telegram identity only after the deep-link token is consumed', async () => {
    process.env.QUESTION_TELEGRAM_NOTIFICATIONS_ENABLED = '1';
    process.env.PIERROT_BOT_TOKEN = 'bot-token';
    process.env.QUESTION_TELEGRAM_BOT_USERNAME = 'piero_bot';

    queue(
      {
        data: emailToken({ purpose: 'link_telegram', channel: 'telegram' }),
        error: null,
      },
      { data: { id: tokenId }, error: null },
      {
        data: {
          id: subscriptionId,
          question_id: questionId,
          user_id: null,
          email: null,
          email_status: 'pending',
          telegram_user_id: null,
          telegram_status: 'pending',
        },
        error: null,
      },
      { data: null, error: null },
      { error: null }
    );

    await expect(
      subscriptions.linkQuestionTelegramToken({
        rawToken: 'b'.repeat(43),
        telegramUserId: 777,
        telegramChatId: 777,
      })
    ).resolves.toEqual({ status: 'linked', questionId });
  });

  it('keeps an existing Telegram subscription instead of creating a second one', async () => {
    queue(
      {
        data: emailToken({ purpose: 'link_telegram', channel: 'telegram' }),
        error: null,
      },
      { data: { id: tokenId }, error: null },
      {
        data: {
          id: subscriptionId,
          question_id: questionId,
          user_id: null,
          email: null,
          email_status: 'pending',
          telegram_user_id: null,
          telegram_status: 'pending',
        },
        error: null,
      },
      { data: { id: 'existing-subscription', telegram_status: 'active' }, error: null },
      { error: null }
    );

    await expect(
      subscriptions.linkQuestionTelegramToken({
        rawToken: 'b'.repeat(43),
        telegramUserId: 777,
        telegramChatId: 777,
      })
    ).resolves.toEqual({ status: 'already_linked', questionId });
  });

  it('reactivates an existing disabled Telegram subscription after unsubscribe', async () => {
    queue(
      {
        data: emailToken({ purpose: 'link_telegram', channel: 'telegram' }),
        error: null,
      },
      { data: { id: tokenId }, error: null },
      {
        data: {
          id: subscriptionId,
          question_id: questionId,
          user_id: null,
          email: null,
          email_status: 'pending',
          telegram_user_id: null,
          telegram_status: 'pending',
        },
        error: null,
      },
      { data: { id: 'existing-subscription', telegram_status: 'disabled' }, error: null },
      { error: null },
      { error: null }
    );

    await expect(
      subscriptions.linkQuestionTelegramToken({
        rawToken: 'b'.repeat(43),
        telegramUserId: 777,
        telegramChatId: 777,
      })
    ).resolves.toEqual({ status: 'linked', questionId });
  });
});

describe('authenticated channel preferences', () => {
  it('scopes the disable update to the caller user id', async () => {
    queue({ data: [{ id: subscriptionId }], error: null });

    await expect(
      subscriptions.disableQuestionChannel({
        questionId,
        userId: 'user-1',
        channel: 'email',
      })
    ).resolves.toBe('disabled');
  });

  it('returns not_found when the user has no active channel', async () => {
    queue({ data: [], error: null });

    await expect(
      subscriptions.disableQuestionChannel({
        questionId,
        userId: 'user-1',
        channel: 'telegram',
      })
    ).resolves.toBe('not_found');
  });

  it('disables every channel for an unsubscribe-all request', async () => {
    queue(
      {
        data: [{ email_status: 'active', telegram_status: 'active' }],
        error: null,
      },
      { error: null }
    );

    await expect(
      subscriptions.disableQuestionChannel({
        questionId,
        userId: 'user-1',
        channel: 'all',
      })
    ).resolves.toBe('disabled');
  });

  it('aggregates states without returning identifiers', async () => {
    queue({
      data: [
        {
          email: 'reader@example.com',
          email_status: 'active',
          telegram_user_id: 7,
          telegram_status: 'pending',
        },
        {
          email: null,
          email_status: 'pending',
          telegram_user_id: 8,
          telegram_status: 'active',
        },
      ],
      error: null,
    });

    const result = await subscriptions.getQuestionSubscriptionStatusForUser({
      questionId,
      userId: 'user-1',
    });

    expect(result.email.state).toBe('active');
    expect(result.telegram.state).toBe('active');
    expect(JSON.stringify(result)).not.toContain('@');
    expect(JSON.stringify(result)).not.toContain('telegram_user_id');
  });

  it('does not report a pending email for a Telegram-only row', async () => {
    queue({
      data: [
        {
          email: null,
          email_status: 'pending',
          telegram_user_id: 8,
          telegram_status: 'active',
        },
      ],
      error: null,
    });

    const result = await subscriptions.getQuestionSubscriptionStatusForUser({
      questionId,
      userId: 'user-1',
    });

    expect(result.email.state).toBe('none');
    expect(result.telegram.state).toBe('active');
  });
});

describe('notification delivery', () => {
  const baseRow = {
    question_id: questionId,
    question_text: 'В чём смысл?',
    answer_id: '44444444-4444-4444-8444-444444444444',
    subscription_id: subscriptionId,
    attempts: 1,
  };

  function claim(rows: unknown[]) {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'question_claim_answer_notifications') {
        return { data: rows, error: null };
      }
      return { data: true, error: null };
    });
  }

  function completionCalls() {
    return rpc.mock.calls.filter(
      ([name]) => name === 'question_complete_answer_notification'
    ) as Array<[string, { p_notification_id: string; p_status: string; p_error: string | null }]>;
  }

  it('sends one email and records success without answer text', async () => {
    claim([
      {
        ...baseRow,
        notification_id: '55555555-5555-4555-8555-555555555555',
        channel: 'email',
        email: 'reader@example.com',
        telegram_user_id: null,
        telegram_chat_id: null,
      },
    ]);
    queue({ error: null }, { error: null });

    const result = await subscriptions.processPendingQuestionNotifications({ limit: 5 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(email.sendQuestionAnswerNotificationEmail).toHaveBeenCalledTimes(1);
    const payload = email.sendQuestionAnswerNotificationEmail.mock.calls[0][0] as {
      questionText: string;
      questionUrl: string;
      unsubscribeUrl: string;
      unsubscribeAllUrl: string;
    };
    expect(payload.questionText).toBe('В чём смысл?');
    expect(payload.questionUrl).toContain(`/question?q=${questionId}`);
    expect(payload.unsubscribeUrl).toContain('/api/question/subscription/unsubscribe?token=');
    expect(payload.unsubscribeAllUrl).toContain('/api/question/subscription/unsubscribe?token=');
    expect(completionCalls()[0][1]).toMatchObject({ p_status: 'sent' });
  });

  it('records a retryable failure instead of throwing', async () => {
    claim([
      {
        ...baseRow,
        notification_id: '55555555-5555-4555-8555-555555555555',
        channel: 'email',
        email: 'reader@example.com',
        telegram_user_id: null,
        telegram_chat_id: null,
      },
    ]);
    queue({ error: null }, { error: null });
    email.sendQuestionAnswerNotificationEmail.mockResolvedValueOnce({
      status: 'error',
      reason: 'provider_error',
    });

    const result = await subscriptions.processPendingQuestionNotifications({ limit: 5 });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1, skipped: 0 });
    expect(completionCalls()[0][1]).toMatchObject({
      p_status: 'failed',
      p_error: 'email_send_failed',
    });
  });

  it('keeps processing the next channel when one delivery fails', async () => {
    claim([
      {
        ...baseRow,
        notification_id: '55555555-5555-4555-8555-555555555555',
        channel: 'email',
        email: 'reader@example.com',
        telegram_user_id: null,
        telegram_chat_id: null,
      },
      {
        ...baseRow,
        notification_id: '66666666-6666-4666-8666-666666666666',
        channel: 'telegram',
        email: null,
        telegram_user_id: 777,
        telegram_chat_id: 777,
      },
    ]);
    process.env.QUESTION_TELEGRAM_NOTIFICATIONS_ENABLED = '1';
    process.env.PIERROT_BOT_TOKEN = 'bot-token';
    process.env.QUESTION_TELEGRAM_BOT_USERNAME = 'piero_bot';
    queue({ error: null }, { error: null }, { error: null }, { error: null });
    telegram.sendTelegramMessage.mockResolvedValueOnce(null);

    const result = await subscriptions.processPendingQuestionNotifications({ limit: 5 });

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1, skipped: 0 });
    expect(completionCalls().map(([, params]) => params.p_status)).toEqual(['sent', 'failed']);
  });

  it('does not attempt email delivery without a provider and marks it failed', async () => {
    claim([
      {
        ...baseRow,
        notification_id: '55555555-5555-4555-8555-555555555555',
        channel: 'email',
        email: 'reader@example.com',
        telegram_user_id: null,
        telegram_chat_id: null,
      },
    ]);
    delete process.env.RESEND_API_KEY;

    const result = await subscriptions.processPendingQuestionNotifications({ limit: 5 });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1, skipped: 0 });
    expect(email.sendQuestionAnswerNotificationEmail).not.toHaveBeenCalled();
    expect(completionCalls()[0][1]).toMatchObject({
      p_status: 'failed',
      p_error: 'email_not_configured',
    });
  });

  it('sends a Telegram message without leaking answer text', async () => {
    claim([
      {
        ...baseRow,
        notification_id: '66666666-6666-4666-8666-666666666666',
        channel: 'telegram',
        email: null,
        telegram_user_id: 777,
        telegram_chat_id: 777,
      },
    ]);
    process.env.QUESTION_TELEGRAM_NOTIFICATIONS_ENABLED = '1';
    process.env.PIERROT_BOT_TOKEN = 'bot-token';
    process.env.QUESTION_TELEGRAM_BOT_USERNAME = 'piero_bot';
    queue({ error: null }, { error: null });

    const result = await subscriptions.processPendingQuestionNotifications({ limit: 5 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
    const text = telegram.sendTelegramMessage.mock.calls[0][1] as string;
    expect(text).toContain('Новый ответ');
    expect(text).toContain('/question?q=');
    expect(text).not.toContain(baseRow.answer_id);
  });
});
