import { act, fireEvent, render, screen } from '@testing-library/react';
import RitualModal from '@/components/temple/RitualModal';
import { useRitualModalTimer } from '@/components/temple/useRitualModalTimer';

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

  it('keeps the first timer label published by a child ritual', () => {
    function TimerChild() {
      useRitualModalTimer('❤️ 2');

      return <div>Counter child</div>;
    }

    render(
      <RitualModal title="Let It Go" canonicalPath="/heartandangel/letitgo" scene>
        <TimerChild />
      </RitualModal>
    );

    expect(screen.getByText('❤️ 2')).toBeInTheDocument();
  });

  it('uses a non-scrolling scene slot for immersive rituals', () => {
    const { container } = render(
      <RitualModal
        title="Keep Calm"
        canonicalPath="/heartandangel/calm"
        scene
      >
        <div>Scene</div>
      </RitualModal>
    );

    const content = container.querySelector('.temple-modal__content');

    expect(content).toHaveClass('temple-modal__content--scene');
    expect(content).toHaveAttribute('data-ritual-scene', 'immersive');
  });

  it('keeps scrollable rituals in the scroll slot', () => {
    const { container } = render(
      <RitualModal title="Cast" canonicalPath="/cast">
        <div>Long ritual</div>
      </RitualModal>
    );

    const content = container.querySelector('.temple-modal__content');

    expect(content).not.toHaveClass('temple-modal__content--scene');
    expect(content).toHaveAttribute('data-ritual-scene', 'scroll');
  });

  it('restores focus to the trigger after unmount', () => {
    const trigger = document.createElement('button');

    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <RitualModal title="Cast" canonicalPath="/cast">
        <div>Shared ritual</div>
      </RitualModal>
    );

    expect(screen.getByRole('dialog')).toHaveFocus();

    unmount();

    expect(trigger).toHaveFocus();

    trigger.remove();
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
