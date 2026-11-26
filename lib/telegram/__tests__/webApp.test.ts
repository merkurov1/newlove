/** @jest-environment jsdom */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  detectTelegramCapabilities,
  hapticImpact,
  hapticNotification,
  isTelegramVersionAtLeast,
  parseTelegramVersion,
  resetHapticThrottle,
} from '../webApp';

function installTelegram(webApp: Record<string, unknown>) {
  (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: webApp };
}

beforeEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  resetHapticThrottle();
  window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as never;
});

describe('Telegram capability detection', () => {
  it('detects an ordinary browser without throwing', () => {
    expect(detectTelegramCapabilities()).toEqual({
      bottomButton: false,
      haptics: false,
      shareToStory: false,
      shareMessage: false,
      homeScreen: false,
      backButton: false,
      fullscreen: false,
    });
  });

  it('detects older clients with only some optional methods', () => {
    installTelegram({
      initData: 'signed',
      BottomButton: { show: jest.fn() },
      HapticFeedback: {},
      shareToStory: jest.fn(),
    });

    const capabilities = detectTelegramCapabilities();

    expect(capabilities.bottomButton).toBe(true);
    expect(capabilities.shareToStory).toBe(true);
    expect(capabilities.shareMessage).toBe(false);
    expect(capabilities.homeScreen).toBe(false);
    expect(capabilities.haptics).toBe(false);
  });

  it('recognises the documented MainButton as the native primary action', () => {
    installTelegram({
      initData: 'signed',
      MainButton: { show: jest.fn(), setParams: jest.fn() },
    });

    expect(detectTelegramCapabilities().bottomButton).toBe(true);
  });

  it('parses Telegram versions defensively', () => {
    expect(parseTelegramVersion('8.0')).toEqual([8, 0]);
    expect(parseTelegramVersion('7.10.3')).toEqual([7, 10]);
    expect(parseTelegramVersion(undefined)).toBeNull();
    expect(isTelegramVersionAtLeast('7.10', '7.2')).toBe(true);
    expect(isTelegramVersionAtLeast('6.9', '7.0')).toBe(false);
  });

  it('reports fullscreen support from requestFullscreen, not from ready()', () => {
    installTelegram({ ready: jest.fn() });

    expect(detectTelegramCapabilities().fullscreen).toBe(false);

    installTelegram({ ready: jest.fn(), requestFullscreen: jest.fn() });

    expect(detectTelegramCapabilities().fullscreen).toBe(true);
  });
});

describe('haptic guardrails', () => {
  it('no-ops outside Telegram', () => {
    expect(hapticImpact('vigil')).toBe(false);
    expect(hapticNotification('success')).toBe(false);
  });

  it('uses distinct impacts for ritual selection and Vigil', () => {
    const impactOccurred = jest.fn();
    installTelegram({ HapticFeedback: { impactOccurred } });

    expect(hapticImpact('ritual-select')).toBe(true);
    expect(impactOccurred).toHaveBeenLastCalledWith('light');

    resetHapticThrottle();

    expect(hapticImpact('vigil')).toBe(true);
    expect(impactOccurred).toHaveBeenLastCalledWith('medium');
  });

  it('throttles repeated identical events instead of vibrating on re-render', () => {
    const impactOccurred = jest.fn();
    installTelegram({ HapticFeedback: { impactOccurred } });

    expect(hapticImpact('vigil')).toBe(true);
    expect(hapticImpact('vigil')).toBe(false);
    expect(impactOccurred).toHaveBeenCalledTimes(1);
  });

  it('respects reduced motion and never throws on a partial SDK', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as never;
    const impactOccurred = jest.fn();
    installTelegram({ HapticFeedback: { impactOccurred } });

    expect(hapticImpact('vigil')).toBe(false);

    window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as never;
    resetHapticThrottle();

    installTelegram({
      HapticFeedback: {
        notificationOccurred: () => {
          throw new Error('unsupported');
        },
      },
    });

    expect(hapticNotification('success')).toBe(false);
  });
});
