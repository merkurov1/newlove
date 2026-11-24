/** @jest-environment jsdom */

import { describe, expect, it } from '@jest/globals';

import {
  HOME_SCREEN_PROMPT_COOLDOWN_MS,
  normalizeHomeScreenStatus,
  resolveHomeScreenPrompt,
} from '../homeScreen';
import { resolveTelegramChrome } from '../chrome';
import { readGroupContextHint } from '../groupContextHint';

describe('Home Screen prompt', () => {
  it('never prompts outside Telegram or when unsupported', () => {
    expect(
      resolveHomeScreenPrompt({ isTelegram: false, supported: true, status: 'promptable' })
    ).toBe('hide');
    expect(
      resolveHomeScreenPrompt({ isTelegram: true, supported: false, status: 'promptable' })
    ).toBe('unsupported');
    expect(
      resolveHomeScreenPrompt({ isTelegram: true, supported: true, status: 'unsupported' })
    ).toBe('unsupported');
  });

  it('does not nag when already added, unknown or recently dismissed', () => {
    expect(
      resolveHomeScreenPrompt({ isTelegram: true, supported: true, status: 'added' })
    ).toBe('already-added');
    expect(
      resolveHomeScreenPrompt({ isTelegram: true, supported: true, status: 'unknown' })
    ).toBe('hide');
    expect(
      resolveHomeScreenPrompt({
        isTelegram: true,
        supported: true,
        status: 'promptable',
        dismissedAtMs: 1_000,
        nowMs: 1_000 + HOME_SCREEN_PROMPT_COOLDOWN_MS - 1,
      })
    ).toBe('hide');
    expect(normalizeHomeScreenStatus('nonsense')).toBe('unknown');
  });

  it('offers after the cooldown for a promptable client', () => {
    expect(
      resolveHomeScreenPrompt({
        isTelegram: true,
        supported: true,
        status: 'promptable',
        dismissedAtMs: 1_000,
        nowMs: 1_000 + HOME_SCREEN_PROMPT_COOLDOWN_MS + 1,
      })
    ).toBe('offer');
  });
});

describe('route-scoped Telegram chrome', () => {
  it('uses the Temple light palette on Temple and Flow routes', () => {
    for (const path of ['/temple', '/vigil', '/heartandangel/world', '/flow', '/flow/a-post']) {
      expect(resolveTelegramChrome(path).tone).toBe('temple');
      expect(resolveTelegramChrome(path).colors.background).toBe('#FAF8F5');
    }
  });

  it('leaves unrelated routes on their own chrome', () => {
    expect(resolveTelegramChrome('/admin').tone).toBe('default');
    expect(resolveTelegramChrome('/').colors.background).toBe('#141210');
  });
});

describe('group context UI hint', () => {
  it('detects a signed group launch without treating it as auth', () => {
    const initData = new URLSearchParams({
      chat_type: 'supergroup',
      chat_instance: '1234567890',
      chat: JSON.stringify({ id: -100123, title: 'The Vigil' }),
    }).toString();

    expect(readGroupContextHint(initData)).toEqual({
      available: true,
      chatType: 'supergroup',
      title: 'The Vigil',
    });
  });

  it('returns unavailable for DM, malformed and empty payloads', () => {
    expect(readGroupContextHint('')).toMatchObject({ available: false });
    expect(
      readGroupContextHint(new URLSearchParams({ chat_type: 'private' }).toString())
    ).toMatchObject({ available: false });
    expect(readGroupContextHint('%%%not-query')).toMatchObject({ available: false });
  });
});
