import React from 'react';
import { render, screen } from '@testing-library/react';
import HomeOverview from '../HomeOverview';

describe('owner home overview', () => {
  it('renders one editorial statement and no dashboard copy', async () => {
    const { container } = render(<HomeOverview sessionId="session-1" />);

    const statement = await screen.findByText('Structure is the antidote to chaos.');
    expect(statement).toBeTruthy();
    expect(container.textContent?.trim()).toBe('Structure is the antidote to chaos.');
    expect(container.querySelectorAll('.pw-home-indicator')).toHaveLength(0);
    expect(container.querySelectorAll('.pw-status-row')).toHaveLength(0);
    expect(screen.queryByText('О чём поговорим?')).toBeNull();
    expect(screen.queryByText(/Память и Flow открываются слева/)).toBeNull();
  });

  it('shows the statement in a new session and not when disabled by reduced motion', async () => {
    const matchMedia = jest.fn().mockReturnValue({ matches: true });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: matchMedia,
    });

    render(<HomeOverview sessionId="session-reduced" />);

    expect(await screen.findByText('Structure is the antidote to chaos.')).toBeTruthy();
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});
