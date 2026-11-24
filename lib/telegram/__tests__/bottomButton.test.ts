/** @jest-environment jsdom */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  acquireBottomButton,
  isTelegramBottomButtonSupported,
  resetBottomButtonOwnership,
} from '../bottomButton';

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

beforeEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  resetBottomButtonOwnership();
});

describe('Telegram BottomButton lifecycle', () => {
  it('reports unsupported when the client lacks the native button', () => {
    expect(isTelegramBottomButtonSupported()).toBe(false);
    expect(acquireBottomButton(Symbol('a'), { text: 'WRITE', visible: true, onClick: jest.fn() })).toBeNull();
  });

  it('shows, relabels, disables and hides with the route state', () => {
    const button = installBottomButton();
    const controller = acquireBottomButton(Symbol('temple'), {
      text: 'KEEP THE VIGIL',
      visible: true,
      onClick: jest.fn(),
    });

    expect(controller).not.toBeNull();
    expect(button.setParams).toHaveBeenLastCalledWith({
      text: 'KEEP THE VIGIL',
      is_active: true,
      is_visible: true,
    });

    controller?.update({ text: 'SUPPORT THE TEMPLE', visible: true, enabled: false, onClick: jest.fn() });
    expect(button.setParams).toHaveBeenLastCalledWith({
      text: 'SUPPORT THE TEMPLE',
      is_active: false,
      is_visible: true,
    });

    controller?.update({ text: 'SUPPORT THE TEMPLE', visible: false, onClick: jest.fn() });
    expect(button.setParams).toHaveBeenLastCalledWith({
      text: 'SUPPORT THE TEMPLE',
      is_active: true,
      is_visible: false,
    });
  });

  it('allows only one owner and cleanly unregisters its handler', () => {
    const button = installBottomButton();
    const firstClick = jest.fn();
    const secondClick = jest.fn();
    const first = acquireBottomButton(Symbol('temple'), {
      text: 'KEEP THE VIGIL',
      visible: true,
      onClick: firstClick,
    });
    const second = acquireBottomButton(Symbol('flow'), {
      text: 'WRITE',
      visible: true,
      onClick: secondClick,
    });

    expect(second).toBeNull();
    expect(button.onClick).toHaveBeenCalledTimes(1);

    const handler = button.onClick.mock.calls[0][0] as () => void;
    handler();
    expect(firstClick).toHaveBeenCalledTimes(1);
    expect(secondClick).not.toHaveBeenCalled();

    first?.dispose();
    expect(button.offClick).toHaveBeenCalledWith(handler);
    expect(button.hide).toHaveBeenCalled();

    handler();
    expect(firstClick).toHaveBeenCalledTimes(1);

    const third = acquireBottomButton(Symbol('flow'), {
      text: 'WRITE',
      visible: true,
      onClick: secondClick,
    });
    expect(third).not.toBeNull();

    third?.dispose();
  });

  it('never fires the action while hidden or disabled', () => {
    const button = installBottomButton();
    const onClick = jest.fn();
    const controller = acquireBottomButton(Symbol('a'), {
      text: 'WRITE',
      visible: false,
      onClick,
    });
    const handler = button.onClick.mock.calls[0][0] as () => void;

    handler();
    expect(onClick).not.toHaveBeenCalled();

    controller?.update({ text: 'WRITE', visible: true, enabled: false, onClick });
    handler();
    expect(onClick).not.toHaveBeenCalled();

    controller?.update({ text: 'WRITE', visible: true, enabled: true, onClick });
    handler();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
