/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockRequireAdmin = jest.fn();
const mockGetClient = jest.fn(() => ({ service: true }));
const mockResolveIdentity = jest.fn();
const mockRecord = jest.fn();
const mockLoad = jest.fn();
const mockAppend = jest.fn();

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: (...args: unknown[]) => mockGetClient(...args),
  requireAdminFromRequest: (...args: unknown[]) => mockRequireAdmin(...args),
  isAuthenticationError: (error: unknown) =>
    error instanceof Error && /unauthorized/i.test(error.message),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: () => null,
  getClientIp: () => '127.0.0.1',
}));

jest.mock('@/lib/temple/identity', () => ({
  resolveTempleIdentity: (...args: unknown[]) => mockResolveIdentity(...args),
}));

jest.mock('@/lib/temple/analytics.server', () => ({
  appendTempleAnalyticsCookies: (...args: unknown[]) => mockAppend(...args),
  loadTempleAnalyticsEvents: (...args: unknown[]) => mockLoad(...args),
  recordTempleAnalyticsEvent: (...args: unknown[]) => mockRecord(...args),
}));

const { GET, POST } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
};

function postRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/temple/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(query = ''): Request {
  return new Request(`http://localhost/api/temple/analytics${query}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveIdentity.mockResolvedValue(null);
  mockRecord.mockResolvedValue({ ok: true, setCookies: ['session=1'] });
  mockLoad.mockResolvedValue([]);
});

describe('POST /api/temple/analytics', () => {
  it('records only client-observable intent events', async () => {
    const response = await POST(
      postRequest({
        event: 'page_view',
        eventKey: 'page-1',
        path: '/temple?token=private',
        ritual: null,
      })
    );

    expect(response.status).toBe(202);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        eventName: 'page_view',
        eventKey: 'page-1',
        path: '/temple',
      })
    );
    expect(mockAppend).toHaveBeenCalledWith(response, ['session=1']);
  });

  it('rejects a client attempt to claim a ritual completion', async () => {
    const response = await POST(postRequest({ event: 'ritual_complete', ritual: 'ASH' }));

    expect(response.status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('rejects unknown client events', async () => {
    const response = await POST(postRequest({ event: 'click' }));

    expect(response.status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });
});

describe('GET /api/temple/analytics', () => {
  it('denies anonymous visitors', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('Unauthorized'));

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('returns aggregates only for an admin', async () => {
    mockRequireAdmin.mockResolvedValue({ id: 'admin', role: 'ADMIN' });
    mockLoad.mockResolvedValue([
      {
        event_key: 'e1',
        event_name: 'page_view',
        occurred_at: new Date().toISOString(),
        visitor_key: 'v1:secret-hash',
        session_key: 's1',
        identity_kind: 'guest',
        channel: 'web',
        source: 'direct',
        path: '/temple',
        ritual: null,
      },
    ]);

    const response = await GET(getRequest('?days=7'));
    const payload = (await response.json()) as Record<string, unknown>;
    const report = payload.report as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(report).toMatchObject({
      windowDays: 7,
      uniqueVisitors: 1,
      sessions: 1,
      pageViews: 1,
    });
    expect(JSON.stringify(payload)).not.toContain('v1:secret-hash');
    expect(JSON.stringify(payload)).not.toContain('visitor_key');
  });
});
