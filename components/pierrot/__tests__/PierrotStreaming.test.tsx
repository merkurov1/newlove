import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PierrotProvider, usePierrot } from '@/components/pierrot/PierrotContext';
import { PierrotMessageList } from '@/components/pierrot/PierrotConversation';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
}));

function SendButton() {
  const { sendMessage, isLoading } = usePierrot();

  return (
    <button
      type="button"
      data-loading={isLoading ? 'true' : 'false'}
      onClick={() => void sendMessage('hello')}
    >
      send
    </button>
  );
}

function frame(event: string, payload: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify({ type: event, version: 1, ...payload })}\n\n`;
}

function fakeSseResponse(frames: string[], status = 200) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? 'text/event-stream; charset=utf-8' : null,
    },
    body: {
      getReader() {
        return {
          async read() {
            if (index >= frames.length) return { done: true, value: undefined };
            const value = encoder.encode(frames[index]);
            index += 1;
            return { done: false, value };
          },
          releaseLock() {
            // no-op for the fake reader
          },
        };
      },
    },
  };
}

function streamResponse(frames: string[], status = 200) {
  return Promise.resolve(fakeSseResponse(frames, status));
}

const ids = {
  conversationId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  userMessageId: '33333333-3333-4333-8333-333333333333',
  assistantMessageId: '44444444-4444-4444-8444-444444444444',
};

const accepted = frame('accepted', ids);

function renderChat() {
  return render(
    <PierrotProvider>
      <PierrotMessageList />
      <SendButton />
    </PierrotProvider>
  );
}

describe('public Pierrot streaming', () => {
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

  it('renders deltas and replaces them with the authoritative completed reply', async () => {
    global.fetch = jest.fn(async () =>
      streamResponse([
        accepted,
        frame('status', { stage: 'generating' }),
        frame('delta', { text: 'Hel' }),
        frame('delta', { text: 'lo' }),
        frame('completed', {
          payload: {
            ...ids,
            reply: 'Hello final',
            provider: 'test',
            recorded: true,
          },
        }),
      ])
    ) as unknown as typeof fetch;

    renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    expect(await screen.findByText('Hello final')).toBeInTheDocument();
    expect(screen.getAllByText('hello')).toHaveLength(1);
    expect(screen.getByText('Was this useful?')).toBeInTheDocument();

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain('"stream":true');
    expect(String(init.body)).toContain('"message":"hello"');
  });

  it('keeps partial text and marks an interrupted stream without inventing a second answer', async () => {
    global.fetch = jest.fn(async () =>
      streamResponse([
        accepted,
        frame('delta', { text: 'Partial answer' }),
        frame('error', {
          error: 'The response stream was interrupted.',
          code: 'AI_UNAVAILABLE',
          interrupted: true,
        }),
      ])
    ) as unknown as typeof fetch;

    renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    expect(await screen.findByText('Partial answer')).toBeInTheDocument();
    expect(
      screen.getByText(/The answer was interrupted\. Your message is preserved/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText('hello')).toHaveLength(1);
    expect(screen.queryByText('Was this useful?')).not.toBeInTheDocument();
  });

  it('shows a safe error before the first token and keeps the visitor message', async () => {
    global.fetch = jest.fn(async () =>
      streamResponse([
        accepted,
        frame('error', {
          error: 'Too many requests.',
          code: 'AI_RATE_LIMITED',
        }),
      ])
    ) as unknown as typeof fetch;

    renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'send' }));

    expect(await screen.findByText(/Too many requests/i)).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.queryByText('Was this useful?')).not.toBeInTheDocument();
  });

  it('does not submit twice while a stream is active', async () => {
    let release: (() => void) | null = null;

    global.fetch = jest.fn(
      () =>
        new Promise<ReturnType<typeof fakeSseResponse>>((resolve) => {
          release = () => resolve(fakeSseResponse([accepted]));
        })
    ) as unknown as typeof fetch;

    renderChat();
    const send = screen.getByRole('button', { name: 'send' });

    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'send' })).toHaveAttribute('data-loading', 'true');
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    release?.();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'send' })).toHaveAttribute('data-loading', 'false');
    });
  });
});
