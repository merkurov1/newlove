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

  it('reveals the Brain control only after the owner phrase', async () => {
    render(
      <PierrotProvider>
        <Probe />
      </PierrotProvider>
    );

    expect(screen.getByTestId('unlocked')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'phrase' }));

    await waitFor(() => {
      expect(screen.getByTestId('unlocked')).toHaveTextContent('true');
      expect(screen.getByTestId('messages')).toHaveTextContent('Мозг доступен');
    });

    expect(screen.getByTestId('mode')).toHaveTextContent('false');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows five example questions when the Brain control is pressed', async () => {
    render(
      <PierrotProvider>
        <Probe />
      </PierrotProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'phrase' }));

    await waitFor(() => {
      expect(screen.getByTestId('unlocked')).toHaveTextContent('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));

    await waitFor(() => {
      expect(screen.getByTestId('mode')).toHaveTextContent('true');
      expect(screen.getByTestId('messages')).toHaveTextContent('Пять вопросов');
    });

    expect(screen.getByTestId('actions')).toHaveTextContent('Главные темы');
    expect(screen.getByTestId('actions')).toHaveTextContent('Связи между текстами');
    expect(screen.getByTestId('actions')).toHaveTextContent('Противоречия');
    expect(screen.getByTestId('actions')).toHaveTextContent('Моя позиция');
    expect(screen.getByTestId('actions')).toHaveTextContent('Открытые вопросы');
  });
});
