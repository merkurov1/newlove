import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import QuestionSubscription from '../QuestionSubscription';

const questionId = '11111111-1111-4111-8111-111111111111';

type FetchHandler = (url: string, init?: RequestInit) => Promise<unknown>;

function installFetch(handler: FetchHandler) {
  const mock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => handler(String(input), init),
  }));
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

beforeEach(() => {
  window.localStorage.clear();
  jest.restoreAllMocks();
});

describe('QuestionSubscription', () => {
  it('shows an active email channel and disables only that channel', async () => {
    const fetchMock = installFetch(async (url, init) => {
      if (init?.method === 'POST') return { ok: true, channel: 'email' };
      return {
        email: { state: 'active', available: true },
        telegram: { state: 'none', available: false },
      };
    });

    render(<QuestionSubscription questionId={questionId} isAuthenticated />);

    expect(await screen.findByText('включён')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отключить email' }));

    await waitFor(() => {
      expect(screen.getByText('Email-уведомления отключены.')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/question/subscription/disable',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('can cancel every channel at once', async () => {
    installFetch(async (url, init) => {
      if (init?.method === 'POST') return { ok: true, channel: 'all' };
      return {
        email: { state: 'active', available: true },
        telegram: { state: 'active', available: true },
      };
    });

    render(<QuestionSubscription questionId={questionId} isAuthenticated />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Отписаться от всех уведомлений' })
    );

    await waitFor(() => {
      expect(
        screen.getByText('Вы отписались от всех уведомлений по этому вопросу.')
      ).toBeInTheDocument();
    });

    expect(screen.getAllByText('отключён')).toHaveLength(2);
  });

  it('creates a pending email opt-in without pretending it is active', async () => {
    installFetch(async (url, init) => {
      if (init?.method === 'POST') {
        return {
          email: { state: 'pending', available: true },
          telegram: { state: 'none', available: false },
        };
      }

      return {
        email: { state: 'none', available: true },
        telegram: { state: 'none', available: false },
      };
    });

    render(<QuestionSubscription questionId={questionId} isAuthenticated={false} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Email для уведомлений' }), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Подписаться' }));

    await waitFor(() => {
      expect(
        screen.getByText('Проверьте почту: подписка включится после подтверждения ссылки.')
      ).toBeInTheDocument();
    });

    expect(screen.queryByText('включён')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(`question:subscription:${questionId}`)).toContain(
      'pending'
    );
  });

  it('does not offer Telegram before the bot path is verified', async () => {
    installFetch(async () => ({
      email: { state: 'none', available: true },
      telegram: { state: 'unavailable', available: false },
    }));

    render(<QuestionSubscription questionId={questionId} isAuthenticated={false} />);

    expect(await screen.findByText(/Telegram пока не подключён/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Подключить Telegram' })
    ).not.toBeInTheDocument();
  });

  it('renders the deep link only after the server returns a pending Telegram opt-in', async () => {
    installFetch(async (url, init) => {
      if (init?.method === 'POST') {
        return {
          email: { state: 'none', available: true },
          telegram: {
            state: 'pending',
            available: true,
            deepLinkUrl: 'https://t.me/piero_bot?start=token',
          },
        };
      }

      return {
        email: { state: 'none', available: true },
        telegram: { state: 'none', available: true },
      };
    });

    render(<QuestionSubscription questionId={questionId} isAuthenticated={false} />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Подключить Telegram' })
    );

    const link = await screen.findByRole('link', { name: 'Открыть Telegram' });
    expect(link).toHaveAttribute('href', 'https://t.me/piero_bot?start=token');
  });
});
