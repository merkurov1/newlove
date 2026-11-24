import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AbsolutionClient from '@/app/absolution/AbsolutionClient';

const logTempleEvent = jest.fn(async () => false);

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => ({ user: null, profile: null }),
}));

jest.mock('@/lib/templeLogger', () => ({
  logTempleEvent: (...args: unknown[]) => logTempleEvent(...args),
}));

describe('Absolution ceremony and trace status', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    logTempleEvent.mockClear();
    logTempleEvent.mockResolvedValue(false);
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('completes the ceremony but never claims a trace when the write failed', async () => {
    render(<AbsolutionClient />);

    fireEvent.click(
      screen.getByRole('button', { name: /RECEIVE ABSOLUTION/i })
    );

    expect(logTempleEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'ABSOLUTION' })
    );

    await act(async () => {
      jest.advanceTimersByTime(2100);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        screen.getByText(/trace could not be recorded/i)
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText(/Temple trace recorded/i)
    ).not.toBeInTheDocument();
  });

  it('clears ceremony timers when the ritual closes', () => {
    const { unmount } = render(<AbsolutionClient />);

    fireEvent.click(
      screen.getByRole('button', { name: /RECEIVE ABSOLUTION/i })
    );

    expect(jest.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(jest.getTimerCount()).toBe(0);
  });
});
