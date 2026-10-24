/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { PUBLIC_TELEGRAM_CASES, getPublicTelegramCase } from '../public-cases';
import type { PublicTelegramCase } from '../public-case';

const FORBIDDEN_KEYS = new Set([
  'chatId',
  'userId',
  'sourceMessageIds',
  'evidenceMessageIds',
  'replyToId',
  'fromId',
  'raw',
  'raw_json',
  'corpus',
  'corpusFile',
]);

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }

  return keys;
}

function expectSanitized(item: PublicTelegramCase) {
  const keys = collectKeys(item);
  for (const key of keys) {
    expect(FORBIDDEN_KEYS.has(key)).toBe(false);
  }

  expect(item.privacy.containsRawMessages).toBe(false);
  expect(item.chat.username).not.toMatch(/^\d+$/);
  expect(item.completeness.status).toMatch(/^(complete|partial|incomplete|failed)$/);
  expect(item.export.pages).toBeGreaterThan(0);
  expect(item.totals.messages).toBeGreaterThan(0);
  expect(item.participants.map((participant) => participant.key).sort()).toEqual(['peer', 'self']);
}

describe('PUBLIC_TELEGRAM_CASES', () => {
  it('keeps research cases separate and addressable by their own slug', () => {
    const slugs = PUBLIC_TELEGRAM_CASES.map((item) => item.slug);

    expect(slugs).toContain('vorobievaya');
    expect(new Set(slugs).size).toBe(slugs.length);

    const vorobievaya = getPublicTelegramCase('vorobievaya');
    const baartello = getPublicTelegramCase('baartello');

    expect(vorobievaya?.slug).toBe('vorobievaya');
    expect(getPublicTelegramCase('unknown')).toBeNull();

    // The second report is intentionally local-only. When it exists, it must
    // remain a separate case with its own data.
    if (baartello) {
      expect(baartello.slug).toBe('baartello');
      expect(baartello.chat.username).not.toBe(vorobievaya?.chat.username);
      expect(baartello.totals.messages).not.toBe(vorobievaya?.totals.messages);
    }
  });

  it('does not expose raw message identifiers or Telegram IDs in any case', () => {
    for (const item of PUBLIC_TELEGRAM_CASES) {
      expectSanitized(item);
    }
  });

  it('reports completeness and LLM status from each case independently', () => {
    for (const item of PUBLIC_TELEGRAM_CASES) {
      expect(item.completeness.status).toMatch(/^(complete|partial|incomplete|failed)$/);
      expect(item.export.pages).toBeGreaterThan(0);
      expect(item.totals.messages).toBeGreaterThan(0);

      if (item.deepseek) {
        expect(item.deepseek.status).toMatch(/^(complete|partial|failed|planned|unknown)$/);
        expect(item.deepseek.model).toBeTruthy();
      }
    }
  });
});
