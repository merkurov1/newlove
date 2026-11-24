import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { runTopTelegramBackHandler } from '@/lib/telegram/backHandler';
import AbsolutionModal from '../AbsolutionModal';

const back = jest.fn();
const logTempleEvent = jest.fn(async () => true);

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back }),
}));

jest.mock('@/lib/templeLogger', () => ({
  logTempleEvent: (...args: unknown[]) => logTempleEvent(...args),
}));

jest.mock('@/app/absolution/AbsolutionClient', () => ({
  __esModule: true,
  default: ({ variant }: { variant?: string }) => (
    <div data-testid="absolution-experience">variant:{variant}</div>
  ),
}));

describe('dedicated compact Absolution modal', () => {
  let scrollTo: jest.Mock;
  const originalScrollTo = window.scrollTo;

  beforeEach(() => {
    back.mockClear();
    logTempleEvent.mockClear();
    window.sessionStorage.clear();
    document.body.className = '';
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 240,
    });
    scrollTo = jest.fn();
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollTo,
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: originalScrollTo,
    });
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    });
  });

  it('renders a compact dialog over the Temple and passes the modal variant', () => {
    const { container } = render(<AbsolutionModal />);

    expect(
      screen.getByRole('dialog', { name: 'Absolution' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('absolution-experience')).toHaveTextContent(
      'variant:modal'
    );
    expect(container.querySelector('.absolution-modal__dialog')).toBeTruthy();
    expect(container.querySelector('.temple-modal')).toBeNull();
    expect(screen.getByRole('link', { name: /Full page/ })).toHaveAttribute(
      'href',
      '/absolution'
    );
  });

  it('closes from the close control and restores focus and scroll position', async () => {
    const trigger = document.createElement('button');

    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<AbsolutionModal />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Close Absolution' })
      ).toHaveFocus()
    );

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body).toHaveClass('absolution-modal-open');

    fireEvent.click(
      screen.getByRole('button', { name: 'Close Absolution' })
    );

    expect(back).toHaveBeenCalledTimes(1);

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.body).not.toHaveClass('absolution-modal-open');
    expect(trigger).toHaveFocus();
    expect(scrollTo).toHaveBeenCalledWith(0, 240);

    trigger.remove();
  });

  it('closes on Escape and Telegram Back', () => {
    const { unmount } = render(<AbsolutionModal />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(back).toHaveBeenCalledTimes(1);

    expect(runTopTelegramBackHandler()).toBe(true);
    expect(back).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('closes only when the backdrop itself is pressed', () => {
    const { container, unmount } = render(<AbsolutionModal />);

    const overlay = container.querySelector('.absolution-modal') as HTMLElement;
    const dialog = screen.getByRole('dialog', { name: 'Absolution' });

    fireEvent.mouseDown(dialog);
    expect(back).not.toHaveBeenCalled();

    fireEvent.mouseDown(overlay);
    expect(back).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('keeps Tab focus inside the compact dialog', async () => {
    const { unmount } = render(<AbsolutionModal />);
    const dialog = screen.getByRole('dialog', { name: 'Absolution' });

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Close Absolution' })
      ).toHaveFocus()
    );

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    unmount();
  });
});
