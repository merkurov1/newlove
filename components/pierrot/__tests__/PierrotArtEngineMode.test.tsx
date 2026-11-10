import React, { useState } from 'react';
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
  const { sendMessage, isArtEngineMode, tryExitArtEngineMode, messages } = usePierrot();
  const [exitResult, setExitResult] = useState('');

  return (
    <div>
      <span data-testid="mode">{String(isArtEngineMode)}</span>
      <span data-testid="exit-result">{exitResult}</span>
      <span data-testid="messages">{messages.map((message) => message.content).join(' | ')}</span>
      <button type="button" onClick={() => void sendMessage('Включи Art Engine')}>
        enter
      </button>
      <button type="button" onClick={() => void sendMessage('Хочу создать изображение')}>
        create image
      </button>
      <button
        type="button"
        onClick={() => void sendMessage('Расскажи про искусство и изображения')}
      >
        ordinary
      </button>
      <button type="button" onClick={() => void sendMessage('Что такое Art Engine?')}>
        question
      </button>
      <button
        type="button"
        onClick={() => setExitResult(String(tryExitArtEngineMode('Вернуться в обычный чат')))}
      >
        exit
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <PierrotProvider>
      <Probe />
    </PierrotProvider>
  );
}

describe('Pierrot Art Engine mode', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem('pierrot_onboarding_v1', '1');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ reply: 'A quiet answer.', provider: 'test' }),
    }) as unknown as typeof fetch;
  });

  it('enters Art Engine from an explicit text command without calling the chat API', async () => {
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'enter' }));

    await waitFor(() => {
      expect(screen.getByTestId('mode')).toHaveTextContent('true');
    });

    expect(screen.getByTestId('messages')).toHaveTextContent('Включи Art Engine');
    expect(screen.getByTestId('messages')).toHaveTextContent('Art Engine включён');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('enters Art Engine for the explicit image request phrase', async () => {
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'create image' }));

    await waitFor(() => {
      expect(screen.getByTestId('mode')).toHaveTextContent('true');
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('leaves Art Engine through the composer command and keeps the transcript', async () => {
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'enter' }));
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('true'));

    fireEvent.click(screen.getByRole('button', { name: 'exit' }));

    await waitFor(() => {
      expect(screen.getByTestId('mode')).toHaveTextContent('false');
      expect(screen.getByTestId('exit-result')).toHaveTextContent('true');
    });

    expect(screen.getByTestId('messages')).toHaveTextContent('Включи Art Engine');
    expect(screen.getByTestId('messages')).toHaveTextContent('Вернуться в обычный чат');
    expect(screen.getByTestId('messages')).toHaveTextContent('Обычный чат');
  });

  it.each([
    ['ordinary', 'Расскажи про искусство и изображения'],
    ['question', 'Что такое Art Engine?'],
  ])('keeps normal chat for an ordinary art message: %s', async (_name, text) => {
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: _name }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('mode')).toHaveTextContent('false');
    expect(screen.getByTestId('messages')).toHaveTextContent(text);

    await waitFor(() => {
      expect(screen.getByTestId('messages')).toHaveTextContent('A quiet answer.');
    });
  });
});
