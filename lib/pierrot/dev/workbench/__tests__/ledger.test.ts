/** @jest-environment node */

import { buildAttemptCost, estimateTaskCost } from '../costs';
import { buildCostLedger } from '../ledger';
import type {
  DevAttempt,
  DevBatch,
  DevCostEstimate,
  DevWorkbenchTask,
} from '../types';

function task(overrides: Partial<DevWorkbenchTask> = {}): DevWorkbenchTask {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Cost ledger',
    objective: 'Track estimate and actual cost.',
    repository: 'newlove',
    baseRef: 'main',
    status: 'verified',
    priority: 0,
    queuePosition: null,
    queuedAt: null,
    attemptCount: 1,
    acceptanceCriteria: ['Estimates exist before queue'],
    verificationStatus: 'verified',
    blockedReason: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    resultCommit: null,
    resultNotes: '',
    pullRequests: [],
    updatedAt: '2026-11-17T10:00:00.000Z',
    createdAt: '2026-11-17T09:00:00.000Z',
    costEstimate: null,
    ...overrides,
  };
}

function attempt(input: {
  id: string;
  taskId: string;
  status: DevAttempt['status'];
  usage?: Record<string, unknown> | null;
  machine?: string | null;
  runtimeMs?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}): DevAttempt {
  const cost =
    input.status === 'failed' || input.status === 'completed'
      ? buildAttemptCost({
          usage: input.usage === null ? null : input.usage || {},
          machine: input.machine || null,
          runtimeMs: input.runtimeMs ?? null,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt,
          modelStarted: input.usage !== null,
        })
      : null;
  return {
    id: input.id,
    taskId: input.taskId,
    attemptNumber: 1,
    status: input.status,
    workerId: 'worker',
    branch: null,
    baseRef: 'main',
    baseCommit: null,
    headSha: null,
    prNumber: null,
    prUrl: null,
    opencodeSessionId: null,
    exitCode: null,
    startedAt: input.startedAt || null,
    finishedAt: input.finishedAt || null,
    heartbeatAt: null,
    leaseExpiresAt: null,
    progressStage: null,
    resultSummary: null,
    changedFiles: [],
    commands: [],
    warnings: [],
    verification: cost ? { cost } : {},
    errorCode: null,
    errorMessage: null,
    logExcerpt: null,
    createdAt: input.startedAt || '2026-11-17T09:00:00.000Z',
  };
}

function estimateWithTotal(expectedUsd: number): DevCostEstimate {
  const base = estimateTaskCost({
    title: 'Cost ledger',
    objective: 'Track estimate and actual cost.',
    acceptanceCriteria: ['Estimates exist before queue'],
  });
  return {
    ...base,
    persisted: true,
    total: {
      minUsd: expectedUsd / 2,
      expectedUsd,
      maxUsd: expectedUsd * 2,
    },
  };
}

describe('Dev Cost Ledger aggregation', () => {
  it('sums every retry once and computes task, batch and total variance', () => {
    const taskId = '11111111-1111-4111-8111-111111111111';
    const devTask = task({ id: taskId, attemptCount: 2, costEstimate: estimateWithTotal(0.5) });
    const first = attempt({
      id: 'attempt-1',
      taskId,
      status: 'failed',
      usage: {
        provider: 'deepseek',
        model: 'deepseek/deepseek-chat',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.1,
        steps: 1,
      },
      machine: 'basicLinux32gb',
      runtimeMs: 60 * 60 * 1000,
      startedAt: '2026-11-17T09:00:00.000Z',
      finishedAt: '2026-11-17T10:00:00.000Z',
    });
    const second = attempt({
      id: 'attempt-2',
      taskId,
      status: 'completed',
      usage: {
        provider: 'deepseek',
        model: 'deepseek/deepseek-chat',
        inputTokens: 200,
        outputTokens: 100,
        costUsd: 0.2,
        steps: 1,
      },
      machine: 'basicLinux32gb',
      runtimeMs: 2 * 60 * 60 * 1000,
      startedAt: '2026-11-17T10:00:00.000Z',
      finishedAt: '2026-11-17T12:00:00.000Z',
    });
    const batch: DevBatch = {
      id: 'batch-1',
      title: 'Batch',
      description: '',
      status: 'active',
      priority: 0,
      itemCount: 1,
      items: [
        {
          id: 'item-1',
          taskId,
          title: devTask.title,
          status: devTask.status,
          position: 0,
          dependsOnTaskId: null,
        },
      ],
      createdAt: '2026-11-17T08:00:00.000Z',
      updatedAt: '2026-11-17T08:00:00.000Z',
    };

    const ledger = buildCostLedger({
      tasks: [{ task: devTask, attempts: [first, second], batchId: batch.id }],
      batches: [{ batch, taskIds: [taskId] }],
      sessions: [],
      periodDays: 30,
      now: new Date('2026-11-17T12:00:00.000Z'),
      estimatesTableReady: true,
      confirmedBilling: {
        status: 'unavailable',
        source: 'github-billing-api',
        checkedAt: '2026-11-17T12:00:00.000Z',
        reason: 'permission',
        totalMinutesUsed: null,
        totalPaidMinutesUsed: null,
        includedMinutes: null,
        minutesUsedBreakdown: null,
      },
    });

    expect(ledger.totals.actual.totalUsd).toBeCloseTo(0.84, 6);
    expect(ledger.totals.actual.attempts.total).toBe(2);
    expect(ledger.totals.actual.attempts.retries).toBe(1);
    expect(ledger.totals.variance.status).toBe('over');
    expect(ledger.totals.variance.deltaUsd).toBeCloseTo(0.34, 6);
    expect(ledger.totals.averageSuccessfulTaskUsd).toBeCloseTo(0.84, 6);
    expect(ledger.tasks[0].actual.totalUsd).toBeCloseTo(0.84, 6);
    expect(ledger.batches[0].actual.totalUsd).toBeCloseTo(0.84, 6);
    expect(ledger.batches[0].actual.attempts.total).toBe(2);
  });

  it('does not turn an attempt without cost data into zero', () => {
    const taskId = '22222222-2222-4222-8222-222222222222';
    const devTask = task({ id: taskId, status: 'verified', costEstimate: estimateWithTotal(0.5) });
    const noCost = attempt({
      id: 'attempt-missing',
      taskId,
      status: 'completed',
      usage: null,
      machine: null,
      runtimeMs: null,
      startedAt: '2026-11-17T09:00:00.000Z',
      finishedAt: '2026-11-17T10:00:00.000Z',
    });

    const ledger = buildCostLedger({
      tasks: [{ task: devTask, attempts: [noCost], batchId: null }],
      batches: [],
      sessions: [],
      periodDays: 30,
      now: new Date('2026-11-17T12:00:00.000Z'),
      estimatesTableReady: false,
      confirmedBilling: {
        status: 'unavailable',
        source: 'github-billing-api',
        checkedAt: '2026-11-17T12:00:00.000Z',
        reason: null,
        totalMinutesUsed: null,
        totalPaidMinutesUsed: null,
        includedMinutes: null,
        minutesUsedBreakdown: null,
      },
    });

    expect(ledger.totals.actual.totalUsd).toBeNull();
    expect(ledger.totals.actual.model.effectiveUsd).toBeNull();
    expect(ledger.totals.actual.codespaces.effectiveUsd).toBeNull();
    expect(ledger.totals.incomplete.attemptsMissingCost).toBe(1);
    expect(ledger.totals.variance.status).toBe('unknown');
    expect(ledger.dataQuality.unknown).toContain('cost estimate table not applied');
  });

  it('applies the selected period to actuals without dropping all-time totals', () => {
    const taskId = '33333333-3333-4333-8333-333333333333';
    const devTask = task({ id: taskId, attemptCount: 2, costEstimate: estimateWithTotal(0.5) });
    const inside = attempt({
      id: 'attempt-inside',
      taskId,
      status: 'completed',
      usage: { costUsd: 0.1, steps: 1 },
      machine: 'basicLinux32gb',
      runtimeMs: 60 * 60 * 1000,
      startedAt: '2026-11-16T09:00:00.000Z',
      finishedAt: '2026-11-16T10:00:00.000Z',
    });
    const outside = attempt({
      id: 'attempt-outside',
      taskId,
      status: 'completed',
      usage: { costUsd: 0.2, steps: 1 },
      machine: 'basicLinux32gb',
      runtimeMs: 2 * 60 * 60 * 1000,
      startedAt: '2026-09-01T09:00:00.000Z',
      finishedAt: '2026-09-01T11:00:00.000Z',
    });

    const ledger = buildCostLedger({
      tasks: [{ task: devTask, attempts: [inside, outside], batchId: null }],
      batches: [],
      sessions: [],
      periodDays: 7,
      now: new Date('2026-11-17T12:00:00.000Z'),
      estimatesTableReady: true,
      confirmedBilling: {
        status: 'unavailable',
        source: 'github-billing-api',
        checkedAt: '2026-11-17T12:00:00.000Z',
        reason: null,
        totalMinutesUsed: null,
        totalPaidMinutesUsed: null,
        includedMinutes: null,
        minutesUsedBreakdown: null,
      },
    });

    expect(ledger.totals.actual.attempts.total).toBe(2);
    expect(ledger.period.actual.attempts.total).toBe(1);
    expect(ledger.period.actual.totalUsd).toBeCloseTo(0.28, 6);
    expect(ledger.totals.actual.totalUsd).toBeCloseTo(0.84, 6);
  });
});
