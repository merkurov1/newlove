/** @jest-environment node */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
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
  ensureCodespaceForQueuedWork: jest.fn(),
  startCodespaceNow: jest.fn(),
}));

jest.mock('@/lib/pierrot/dev/workbench/actions', () => ({
  dispatchNextQueuedTask: jest.fn(),
}));

jest.mock('@/lib/pierrot/dev/workbench/store', () => ({
  reapExpiredAttempts: jest.fn(),
}));

jest.mock('@/lib/pierrot/dev/workbench/finalization', () => ({
  advanceFinalization: jest.fn(),
}));

import { GET, maxDuration } from '../route';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { dispatchNextQueuedTask } from '@/lib/pierrot/dev/workbench/actions';
import { advanceFinalization } from '@/lib/pierrot/dev/workbench/finalization';
import { ensureCodespaceForQueuedWork } from '@/lib/pierrot/dev/workbench/lifecycle';
import { getWorkbenchOverview } from '@/lib/pierrot/dev/workbench/overview';
import { reapExpiredAttempts } from '@/lib/pierrot/dev/workbench/store';

const auth = requireAdminFromRequest as jest.Mock;
const dispatch = dispatchNextQueuedTask as jest.Mock;
const ensure = ensureCodespaceForQueuedWork as jest.Mock;
const overview = getWorkbenchOverview as jest.Mock;
const reap = reapExpiredAttempts as jest.Mock;
const finalize = advanceFinalization as jest.Mock;

type WorkbenchBody = {
  overview?: unknown;
  telemetry?: { stages: Array<{ stage: string; durationMs: number; status: string }> };
};

function request() {
  return new Request('http://localhost/api/admin/pierrot/dev/workbench');
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
  overview.mockResolvedValue({ schemaReady: true, lifecycle: {} });
  reap.mockResolvedValue(0);
  finalize.mockResolvedValue(null);
  dispatch.mockResolvedValue({ dispatched: false, code: 'NO_QUEUED_WORK' });
});

describe('Admin Dev workbench GET', () => {
  it('is read-only and builds the snapshot without reap, dispatch or finalization', async () => {
    const response = await GET(request());
    const body = (await response.json()) as WorkbenchBody;

    expect(response.status).toBe(200);
    expect(body.overview).toBeTruthy();
    expect(reap).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
    expect(overview).toHaveBeenCalledWith(expect.any(String), {
      skipReap: true,
      telemetry: expect.anything(),
    });
  });

  it('repeated polls cannot create duplicate side effects', async () => {
    const first = await GET(request());
    const second = await GET(request());
    const third = await GET(request());

    expect([first.status, second.status, third.status]).toEqual([200, 200, 200]);
    expect(overview).toHaveBeenCalledTimes(3);
    expect(reap).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it('reports every GET stage duration in telemetry and Server-Timing', async () => {
    const response = await GET(request());
    const body = (await response.json()) as WorkbenchBody;

    const stages = body.telemetry?.stages.map((stage) => stage.stage) ?? [];
    expect(stages).toEqual(expect.arrayContaining(['auth', 'overview']));
    expect(body.telemetry?.stages.every((stage) => stage.durationMs >= 0)).toBe(true);
    expect(response.headers['Server-Timing']).toMatch(/total;dur=/);
    expect(response.headers['Server-Timing']).toMatch(/auth;dur=/);
    expect(response.headers['Server-Timing']).toMatch(/overview;dur=/);
  });

  it('does not start a Codespace when Admin is opened or refreshed', async () => {
    await GET(request());
    expect(ensure).not.toHaveBeenCalled();
  });

  it('returns 401 with telemetry for an authentication failure', async () => {
    auth.mockRejectedValueOnce(new Error('Unauthorized'));
    const response = await GET(request());
    const body = (await response.json()) as WorkbenchBody & { error?: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(body.telemetry?.stages.map((stage) => stage.stage)).toContain('auth');
  });

  it('still reports telemetry when the overview fails', async () => {
    overview.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await GET(request());
    const body = (await response.json()) as WorkbenchBody & { error?: string };

    expect(response.status).toBe(500);
    expect(body.error).toContain('Unable to load');
    expect(body.telemetry?.stages.map((stage) => stage.stage)).toEqual(
      expect.arrayContaining(['auth', 'overview'])
    );
  });

  it('keeps a bounded function budget', async () => {
    expect(maxDuration).toBeLessThanOrEqual(30);
    const started = Date.now();
    await GET(request());
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
