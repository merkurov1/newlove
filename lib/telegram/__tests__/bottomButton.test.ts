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

/**
 * Shape of the real `WebApp.MainButton` exposed by the official SDK. It has
 * no `BottomButton` sibling, which is what production Telegram actually sends.
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
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  resetBottomButtonOwnership();
});

describe('Telegram BottomButton lifecycle', () => {
  it('reports unsupported when the client lacks the native button', () => {
    expect(isTelegramBottomButtonSupported()).toBe(false);
    expect(acquireBottomButton(Symbol('a'), { text: 'WRITE', visible: true, onClick: jest.fn() })).toBeNull();
  });

  it('uses the real MainButton API exposed by Telegram', () => {
    const button = installMainButton();

    expect(isTelegramBottomButtonSupported()).toBe(true);

    const onClick = jest.fn();
    const controller = acquireBottomButton(Symbol('vigil'), {
      text: 'SEND SPARK',
      visible: true,
      enabled: true,
      onClick,
    });

    expect(controller).not.toBeNull();
    expect(button.setParams).toHaveBeenLastCalledWith({
      text: 'SEND SPARK',
      is_active: true,
      is_visible: true,
    });

    const handler = button.onClick.mock.calls[0][0] as () => void;
    handler();
    expect(onClick).toHaveBeenCalledTimes(1);

    controller?.update({
      text: 'SPARK RETURNS IN 1H',
      visible: true,
      enabled: false,
      onClick,
    });
    expect(button.setParams).toHaveBeenLastCalledWith({
      text: 'SPARK RETURNS IN 1H',
      is_active: false,
      is_visible: true,
    });

    controller?.dispose();
    expect(button.offClick).toHaveBeenCalledWith(handler);
    expect(button.hide).toHaveBeenCalled();
  });

  it('prefers MainButton when a client exposes both names', () => {
    const main = {
      show: jest.fn(),
      hide: jest.fn(),
      setParams: jest.fn(),
      onClick: jest.fn(),
      offClick: jest.fn(),
    };
    const bottom = {
      show: jest.fn(),
      hide: jest.fn(),
      setParams: jest.fn(),
      onClick: jest.fn(),
      offClick: jest.fn(),
    };

    (window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: { initData: 'signed', MainButton: main, BottomButton: bottom },
    };

    const controller = acquireBottomButton(Symbol('vigil'), {
      text: 'SEND SPARK',
      visible: true,
      onClick: jest.fn(),
    });

    expect(controller).not.toBeNull();
    expect(main.setParams).toHaveBeenCalled();
    expect(bottom.setParams).not.toHaveBeenCalled();
  });

  it('falls back to granular methods when setParams is missing', () => {
    const button = {
      show: jest.fn(),
      hide: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
      setText: jest.fn(),
      onClick: jest.fn(),
      offClick: jest.fn(),
    };

    (window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: { initData: 'signed', MainButton: button },
    };

    const controller = acquireBottomButton(Symbol('vigil'), {
      text: 'SEND SPARK',
      visible: true,
      enabled: false,
      onClick: jest.fn(),
    });

    expect(controller).not.toBeNull();
    expect(button.setText).toHaveBeenLastCalledWith('SEND SPARK');
    expect(button.disable).toHaveBeenCalled();
    expect(button.show).toHaveBeenCalled();

    controller?.update({
      text: 'SEND SPARK',
      visible: false,
      enabled: true,
      onClick: jest.fn(),
    });

    expect(button.hide).toHaveBeenCalled();
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
