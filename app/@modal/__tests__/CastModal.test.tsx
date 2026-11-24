import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CastModal from '@/app/@modal/(.)cast/page';
import { runTopTelegramBackHandler } from '@/lib/telegram/backHandler';

const back = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back }),
}));

jest.mock('@/lib/templeLogger', () => ({
  logTempleEvent: jest.fn(async () => true),
}));

jest.mock('@/app/cast/CastClient', () => ({
  __esModule: true,
  default: ({ variant }: { variant?: string }) => (
    <div data-testid="cast-experience">variant:{variant}</div>
  ),
}));

describe('Cast modal shell', () => {
  beforeEach(() => {
    back.mockClear();
    window.sessionStorage.clear();
    document.body.className = '';
  });

  it('renders one coherent dialog layer with the modal Cast variant', () => {
    const { container } = render(<CastModal />);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Cast ritual' })).toHaveAttribute(
      'aria-modal',
      'true'
    );
    expect(screen.getByTestId('cast-experience')).toHaveTextContent('variant:modal');
    expect(container.querySelector('.cast-page')).toBeNull();
    expect(container.querySelector('.temple-modal')).toBeTruthy();
    expect(container.querySelector('.temple-topbar')).toBeNull();
    expect(document.body).toHaveClass('ritual-modal-open');
  });

  it('closes from the shared header control and locks the page scroll', () => {
    render(<CastModal />);

    expect(document.body).toHaveClass('ritual-modal-open');

    fireEvent.click(screen.getByRole('button', { name: /Temple/i }));

    expect(back).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and Telegram BackButton through the same dialog', () => {
    render(<CastModal />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(back).toHaveBeenCalledTimes(1);

    expect(runTopTelegramBackHandler()).toBe(true);
    expect(back).toHaveBeenCalledTimes(2);
  });

  it('restores focus to the trigger when the modal unmounts', () => {
    const trigger = document.createElement('button');

    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<CastModal />);

    expect(screen.getByRole('dialog', { name: 'Cast ritual' })).toHaveFocus();

    unmount();

    expect(trigger).toHaveFocus();
    expect(document.body).not.toHaveClass('ritual-modal-open');

    trigger.remove();
  });

  it('never nests a second dialog inside the Cast experience', () => {
    const { container } = render(<CastModal />);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    const experience = screen.getByTestId('cast-experience');

    expect(experience.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelectorAll('.temple-modal')).toHaveLength(1);
  });
});
