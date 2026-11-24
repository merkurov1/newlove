import { act, fireEvent, render, screen } from '@testing-library/react';
import RitualModal from '@/components/temple/RitualModal';

const back = jest.fn();
const logTempleEvent = jest.fn(async () => true);

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back }),
}));

jest.mock('@/lib/templeLogger', () => ({
  logTempleEvent: (...args: unknown[]) => logTempleEvent(...args),
}));

describe('RitualModal shell', () => {
  beforeEach(() => {
    back.mockClear();
    logTempleEvent.mockClear();
    window.sessionStorage.clear();
    document.body.className = '';
  });

  it('closes on Escape, locks scroll and restores the body on unmount', () => {
    const { unmount } = render(
      <RitualModal title="Vigil" canonicalPath="/vigil">
        <div>Shared ritual</div>
      </RitualModal>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Shared ritual')).toBeInTheDocument();
    expect(document.body).toHaveClass('ritual-modal-open');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(back).toHaveBeenCalledTimes(1);

    unmount();

    expect(document.body).not.toHaveClass('ritual-modal-open');
    expect(window.sessionStorage.length).toBeGreaterThan(0);
    expect(logTempleEvent).not.toHaveBeenCalled();
  });

  it('renders the ritual timer published by the shared experience', () => {
    render(
      <RitualModal title="Vigil" canonicalPath="/vigil">
        <div>Shared ritual</div>
      </RitualModal>
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent('temple:ritual-timer', {
          detail: '5h 12m remaining',
        })
      );
    });

    expect(screen.getByText('5h 12m remaining')).toBeInTheDocument();
  });

  it('links the remaining rituals to their canonical full pages', () => {
    render(
      <RitualModal title="Cast" canonicalPath="/cast">
        <div>Shared ritual</div>
      </RitualModal>
    );

    expect(
      screen.getByRole('link', { name: /Full page/ })
    ).toHaveAttribute('href', '/cast');
    expect(
      screen.getByRole('link', { name: 'Calm' })
    ).toHaveAttribute('href', '/heartandangel/calm');
    expect(
      screen.getByRole('link', { name: 'Let It Go' })
    ).toHaveAttribute('href', '/heartandangel/letitgo');
    expect(
      screen.getByRole('link', { name: 'Absolution' })
    ).toHaveAttribute('href', '/absolution');
    expect(
      screen.queryByRole('link', { name: 'Vigil' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Tribute' })
    ).not.toBeInTheDocument();
  });
});
