import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PierrotProvider, usePierrot } from '@/components/pierrot/PierrotContext';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/lobby',
}));

let mockAuth: { user: { id: string } | null; isLoading: boolean } = {
  user: { id: 'admin-1' },
  isLoading: false,
};

jest.mock('@/components/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

function Probe() {
  const { messages, isAdminSession, sendMessage } = usePierrot();

  return (
    <div>
      <span data-testid="count">{messages.length}</span>
      <span data-testid="admin">{String(isAdminSession)}</span>
      <button type="button" onClick={() => void sendMessage('hello')}>
        send
      </button>
    </div>
  );
}

function app() {
  return (
    <PierrotProvider>
      <Probe />
    </PierrotProvider>
  );
}

describe('Pierrot auth lifecycle', () => {
  beforeEach(() => {
    mockAuth = { user: { id: 'admin-1' }, isLoading: false };
    window.sessionStorage.clear();
    window.localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: 'ok',
        admin: true,
        conversationId: '11111111-1111-4111-8111-111111111111',
      }),
    }) as unknown as typeof fetch;
  });

  it('clears the transcript and owner badge when the auth identity changes', async () => {
    const view = render(app());

    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(screen.getByTestId('count')).toHaveTextContent('2');
      expect(screen.getByTestId('admin')).toHaveTextContent('true');
    });

    mockAuth = { user: null, isLoading: false };
    view.rerender(app());

    await waitFor(() => {
      expect(screen.getByTestId('count')).toHaveTextContent('0');
      expect(screen.getByTestId('admin')).toHaveTextContent('false');
    });
  });

  it('does not clear the transcript while the auth identity is unchanged', async () => {
    const view = render(app());

    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(screen.getByTestId('count')).toHaveTextContent('2');
    });

    view.rerender(app());

    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });
});
