/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AuthenticationError } from '@/lib/auth/errors';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
  getServerSupabaseClient: jest.fn(),
}));

jest.mock('@/lib/telegram/instantViewAuth', () => {
  class MockInstantViewAuthError extends Error {
    code: string;

    constructor(code: string, message = 'Instant View authorization failed.') {
      super(message);
      this.name = 'InstantViewAuthError';
      this.code = code;
    }
  }

  return {
    InstantViewAuthError: MockInstantViewAuthError,
    loadInstantViewStatus: jest.fn(),
    startInstantViewLogin: jest.fn(),
    checkInstantViewLogin: jest.fn(),
    verifyInstantViewSession: jest.fn(),
    inspectInstantViewEditor: jest.fn(),
    disconnectInstantViewSession: jest.fn(),
  };
});

const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};
const auth = require('@/lib/telegram/instantViewAuth') as {
  loadInstantViewStatus: jest.Mock;
  startInstantViewLogin: jest.Mock;
  disconnectInstantViewSession: jest.Mock;
};

const { GET: statusRoute } = require('../status/route') as {
  GET: (request: Request) => Promise<Response>;
};
const { POST: loginRoute } = require('../login/route') as {
  POST: (request: Request) => Promise<Response>;
};
const { POST: disconnectRoute } = require('../disconnect/route') as {
  POST: (request: Request) => Promise<Response>;
};

const statusPayload = {
  status: 'connected',
  storage: 'available',
  keySource: 'dedicated',
  hashConfigured: true,
  pendingExpiresAt: null,
  connectedAt: '2026-11-28T09:00:00.000Z',
  lastVerifiedAt: '2026-11-28T09:05:00.000Z',
  lastErrorCode: null,
  template: null,
};

function post(body: unknown, contentType = 'application/json') {
  return new Request('https://www.merkurov.love/api/admin/integrations/telegram-instant-view', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.requireAdminFromRequest.mockResolvedValue({ id: 'owner-1', role: 'ADMIN' });
  auth.loadInstantViewStatus.mockResolvedValue(statusPayload);
});

describe('Telegram Instant View admin routes', () => {
  it('returns 401 for an anonymous request', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValueOnce(new AuthenticationError());

    const response = await statusRoute(
      new Request('https://www.merkurov.love/api/admin/integrations/telegram-instant-view/status')
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns sanitized owner status without a hash or cookie', async () => {
    const response = await statusRoute(
      new Request('https://www.merkurov.love/api/admin/integrations/telegram-instant-view/status')
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, status: 'connected', hashConfigured: true });
    expect(serialized).not.toMatch(/rhash|cookie|session=/i);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('starts the official Telegram login with the owner-supplied phone', async () => {
    auth.startInstantViewLogin.mockResolvedValueOnce({
      status: 'pending',
      expiresAt: '2026-11-28T10:10:00.000Z',
    });
    auth.loadInstantViewStatus.mockResolvedValueOnce({
      ...statusPayload,
      status: 'pending',
      pendingExpiresAt: '2026-11-28T10:10:00.000Z',
    });

    const response = await loginRoute(post({ phone: '+79001234567' }));

    expect(response.status).toBe(200);
    expect(auth.startInstantViewLogin).toHaveBeenCalledWith('+79001234567');
    expect(await response.json()).toMatchObject({ ok: true, status: 'pending' });
  });

  it('rejects non-JSON state-changing requests', async () => {
    const response = await loginRoute(post({ phone: '+79001234567' }, 'text/plain'));

    expect(response.status).toBe(415);
    expect(auth.startInstantViewLogin).not.toHaveBeenCalled();
  });

  it('disconnects only for the authenticated owner', async () => {
    auth.disconnectInstantViewSession.mockResolvedValueOnce({
      ...statusPayload,
      status: 'disconnected',
    });

    const response = await disconnectRoute(post({}));

    expect(response.status).toBe(200);
    expect(auth.disconnectInstantViewSession).toHaveBeenCalledTimes(1);
  });
});
