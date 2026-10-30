/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  buildHumanContextSummary,
  createHumanAccessToken,
  deriveTelegramHumanMessageId,
  hashHumanAccessToken,
  publicHumanState,
  visitorLabelForConversation,
  type HumanRequestRow,
} from '../humanPresence';
import {
  getHumanOwnerTelegramId,
  isHumanOwnerTelegramUser,
} from '../humanPresenceTelegram';

function requestRow(overrides: Partial<HumanRequestRow> = {}): HumanRequestRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    conversation_id: '22222222-2222-4222-8222-222222222222',
    status: 'pending',
    access_token_hash: 'a'.repeat(64),
    visitor_label: '#A821',
    start_page: '/heartandangel',
    context_summary: 'A short context',
    language: 'ru',
    resolved_by: null,
    telegram_chat_id: 123456789,
    telegram_message_id: 77,
    telegram_status_message_id: 77,
    created_at: '2026-10-30T10:00:00.000Z',
    updated_at: '2026-10-30T10:00:00.000Z',
    expires_at: '2026-10-30T10:20:00.000Z',
    accepted_at: null,
    declined_at: null,
    closed_at: null,
    expired_at: null,
    ...overrides,
  };
}

describe('human presence credentials', () => {
  it('creates a 256-bit opaque token and stores only its hash', () => {
    const first = createHumanAccessToken();
    const second = createHumanAccessToken();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).not.toBe(first.token);
    expect(first.token).not.toBe(second.token);
    expect(hashHumanAccessToken(first.token)).toBe(first.hash);
  });

  it('derives a deterministic, non-reversible visitor label', () => {
    const label = visitorLabelForConversation('22222222-2222-4222-8222-222222222222');

    expect(label).toMatch(/^#[A-F0-9]{4}$/);
    expect(label).toBe(
      visitorLabelForConversation('22222222-2222-4222-8222-222222222222')
    );
    expect(label).not.toContain('2222');
  });

  it('derives the same id for a redelivered Telegram update', () => {
    const first = deriveTelegramHumanMessageId(123456789, 42);
    const second = deriveTelegramHumanMessageId(123456789, 42);
    const other = deriveTelegramHumanMessageId(123456789, 43);

    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^h_[A-Za-z0-9_-]{40}$/);
  });

  it('never exposes token hashes or Telegram ids in public state', () => {
    const state = publicHumanState(requestRow());

    expect(state).toMatchObject({
      requestId: '11111111-1111-4111-8111-111111111111',
      status: 'pending',
      visitorLabel: '#A821',
    });

    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain('a'.repeat(64));
    expect(serialized).not.toContain('123456789');
    expect(serialized).not.toContain('77');
  });
});

describe('human context summary', () => {
  it('keeps a short, readable summary and never includes full history', () => {
    const summary = buildHumanContextSummary([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Good evening.' },
      { role: 'user', content: 'I want to discuss a collection.' },
    ]);

    expect(summary).toContain('Hello');
    expect(summary).toContain('Good evening.');
    expect(summary).toContain('I want to discuss a collection.');
    expect(summary!.length).toBeLessThanOrEqual(240);
  });

  it('returns null when there is no usable context', () => {
    expect(buildHumanContextSummary([])).toBeNull();
    expect(
      buildHumanContextSummary([{ role: 'system', content: 'hidden' }])
    ).toBeNull();
  });
});

describe('Telegram owner authorization', () => {
  it('accepts only the configured owner id', () => {
    const previous = process.env.PIERROT_OWNER_TELEGRAM_ID;
    process.env.PIERROT_OWNER_TELEGRAM_ID = '123456789';

    try {
      expect(getHumanOwnerTelegramId()).toBe(123456789);
      expect(isHumanOwnerTelegramUser(123456789)).toBe(true);
      expect(isHumanOwnerTelegramUser(987654321)).toBe(false);
      expect(isHumanOwnerTelegramUser('123456789')).toBe(false);
      expect(isHumanOwnerTelegramUser(undefined)).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.PIERROT_OWNER_TELEGRAM_ID;
      } else {
        process.env.PIERROT_OWNER_TELEGRAM_ID = previous;
      }
    }
  });
});
