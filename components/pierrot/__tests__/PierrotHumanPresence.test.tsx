import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PierrotProvider, usePierrot } from '@/components/pierrot/PierrotContext';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/heartandangel',
}));

const conversationId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';

function Probe() {
  const { isHumanActive, isHumanPending, messages, sendMessage, humanPresence } =
    usePierrot();

  return (
    <div>
      <span data-testid="active">{String(isHumanActive)}</span>
      <span data-testid="pending">{String(isHumanPending)}</span>
      <span data-testid="label">{humanPresence?.visitorLabel || ''}</span>
      <span data-testid="messages">
        {messages.map((message) => `${message.role}:${message.content}`).join(' | ')}
      </span>
      <button type="button" onClick={() => void sendMessage('Привет, Антон')}>
        send
      </button>
    </div>
  );
}

function jsonResponse(value: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => value,
  });
}

describe('Pierrot human presence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem('pierrot_onboarding_v1', '1');
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('restores an active conversation and routes messages to the human endpoint', async () => {
    window.localStorage.setItem(
      'pierrot_human_access_v1',
      JSON.stringify({
        token: 'A'.repeat(43),
        requestId,
        savedAt: new Date().toISOString(),
      })
    );

    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/pierrot/human/state')) {
        return jsonResponse({
          request: {
            requestId,
            status: 'active',
            visitorLabel: '#A821',
            startPage: '/heartandangel',
            language: 'ru',
            createdAt: '2026-10-30T10:00:00.000Z',
            expiresAt: '2026-10-30T10:20:00.000Z',
            acceptedAt: '2026-10-30T10:01:00.000Z',
            closedAt: null,
            resolvedBy: null,
          },
          session: {
            id: '55555555-5555-4555-8555-555555555555',
            status: 'active',
            openedAt: '2026-10-30T10:01:00.000Z',
            closedAt: null,
          },
          conversationId,
          sessionId,
          messages: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              role: 'human',
              content: 'Привет от Антона',
              createdAt: '2026-10-30T10:02:00.000Z',
              sequence: 4,
            },
          ],
          serverTime: '2026-10-30T10:02:01.000Z',
        });
      }

      if (url.includes('/api/pierrot/human/message')) {
        return jsonResponse({
          request: {
            requestId,
            status: 'active',
            visitorLabel: '#A821',
            startPage: '/heartandangel',
            language: 'ru',
            createdAt: '2026-10-30T10:00:00.000Z',
            expiresAt: '2026-10-30T10:20:00.000Z',
            acceptedAt: '2026-10-30T10:01:00.000Z',
            closedAt: null,
            resolvedBy: null,
          },
          session: null,
          message: {
            id: '77777777-7777-4777-8777-777777777777',
            createdAt: '2026-10-30T10:03:00.000Z',
            sequence: 5,
          },
          delivery: 'sent',
        });
      }

      return jsonResponse({ error: 'unexpected' });
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <PierrotProvider>
        <Probe />
      </PierrotProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active')).toHaveTextContent('true');
    });

    expect(screen.getByTestId('label')).toHaveTextContent('#A821');
    expect(screen.getByTestId('messages').textContent).toMatch(
      /Антон здесь\.|Anton is here\./
    );
    expect(screen.getByTestId('messages')).toHaveTextContent('human:Привет от Антона');

    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => {
      expect(screen.getByTestId('messages')).toHaveTextContent('user:Привет, Антон');
    });

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toContain('/api/pierrot/human/message');
    expect(urls).not.toContain('/api/pierrot-web');
  });

  it('shows a pending request and does not claim Anton is present', async () => {
    window.localStorage.setItem(
      'pierrot_human_access_v1',
      JSON.stringify({
        token: 'B'.repeat(43),
        requestId,
        savedAt: new Date().toISOString(),
      })
    );

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/pierrot/human/state')) {
        return jsonResponse({
          request: {
            requestId,
            status: 'pending',
            visitorLabel: '#A821',
            startPage: '/lobby',
            language: 'ru',
            createdAt: '2026-10-30T10:00:00.000Z',
            expiresAt: '2026-10-30T10:20:00.000Z',
            acceptedAt: null,
            closedAt: null,
            resolvedBy: null,
          },
          session: null,
          conversationId,
          sessionId,
          messages: [],
          serverTime: '2026-10-30T10:00:01.000Z',
        });
      }

      return jsonResponse({});
    }) as unknown as typeof fetch;

    render(
      <PierrotProvider>
        <Probe />
      </PierrotProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pending')).toHaveTextContent('true');
    });

    expect(screen.getByTestId('active')).toHaveTextContent('false');
    expect(screen.getByTestId('messages')).not.toHaveTextContent('Антон здесь.');
  });
});
