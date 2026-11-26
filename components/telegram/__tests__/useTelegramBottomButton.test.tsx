/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { useTelegramBottomButton } from '../useTelegramBottomButton';
import {
  acquireBottomButton,
  resetBottomButtonOwnership,
} from '@/lib/telegram/bottomButton';

function installBottomButton() {
  const button = {
    show: jest.fn(),
    hide: jest.fn(),
    setText: jest.fn(),
    setParams: jest.fn(),
    onClick: jest.fn(),
    offClick: jest.fn(),
  };

  (window as unknown as { Telegram?: unknown }).Telegram = {
    WebApp: { initData: 'signed', BottomButton: button },
  };

  return button;
}

/**
 * The official Telegram SDK only exposes `MainButton`. This is the shape a
 * real Mini App sees after a late SDK load.
 */
function installMainButton() {
  const button = {
    isVisible: false,
    isActive: false,
    show: jest.fn(),
    hide: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    setText: jest.fn(),
    setParams: jest.fn(),
    onClick: jest.fn(),
    offClick: jest.fn(),
  };

  (window as unknown as { Telegram?: unknown }).Telegram = {
    WebApp: { initData: 'signed', MainButton: button },
  };

  return button;
}

beforeEach(() => {
  jest.useFakeTimers();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  resetBottomButtonOwnership();
});

afterEach(() => {
  jest.useRealTimers();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  resetBottomButtonOwnership();
});

describe('useTelegramBottomButton', () => {
  it('acquires the native button after a late Telegram SDK load', () => {
    const onClick = jest.fn();
    const { result } = renderHook(() =>
      useTelegramBottomButton({
        text: 'SEND SPARK',
        visible: true,
        enabled: true,
        onClick,
      })
    );

    expect(result.current).toBe(false);

    const button = installBottomButton();

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(result.current).toBe(true);
    expect(button.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: 'SEND SPARK',
        is_active: true,
        is_visible: true,
      })
    );

    const handler = button.onClick.mock.calls[0][0] as () => void;
    handler();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('acquires the real MainButton after a late Telegram SDK load', () => {
    const onClick = jest.fn();
    const { result } = renderHook(() =>
      useTelegramBottomButton({
        text: 'SEND SPARK',
        visible: true,
        enabled: true,
        onClick,
      })
    );

    expect(result.current).toBe(false);

    const button = installMainButton();

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(result.current).toBe(true);
    expect(button.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: 'SEND SPARK',
        is_active: true,
        is_visible: true,
      })
    );

    const handler = button.onClick.mock.calls[0][0] as () => void;
    handler();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps retrying until another mounted route owner releases the button', () => {
    const button = installBottomButton();
    const firstOwner = acquireBottomButton(Symbol('temple'), {
      text: 'KEEP THE VIGIL',
      visible: true,
      onClick: jest.fn(),
    });
    const onClick = jest.fn();
    const { result } = renderHook(() =>
      useTelegramBottomButton({
        text: 'SEND SPARK',
        visible: true,
        enabled: true,
        onClick,
      })
    );

    expect(firstOwner).not.toBeNull();
    expect(result.current).toBe(false);

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(result.current).toBe(false);

    act(() => {
      firstOwner?.dispose();
      jest.advanceTimersByTime(600);
    });

    expect(result.current).toBe(true);

    const handler = button.onClick.mock.calls.at(-1)?.[0] as () => void;
    handler();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('removes the native handler and hides the button on unmount', () => {
    const button = installBottomButton();
    const { result, unmount } = renderHook(() =>
      useTelegramBottomButton({
        text: 'SEND SPARK',
        visible: true,
        onClick: jest.fn(),
      })
    );

    expect(result.current).toBe(true);

    const handler = button.onClick.mock.calls[0][0] as () => void;

    unmount();

    expect(button.offClick).toHaveBeenCalledWith(handler);
    expect(button.hide).toHaveBeenCalled();
  });
});
