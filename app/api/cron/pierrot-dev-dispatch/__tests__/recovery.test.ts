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

jest.mock('@/lib/knowledge/brain/cronAuth', () => ({
  isCronAuthorized: jest.fn(() => true),
}));

jest.mock('@/lib/pierrot/dev/workbench/recovery', () => ({
  runWorkbenchRecovery: jest.fn(),
}));

import { GET, POST } from '../route';
import { isCronAuthorized } from '@/lib/knowledge/brain/cronAuth';
import { runWorkbenchRecovery } from '@/lib/pierrot/dev/workbench/recovery';

const authorized = isCronAuthorized as jest.Mock;
const recover = runWorkbenchRecovery as jest.Mock;

function recoveryResult(overrides: Record<string, unknown> = {}) {
  return {
    source: 'cron:pierrot-dev-dispatch',
    startedAt: '2026-11-26T10:00:00.000Z',
    durationMs: 12,
    budgetMs: 20_000,
    timedOut: false,
    status: 'ok',
    steps: [
      {
        step: 'reap',
        status: 'ok',
        durationMs: 3,
        startedAt: '2026-11-26T10:00:00.000Z',
        code: null,
        detail: null,
      },
      {
        step: 'dispatch',
        status: 'ok',
        durationMs: 9,
        startedAt: '2026-11-26T10:00:00.003Z',
        code: null,
        detail: null,
      },
    ],
    reaped: 1,
    dispatch: { dispatched: false, code: 'NO_QUEUED_WORK' },
    finalization: null,
    failures: [],
    telemetry: {
      label: 'workbench-recovery',
      source: 'cron:pierrot-dev-dispatch',
      totalMs: 12,
      stages: [
        { stage: 'reap', status: 'ok', durationMs: 3, startedAt: '', code: null },
        { stage: 'dispatch', status: 'ok', durationMs: 9, startedAt: '', code: null },
      ],
    },
    ...overrides,
  };
}

function request() {
  return new Request('http://localhost/api/cron/pierrot-dev-dispatch', { method: 'POST' });
}

beforeEach(() => {
  jest.clearAllMocks();
  authorized.mockReturnValue(true);
  recover.mockResolvedValue(recoveryResult());
});

describe('Pierrot Dev dispatch cron', () => {
  it('runs one bounded reap + dispatch pass and exposes stage telemetry', async () => {
    const response = await POST(request());
    const body = (await response.json()) as { status: string; recovery: unknown };

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(recover).toHaveBeenCalledWith({
      source: 'cron:pierrot-dev-dispatch',
      steps: ['reap', 'dispatch'],
      budgetMs: 20_000,
    });
    expect(response.headers['Server-Timing']).toContain('reap;dur=3');
    expect(response.headers['Server-Timing']).toContain('dispatch;dur=9');
  });

  it('returns a successful partial tick so the next schedule can retry', async () => {
    recover.mockResolvedValueOnce(
      recoveryResult({
        status: 'partial',
        failures: [{ step: 'dispatch', code: 'DISPATCH_API_TRANSIENT', detail: 'GitHub down' }],
      })
    );
    const response = await POST(request());
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe('partial');
  });

  it('reports a fully failed pass to the scheduler', async () => {
    recover.mockResolvedValueOnce(recoveryResult({ status: 'failed' }));
    const response = await POST(request());
    expect(response.status).toBe(503);
  });

  it('returns 503 when the recovery itself throws', async () => {
    recover.mockRejectedValueOnce(new Error('unexpected failure'));
    const response = await POST(request());
    expect(response.status).toBe(503);
  });

  it('keeps GET and POST equivalent and rejects an unauthorized caller', async () => {
    const getResponse = await GET(request());
    expect(getResponse.status).toBe(200);

    authorized.mockReturnValueOnce(false);
    const denied = await POST(request());
    expect(denied.status).toBe(401);
    expect(recover).toHaveBeenCalledTimes(1);
  });
});
