/** @jest-environment node */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111' })),
}));

jest.mock('@/lib/rateLimit', () => ({
  getClientIp: jest.fn(() => '127.0.0.1'),
}));

jest.mock('@/lib/pierrot/rateLimit', () => ({
  checkPierrotRateLimit: jest.fn(async () => null),
}));

jest.mock('@/lib/pierrot/dev/workbench/release', () => ({
  getReleaseOverview: jest.fn(async () => ({ target: { sha: 'a'.repeat(40) }, blockers: [] })),
}));

jest.mock('@/lib/pierrot/dev/workbench/productionRelease', () => ({
  ReleaseError: class ReleaseError extends Error {
    code = 'RELEASE_ERROR';
    status = 409;
    detail = null;
  },
  startProductionRelease: jest.fn(async () => ({
    id: 'release-1',
    status: 'running',
    phase: 'migrations',
  })),
  advanceProductionRelease: jest.fn(async () => ({
    id: 'release-1',
    status: 'succeeded',
    phase: 'completed',
  })),
}));

jest.mock('@/lib/pierrot/dev/workbench/releaseLedger', () => ({
  getActiveProductionRelease: jest.fn(async () => null),
}));

jest.mock('@/lib/pierrot/dev/workbench/store', () => ({
  WorkbenchUnavailableError: class WorkbenchUnavailableError extends Error {},
}));

import { POST, GET } from '../release/route';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import {
  advanceProductionRelease,
  startProductionRelease,
} from '@/lib/pierrot/dev/workbench/productionRelease';
import { getReleaseOverview } from '@/lib/pierrot/dev/workbench/release';
import { getActiveProductionRelease } from '@/lib/pierrot/dev/workbench/releaseLedger';

const auth = requireAdminFromRequest as jest.Mock;
const start = startProductionRelease as jest.Mock;
const advance = advanceProductionRelease as jest.Mock;
const overview = getReleaseOverview as jest.Mock;
const active = getActiveProductionRelease as jest.Mock;

function post(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/pierrot/dev/workbench/release', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ id: 'owner-1' });
  active.mockResolvedValue(null);
});

describe('production release route', () => {
  it('rejects unauthenticated starts', async () => {
    auth.mockRejectedValueOnce(new Error('unauthorized'));
    const response = await POST(post({ action: 'start', confirm: true }));
    expect(response.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it('passes the displayed SHA as a concurrency check and requires confirmation', async () => {
    const response = await POST(
      post({ action: 'start', confirm: true, expectedSha: 'a'.repeat(40) })
    );
    expect(response.status).toBe(202);
    expect(start).toHaveBeenCalledWith({
      actorId: 'owner-1',
      expectedSha: 'a'.repeat(40),
      confirm: true,
    });
    expect(overview).toHaveBeenCalled();
  });

  it('advances an existing release by id', async () => {
    const response = await POST(post({ action: 'advance', releaseId: 'release-1' }));
    expect(response.status).toBe(200);
    expect(advance).toHaveBeenCalledWith('release-1');
  });

  it('advances the active release only when the polling query is explicit', async () => {
    active.mockResolvedValueOnce({ id: 'release-1' });
    const response = await GET(
      new Request('http://localhost/api/admin/pierrot/dev/workbench/release?advance=1')
    );
    expect(response.status).toBe(200);
    expect(advance).toHaveBeenCalledWith('release-1');
  });

  it('does not advance on a plain readiness read', async () => {
    const response = await GET(
      new Request('http://localhost/api/admin/pierrot/dev/workbench/release')
    );
    expect(response.status).toBe(200);
    expect(advance).not.toHaveBeenCalled();
  });
});
