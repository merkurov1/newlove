import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PierrotProvider, usePierrot } from '@/components/pierrot/PierrotContext';
import { PierrotMessageList } from '@/components/pierrot/PierrotConversation';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/lobby',
}));

function SendButton() {
  const { sendMessage } = usePierrot();

  return (
    <button type="button" onClick={() => void sendMessage('hello')}>
      send
    </button>
  );
}

function response(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('Pierrot web chat failures', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem('pierrot_onboarding_v1', '1');
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('shows a specific safe message and no answer rating for provider errors', async () => {
    global.fetch = jest.fn(async () =>
      response(503, {
        code: 'AI_TEMPORARILY_UNAVAILABLE',
        error: 'Pierrot is temporarily unavailable. Try again in a minute.',
        retryAfter: 60,
      })
    ) as unknown as typeof fetch;

    render(
      <PierrotProvider>
        <PierrotMessageList />
        <SendButton />
      </PierrotProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(
        screen.getByText(/temporarily unavailable|временно недоступен/i)
      ).toBeInTheDocument();
    });

    expect(screen.queryByText('Was this useful?')).not.toBeInTheDocument();
    expect(screen.queryByText(/connection was interrupted/i)).not.toBeInTheDocument();
  });

  it('keeps a malformed success response from becoming a fake answer', async () => {
    global.fetch = jest.fn(async () => response(200, { ok: true })) as unknown as typeof fetch;

    render(
      <PierrotProvider>
        <PierrotMessageList />
        <SendButton />
      </PierrotProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(
        screen.getByText(/not readable|неверном формате/i)
      ).toBeInTheDocument();
    });

    expect(screen.queryByText('Silence.')).not.toBeInTheDocument();
  });
});
