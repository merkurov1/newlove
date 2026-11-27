import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import AdminAuthDiagnostics from '../AdminAuthDiagnostics';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('AdminAuthDiagnostics', () => {
  it('shows the owner API session without exposing cookie values', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        authenticated: true,
        authorized: true,
        role: 'ADMIN',
        authMethod: 'session',
        profileSource: 'users',
        request: {
          hasCookieHeader: true,
          hasSupabaseSessionCookie: true,
        },
      }),
    })) as unknown as typeof fetch;

    render(<AdminAuthDiagnostics />);

    expect(screen.getByText('Диагностика админ-сессии')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Проверить API' }));

    await waitFor(() => {
      expect(screen.getByText(/HTTP/)).toHaveTextContent('200');
    });

    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByText('users')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/auth-diagnostics',
      expect.objectContaining({ cache: 'no-store', credentials: 'include' }),
    );
  });

  it('renders the actionable 401/403 code', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        ok: false,
        authenticated: true,
        authorized: false,
        code: 'auth_admin_required',
        message: 'Аккаунт без роли ADMIN',
        request: {},
      }),
    })) as unknown as typeof fetch;

    render(<AdminAuthDiagnostics />);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить API' }));

    await waitFor(() => {
      expect(screen.getByText('auth_admin_required')).toBeInTheDocument();
    });

    expect(screen.getByText(/HTTP/)).toHaveTextContent('403');
  });
});
