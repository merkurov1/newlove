import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { runTopTelegramBackHandler } from '@/lib/telegram/backHandler';
import TempleTributeModal from '../TempleTributeModal';

jest.mock('@/app/tribute/TributeExperience', () => ({
  __esModule: true,
  default: ({
    embedded,
    initialAmount,
  }: {
    embedded?: boolean;
    initialAmount?: number;
  }) => (
    <div data-testid="tribute-experience">
      embedded:{String(embedded)} amount:{String(initialAmount)}
    </div>
  ),
}));

describe('in-place Temple Tribute modal', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('passes the explicitly selected amount into the payment journey', () => {
    render(<TempleTributeModal initialAmount={5} onClose={jest.fn()} />);

    expect(screen.getByTestId('tribute-experience')).toHaveTextContent(
      'embedded:true amount:5'
    );
  });

  it('returns through Telegram Back without leaving the Temple URL', () => {
    const onClose = jest.fn();
    const { unmount } = render(
      <TempleTributeModal initialAmount={20} onClose={onClose} />
    );

    expect(screen.getByRole('dialog', { name: 'Tribute' })).toBeInTheDocument();
    expect(runTopTelegramBackHandler()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('closes on Escape, from the close control and restores scroll', () => {
    const onClose = jest.fn();
    const { unmount } = render(
      <TempleTributeModal initialAmount={20} onClose={onClose} />
    );

    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close Tribute' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('restores focus to the trigger when the panel unmounts', async () => {
    const trigger = document.createElement('button');
    const onClose = jest.fn();

    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <TempleTributeModal onClose={onClose} />
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Close Tribute' })
      ).toHaveFocus()
    );

    unmount();

    expect(trigger).toHaveFocus();

    trigger.remove();
  });

  it('keeps Tab focus inside the panel', async () => {
    render(<TempleTributeModal onClose={jest.fn()} />);

    const close = screen.getByRole('button', { name: 'Close Tribute' });

    await waitFor(() => expect(close).toHaveFocus());

    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[aria-labelledby="temple-tribute-title"] a[href], [aria-labelledby="temple-tribute-title"] button:not([disabled])'
      )
    );

    expect(focusable.length).toBeGreaterThan(0);

    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(close).toHaveFocus();
  });
});
