import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubscribeFormClient from '../SubscribeFormClient';

jest.mock('@/hooks/useSupabaseSession', () => () => ({ session: null }));
jest.mock(
  '@/components/AuthLoginModal',
  () =>
    function MockAuthLoginModal() {
      return null;
    }
);

function response(ok: boolean, body: unknown) {
  return Promise.resolve({
    ok,
    json: async () => body,
  } as Response);
}

describe('Journal subscription form', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('submits the English locale to the existing subscribe API', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      response(true, { success: true, status: 'pending_confirmation' })
    );

    render(<SubscribeFormClient defaultLanguage="en" editorial showLanguageSelector={false} />);

    const input = screen.getByLabelText('Subscription email');
    expect(input).toHaveAttribute('placeholder', 'you@example.com');
    expect(screen.queryByRole('button', { name: 'RU' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'EN' })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'reader@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    await waitFor(() => {
      expect(screen.getByText('Check your inbox to confirm the subscription.')).toBeInTheDocument();
    });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe('/api/subscribe');
    expect(JSON.parse(call[1].body)).toMatchObject({
      email: 'reader@example.com',
      language: 'en',
    });
  });

  it('submits the Russian locale with Russian UI copy', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      response(true, { success: true, status: 'already_confirmed' })
    );

    render(<SubscribeFormClient defaultLanguage="ru" editorial showLanguageSelector={false} />);

    const input = screen.getByLabelText('Email для подписки');
    expect(input).toHaveAttribute('placeholder', 'ваш@email.com');

    fireEvent.change(input, { target: { value: 'reader@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подписаться' }));

    await waitFor(() => {
      expect(screen.getByText('Этот email уже подтверждён.')).toBeInTheDocument();
    });

    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(call[1].body).language).toBe('ru');
  });

  it('validates the email before sending a request', async () => {
    render(<SubscribeFormClient defaultLanguage="en" editorial showLanguageSelector={false} />);

    fireEvent.change(screen.getByLabelText('Subscription email'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('localizes API errors and prevents a second concurrent submit', async () => {
    let resolveRequest: ((value: Response) => void) | null = null;
    (global.fetch as jest.Mock).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveRequest = resolve;
      })
    );

    render(<SubscribeFormClient defaultLanguage="ru" editorial showLanguageSelector={false} />);

    fireEvent.change(screen.getByLabelText('Email для подписки'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Подписаться' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отправка...' })).toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправка...' }));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveRequest?.({
      ok: false,
      json: async () => ({ error: 'Invalid email' }),
    } as Response);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Введите корректный email.');
    });
  });
});
