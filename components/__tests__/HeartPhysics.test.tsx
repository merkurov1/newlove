import React from 'react';
import { act, render, screen } from '@testing-library/react';
import HeartPhysics from '../HeartPhysics';

const logTempleEvent = jest.fn(async () => true);

jest.mock('@/lib/templeLogger', () => ({
  logTempleEvent: (...args: unknown[]) => logTempleEvent(...args),
}));

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null }),
}));

jest.mock('@/hooks/useTempleIdentity', () => ({
  __esModule: true,
  default: () => ({
    displayName: '',
    source: null,
    status: 'anonymous',
    initDataPending: false,
    isLoading: false,
    error: null,
    isTelegram: false,
    refresh: async () => false,
  }),
}));

jest.mock('@/components/TempleTopBar', () => ({
  __esModule: true,
  default: () => <div data-testid="temple-top-bar" />,
}));

jest.mock('@/components/temple/useRitualModalTimer', () => ({
  useRitualModalTimer: jest.fn(),
}));

const canvasContext = {
  clearRect: jest.fn(),
  setTransform: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  quadraticCurveTo: jest.fn(),
  stroke: jest.fn(),
  save: jest.fn(),
  translate: jest.fn(),
  rotate: jest.fn(),
  drawImage: jest.fn(),
  restore: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
};

beforeEach(() => {
  jest.useFakeTimers();
  logTempleEvent.mockClear();
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D);
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Keep Calm completion', () => {
  it('does not record an early exit', () => {
    const { unmount } = render(<HeartPhysics />);

    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    unmount();

    expect(logTempleEvent).not.toHaveBeenCalled();
  });

  it('records the ritual once the shared threshold is reached', () => {
    const { unmount } = render(<HeartPhysics />);

    expect(screen.getByTestId('calm-completion-status')).toHaveTextContent(
      /Stay with the heart for 30 seconds/
    );
    expect(screen.getByTestId('calm-completion-status')).toHaveAttribute('data-complete', 'false');

    act(() => {
      jest.advanceTimersByTime(29_000);
    });

    expect(logTempleEvent).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(logTempleEvent).toHaveBeenCalledTimes(1);
    expect(logTempleEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'MEDITATION',
        metadata: { durationSeconds: 30 },
      })
    );
    expect(screen.getByTestId('calm-completion-status')).toHaveAttribute('data-complete', 'true');

    unmount();

    expect(logTempleEvent).toHaveBeenCalledTimes(1);
  });
});
