import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import FlowHomeScreenPrompt from '../FlowHomeScreenPrompt';

jest.mock('@/components/useIsTelegram', () => ({
  __esModule: true,
  default: () => true,
}));

type TestWindow = Window & {
  Telegram?: { WebApp: Record<string, unknown> };
};

const checkHomeScreenStatus = jest.fn((callback?: (status: string) => void) => {
  callback?.('promptable');
});
const addToHomeScreen = jest.fn((callback?: (status: string) => void) => {
  callback?.('added');
});

function resolvePrompt() {
  act(() => {
    jest.advanceTimersByTime(400);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  window.localStorage.clear();
  checkHomeScreenStatus.mockClear();
  addToHomeScreen.mockClear();
  (window as TestWindow).Telegram = {
    WebApp: { checkHomeScreenStatus, addToHomeScreen },
  };
});

afterEach(() => {
  jest.useRealTimers();
  delete (window as TestWindow).Telegram;
});

describe('FlowHomeScreenPrompt', () => {
  it('offers Flow discreetly only when Telegram supports it', () => {
    render(<FlowHomeScreenPrompt className="flow-home-screen--feed" />);

    expect(screen.queryByText('Add to Home Screen')).toBeNull();

    resolvePrompt();

    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
    expect(screen.getByText('Keep Flow one tap away.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('only invokes the native Add API on request and confirms via its callback', () => {
    render(<FlowHomeScreenPrompt />);
    resolvePrompt();

    expect(addToHomeScreen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(addToHomeScreen).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('temple_home_screen_dismissed_at')).not.toBeNull();
  });

  it('remembers a dismissal instead of nagging', () => {
    window.localStorage.setItem('temple_home_screen_dismissed_at', String(Date.now()));

    render(<FlowHomeScreenPrompt />);
    resolvePrompt();

    expect(screen.queryByText('Add to Home Screen')).toBeNull();
  });

  it('stays absent when the API is missing or unsupported', () => {
    (window as TestWindow).Telegram = { WebApp: {} };
    const missing = render(<FlowHomeScreenPrompt />);
    resolvePrompt();

    expect(missing.container.textContent).toBe('');

    missing.unmount();

    (window as TestWindow).Telegram = {
      WebApp: { addToHomeScreen },
    };

    const partial = render(<FlowHomeScreenPrompt />);
    resolvePrompt();

    expect(partial.container.textContent).toBe('');
    expect(addToHomeScreen).not.toHaveBeenCalled();
  });
});
