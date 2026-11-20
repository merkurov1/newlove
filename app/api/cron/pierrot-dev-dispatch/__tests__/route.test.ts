/** @jest-environment node */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/knowledge/brain/cronAuth', () => ({
  isCronAuthorized: jest.fn(() => true),
}));

jest.mock('@/lib/pierrot/dev/workbench/actions', () => ({
  dispatchNextQueuedTask: jest.fn(),
}));

jest.mock('@/lib/pierrot/dev/workbench/finalization', () => ({
  advanceFinalization: jest.fn(),
}));

jest.mock('@/lib/pierrot/dev/workbench/store', () => ({
  reapExpiredAttempts: jest.fn(),
}));

import { GET, POST } from '../route';
import { isCronAuthorized } from '@/lib/knowledge/brain/cronAuth';
import { dispatchNextQueuedTask } from '@/lib/pierrot/dev/workbench/actions';
import { advanceFinalization } from '@/lib/pierrot/dev/workbench/finalization';
import { reapExpiredAttempts } from '@/lib/pierrot/dev/workbench/store';

const authorize = isCronAuthorized as jest.Mock;
const dispatch = dispatchNextQueuedTask as jest.Mock;
const finalize = advanceFinalization as jest.Mock;
const reap = reapExpiredAttempts as jest.Mock;

function request(): Request {
  return new Request('http://localhost/api/cron/pierrot-dev-dispatch');
}

beforeEach(() => {
  jest.clearAllMocks();
  authorize.mockReturnValue(true);
  reap.mockResolvedValue(1);
  dispatch.mockResolvedValue({
    dispatched: true,
    taskId: '8289098f-993a-4e75-abe4-81e23caee6d0',
    repository: 'merkurov1/newlove',
    code: 'ACTIONS_DISPATCHED',
    reason: 'GitHub accepted the repository_dispatch request.',
    requestedAt: '2026-11-20T00:00:00.000Z',
  });
  finalize.mockResolvedValue({
    stage: 'idle',
    pullRequests: 0,
    integrated: 0,
    retryAt: null,
    blockedReason: null,
  });
});

describe('Pierrot Dev autonomous recovery cron', () => {
  it('rejects an unauthorized request before touching any queue state', async () => {
    authorize.mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(reap).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it('recovers leases, dispatches once and advances finalization without Admin', async () => {
    const response = await GET(request());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.reaped).toBe(1);
    expect(body.dispatch).toMatchObject({ dispatched: true, code: 'ACTIONS_DISPATCHED' });
    expect(body.finalization).toMatchObject({ stage: 'idle' });

    expect(reap).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ source: 'cron:pierrot-dev-dispatch' });
    expect(finalize).toHaveBeenCalledWith({ trigger: 'cron:pierrot-dev-dispatch' });

    expect(reap.mock.invocationCallOrder[0]).toBeLessThan(dispatch.mock.invocationCallOrder[0]);
    expect(dispatch.mock.invocationCallOrder[0]).toBeLessThan(finalize.mock.invocationCallOrder[0]);
  });

  it('supports POST for the existing scheduler tick', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it('keeps successful stages observable when finalization is temporarily unavailable', async () => {
    finalize.mockRejectedValueOnce(new Error('GitHub unavailable'));

    const response = await GET(request());
    const body = (await response.json()) as {
      status?: string;
      dispatch?: { dispatched?: boolean };
      errors?: Array<{ stage: string }>;
    };

    expect(response.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.dispatch?.dispatched).toBe(true);
    expect(body.errors).toEqual([{ stage: 'finalization', code: 'GitHub unavailable' }]);
    expect(reap).toHaveBeenCalledTimes(1);
  });
});
