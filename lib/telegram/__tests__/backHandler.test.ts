/** @jest-environment node */

import {
  hasTelegramBackHandler,
  registerTelegramBackHandler,
  runTopTelegramBackHandler,
  subscribeTelegramBackHandlers,
} from '@/lib/telegram/backHandler';

describe('Telegram back handler stack', () => {
  it('lets the newest overlay consume BackButton first and cleans up', () => {
    const first = jest.fn(() => true);
    const second = jest.fn(() => true);

    const removeFirst = registerTelegramBackHandler(first);
    const removeSecond = registerTelegramBackHandler(second);

    expect(hasTelegramBackHandler()).toBe(true);
    expect(runTopTelegramBackHandler()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    removeSecond();
    expect(runTopTelegramBackHandler()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);

    removeFirst();
    expect(hasTelegramBackHandler()).toBe(false);
    expect(runTopTelegramBackHandler()).toBe(false);
  });

  it('notifies subscribers when overlay handlers change', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeTelegramBackHandlers(listener);
    const remove = registerTelegramBackHandler(() => true);

    expect(listener).toHaveBeenCalledTimes(1);

    remove();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
