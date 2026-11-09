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

  it('renders a new session statement immediately without motion gating', async () => {
    render(<HomeOverview sessionId="session-new" />);

    expect(screen.getByText('Structure is the antidote to chaos.')).toBeTruthy();
  });
});
