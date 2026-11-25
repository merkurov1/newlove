import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import AddToHomePrompt from '../AddToHomePrompt';

jest.mock('@/components/useIsTelegram', () => ({
  __esModule: true,
  default: () => true,
}));

type TestWindow = Window & {
  Telegram?: {
    WebApp: Record<string, unknown>;
  };
};

const checkHomeScreenStatus = jest.fn((callback?: (status: string) => void) => {
  callback?.('promptable');
});
const addToHomeScreen = jest.fn((callback?: (status: string) => void) => {
  callback?.('added');
});

function resolvePrompt() {
  act(() => {
    jest.advanceTimersByTime(2600);
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

describe('AddToHomePrompt', () => {
  it('renders as a small named group only when the client can offer it', () => {
    render(<AddToHomePrompt className="temple-home-hint" />);

    expect(screen.queryByTestId('add-to-home-group')).toBeNull();

    resolvePrompt();

    const group = screen.getByTestId('add-to-home-group');

    expect(group).toHaveClass('temple-home-hint');
    expect(screen.getByText('Add to Home')).toBeInTheDocument();
    expect(screen.getByText('Keep the Temple one tap away.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('dismisses the hint and remembers the quiet cooldown', () => {
    render(<AddToHomePrompt />);

    resolvePrompt();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByTestId('add-to-home-group')).toBeNull();
    expect(
      window.localStorage.getItem('temple_home_screen_dismissed_at')
    ).not.toBeNull();
  });
});
