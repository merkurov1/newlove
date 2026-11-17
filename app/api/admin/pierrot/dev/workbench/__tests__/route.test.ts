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

jest.mock('@/lib/pierrot/dev/workbench/overview', () => ({
  getWorkbenchOverview: jest.fn(async () => ({ schemaReady: true, lifecycle: {} })),
}));

jest.mock('@/lib/pierrot/dev/workbench/lifecycle', () => ({
  ensureCodespaceForQueuedWork: jest.fn(async () => ({
    action: 'already-available',
    codespace: null,
    reason: 'Codespace is Available.',
  })),
}));

jest.mock('@/lib/pierrot/dev/workbench/store', () => ({
  reapExpiredAttempts: jest.fn(async () => 0),
}));

jest.mock('@/lib/pierrot/dev/workbench/finalization', () => ({
  advanceFinalization: jest.fn(async () => null),
}));

import { GET, maxDuration } from '../route';
import { advanceFinalization } from '@/lib/pierrot/dev/workbench/finalization';
import { ensureCodespaceForQueuedWork } from '@/lib/pierrot/dev/workbench/lifecycle';
import { getWorkbenchOverview } from '@/lib/pierrot/dev/workbench/overview';
import { reapExpiredAttempts } from '@/lib/pierrot/dev/workbench/store';

const ensure = ensureCodespaceForQueuedWork as jest.Mock;
const overview = getWorkbenchOverview as jest.Mock;
const reap = reapExpiredAttempts as jest.Mock;
const finalize = advanceFinalization as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  ensure.mockResolvedValue({
    action: 'already-available',
    codespace: null,
    reason: 'Codespace is Available.',
  });
  overview.mockResolvedValue({ schemaReady: true, lifecycle: {} });
  reap.mockResolvedValue(0);
  finalize.mockResolvedValue(null);
});

describe('Admin Dev workbench GET', () => {
  it('reaps, then allows guarded worker recovery, then builds the snapshot', async () => {
    const request = new Request('http://localhost/api/admin/pierrot/dev/workbench');
    const response = await GET(request);
    const body = (await response.json()) as { overview?: unknown };

    expect(response.status).toBe(200);
    expect(body.overview).toBeTruthy();
    expect(reap).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledWith({
      source: 'admin:overview',
      allowWorkerRecovery: true,
    });
    expect(overview).toHaveBeenCalledWith(expect.any(String), { skipReap: true });
    expect(finalize).toHaveBeenCalledWith({ trigger: 'admin:overview' });

    // The overview must not be read before recovery and finalization have
    // finished. Finalization is bounded to one integration step per poll.
    expect(reap.mock.invocationCallOrder[0]).toBeLessThan(ensure.mock.invocationCallOrder[0]);
    expect(ensure.mock.invocationCallOrder[0]).toBeLessThan(finalize.mock.invocationCallOrder[0]);
    expect(finalize.mock.invocationCallOrder[0]).toBeLessThan(
      overview.mock.invocationCallOrder[0]
    );
  });

  it('keeps a bounded function budget and does not wait for Codespace boot', async () => {
    expect(maxDuration).toBeLessThanOrEqual(30);
    const request = new Request('http://localhost/api/admin/pierrot/dev/workbench');
    const started = Date.now();
    await GET(request);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('still returns the overview when the lifecycle reconcile is unavailable', async () => {
    ensure.mockRejectedValueOnce(new Error('Codespaces API is unavailable.'));
    const request = new Request('http://localhost/api/admin/pierrot/dev/workbench');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(overview).toHaveBeenCalledTimes(1);
  });
});
