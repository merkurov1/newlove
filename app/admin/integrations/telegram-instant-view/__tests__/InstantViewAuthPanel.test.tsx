import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import InstantViewAuthPanel from '../InstantViewAuthPanel';

jest.mock('@/lib/auth/adminFetch', () => ({
  adminFetch: jest.fn(),
}));

const { adminFetch } = require('@/lib/auth/adminFetch') as {
  adminFetch: jest.Mock;
};

const baseStatus = {
  status: 'disconnected' as const,
  storage: 'available' as const,
  keySource: 'dedicated' as const,
  hashConfigured: true,
  pendingExpiresAt: null,
  connectedAt: null,
  lastVerifiedAt: null,
  lastErrorCode: null,
  template: null,
};

function response(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as Response;
}

describe('Telegram Instant View owner panel', () => {
  beforeEach(() => {
    adminFetch.mockReset();
  });

  it('starts the official Telegram flow with a phone number and no OTP/2FA fields', async () => {
    adminFetch.mockResolvedValueOnce(
      response({ ok: true, status: 'pending', expiresAt: '2026-11-28T10:10:00.000Z' })
    );

    render(<InstantViewAuthPanel initial={baseStatus} />);

    expect(screen.getByText('Telegram Instant View')).toBeInTheDocument();
    expect(screen.getByLabelText('Телефон')).toHaveAttribute('type', 'tel');
    expect(screen.queryByLabelText(/код/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/2fa/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/парол/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Телефон'), {
      target: { value: '+79001234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Подключить Telegram' }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(1));

    const [url, init] = adminFetch.mock.calls[0];
    expect(url).toBe('/api/admin/integrations/telegram-instant-view/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ phone: '+79001234567' });
    expect(await screen.findByText('Подтвердите вход в Telegram')).toBeInTheDocument();
  });

  it('shows the pending step without ever returning a session token to the browser', async () => {
    render(
      <InstantViewAuthPanel
        initial={{
          ...baseStatus,
          status: 'pending',
          pendingExpiresAt: '2026-11-28T10:10:00.000Z',
        }}
      />
    );

    expect(screen.getByText('Подтвердите вход в Telegram')).toBeInTheDocument();
    expect(screen.getByText(/Не отправляйте коды или cookie в чат/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/rhash=|cookie=|session=/);
  });

  it('exposes test, inspect and disconnect actions for a connected owner', async () => {
    adminFetch.mockResolvedValueOnce(response({ ...baseStatus, status: 'connected' }));

    render(
      <InstantViewAuthPanel
        initial={{
          ...baseStatus,
          status: 'connected',
          connectedAt: '2026-11-28T09:00:00.000Z',
          lastVerifiedAt: '2026-11-28T09:05:00.000Z',
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Проверить сессию' }));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(1));
    expect(adminFetch.mock.calls[0][0]).toBe('/api/admin/integrations/telegram-instant-view/test');
    expect(screen.getByRole('button', { name: /Проверить шаблон и hash/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отключить' })).toBeInTheDocument();
  });

  it.each([
    ['verified', /совпадает — проверено/],
    ['mismatch', /не совпадает/],
    ['missing_server_hash', /на сервере не настроен/],
    ['unknown', /не удалось определить/],
  ] as const)('renders the %s diagnostic without exposing the hash', (hashStatus, label) => {
    render(
      <InstantViewAuthPanel
        initial={{
          ...baseStatus,
          status: 'connected',
          connectedAt: '2026-11-28T09:00:00.000Z',
          lastVerifiedAt: '2026-11-28T09:05:00.000Z',
          template: {
            templatePresent: true,
            rhashPresent: hashStatus !== 'unknown',
            hashMatchesEnv:
              hashStatus === 'verified' ? true : hashStatus === 'mismatch' ? false : null,
            hashStatus,
            serverHashConfigured: hashStatus !== 'missing_server_hash',
            detailStatus: 'loaded',
            detailChecked: true,
            templateUrl: 'https://instantview.telegram.org/my/merkurov.love',
            checkedAt: '2026-11-28T09:05:00.000Z',
          },
        }}
      />
    );

    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/rhash=|%3D|cookie=/i);
  });

  it('renders a safe storage-unavailable state without action ambiguity', () => {
    render(
      <InstantViewAuthPanel
        initial={{
          ...baseStatus,
          storage: 'unavailable',
          keySource: 'unavailable',
          hashConfigured: false,
        }}
      />
    );

    expect(screen.getByText('Недоступно')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подключить Telegram' })).toBeDisabled();
  });
});
