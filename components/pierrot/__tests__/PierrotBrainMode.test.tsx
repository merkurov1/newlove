import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PierrotProvider, usePierrot } from '@/components/pierrot/PierrotContext';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/lobby',
}));

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'owner-1' },
    profile: { role: 'ADMIN' },
    roles: ['ADMIN'],
    isLoading: false,
  }),
}));

function Probe() {
  const { sendMessage, toggleUnframedMode, canShowBrainMode, isUnframedMode, messages } =
    usePierrot();

  return (
    <div>
      <span data-testid="unlocked">{String(canShowBrainMode)}</span>
      <span data-testid="mode">{String(isUnframedMode)}</span>
      <span data-testid="messages">{messages.map((message) => message.content).join(' | ')}</span>
      <span data-testid="actions">
        {messages
          .flatMap((message) => message.actions || [])
          .map((action) => action.label)
          .join(' | ')}
      </span>
      <button type="button" onClick={() => void sendMessage('включи мозг')}>
        phrase
      </button>
      <button type="button" onClick={toggleUnframedMode}>
        toggle
      </button>
    </div>
  );
}

describe('Pierrot Brain reveal', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem('pierrot_onboarding_v1', '1');
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('exposes Brain by default to a verified owner', async () => {
    render(
      <PierrotProvider>
        <Probe />
      </PierrotProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('unlocked')).toHaveTextContent('true');
      expect(screen.getByTestId('mode')).toHaveTextContent('true');
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows five example questions when Brain is toggled on', async () => {
    render(
      <PierrotProvider>
        <Probe />
      </PierrotProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('unlocked')).toHaveTextContent('true');
      expect(screen.getByTestId('mode')).toHaveTextContent('true');
    });

    // Brain starts on for the owner; turn it off and on to request the examples.
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));

    await waitFor(() => {
      expect(screen.getByTestId('mode')).toHaveTextContent('true');
      expect(screen.getByTestId('messages')).toHaveTextContent('Five questions worth starting with');
    });

    expect(screen.getByTestId('actions')).toHaveTextContent('Main themes');
    expect(screen.getByTestId('actions')).toHaveTextContent('Connections');
    expect(screen.getByTestId('actions')).toHaveTextContent('Contradictions');
    expect(screen.getByTestId('actions')).toHaveTextContent('My position');
    expect(screen.getByTestId('actions')).toHaveTextContent('Open questions');
  });
});
