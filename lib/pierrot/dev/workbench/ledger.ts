import {
  attemptCostValues,
  codespaceRateInfo,
  modelPricingRateInfo,
  readAttemptCost,
} from './costs';
import type {
  DevAttempt,
  DevBatch,
  DevCostAggregate,
  DevCostComponentSummary,
  DevCostEstimate,
  DevCostLedger,
  DevCostLedgerBatch,
  DevCostLedgerTask,
  DevCostValue,
  DevCostVariance,
  DevCodespaceBillingSnapshot,
  DevCodespaceSessionCost,
  DevWorkbenchTask,
} from './types';

export type CostLedgerTaskInput = {
  task: DevWorkbenchTask;
  attempts: DevAttempt[];
  batchId: string | null;
};

export type CostLedgerBatchInput = {
  batch: DevBatch;
  taskIds: string[];
};

export type CostSessionInput = {
  startedAt: string | null;
  finishedAt: string | null;
  machine: string | null;
  runtimeMs: number | null;
  hourlyUsd: number | null;
  estimatedUsd: number | null;
  currency: string;
  pricingVersion: string | null;
  source: string;
  reason: string | null;
};

export type BuildCostLedgerInput = {
  tasks: CostLedgerTaskInput[];
  batches: CostLedgerBatchInput[];
  sessions: CostSessionInput[];
  periodDays: number;
  now?: Date;
  estimatesTableReady: boolean;
  confirmedBilling: DevCodespaceBillingSnapshot;
};

type ComponentAccumulator = {
  reported: number;
  estimated: number;
  confirmed: number;
  effective: number;
  reportedCount: number;
  estimatedCount: number;
  confirmedCount: number;
  effectiveCount: number;
  attempts: number;
  unknown: Set<string>;
};

const EMPTY_VALUE: DevCostValue = {
  minUsd: null,
  expectedUsd: null,
  maxUsd: null,
};

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function finite(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function uniqueAttempts(attempts: DevAttempt[]): DevAttempt[] {
  const seen = new Set<string>();
  const result: DevAttempt[] = [];
  for (const attempt of attempts) {
    if (!attempt.id || seen.has(attempt.id)) continue;
    seen.add(attempt.id);
    result.push(attempt);
  }
  return result;
}

function emptyAccumulator(): ComponentAccumulator {
  return {
    reported: 0,
    estimated: 0,
    confirmed: 0,
    effective: 0,
    reportedCount: 0,
    estimatedCount: 0,
    confirmedCount: 0,
    effectiveCount: 0,
    attempts: 0,
    unknown: new Set<string>(),
  };
}

function componentSummary(accumulator: ComponentAccumulator): DevCostComponentSummary {
  const attempts = accumulator.attempts;
  return {
    reportedUsd: accumulator.reportedCount > 0 ? round6(accumulator.reported) : null,
    estimatedUsd: accumulator.estimatedCount > 0 ? round6(accumulator.estimated) : null,
    confirmedUsd: accumulator.confirmedCount > 0 ? round6(accumulator.confirmed) : null,
    effectiveUsd:
      attempts > 0 && accumulator.effectiveCount === attempts
        ? round6(accumulator.effective)
        : null,
    reportedAttempts: accumulator.reportedCount,
    estimatedAttempts: accumulator.estimatedCount,
    confirmedAttempts: accumulator.confirmedCount,
    missingAttempts: Math.max(0, attempts - accumulator.effectiveCount),
    unknown: [...accumulator.unknown],
  };
}

function emptyAttemptTotals() {
  return {
    model: componentSummary(emptyAccumulator()),
    codespaces: componentSummary(emptyAccumulator()),
    totalUsd: null,
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    attempts: {
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      timedOut: 0,
      retries: 0,
    },
    commands: { total: 0, failed: 0 },
    missingCostAttempts: 0,
  };
}

/** Aggregate one attempt list. Attempts are deduplicated by id to make repeated
 * event delivery or overlapping task/batch queries harmless. */
export function buildAttemptTotals(attempts: DevAttempt[]) {
  const list = uniqueAttempts(attempts);
  if (list.length === 0) return emptyAttemptTotals();

  const model = emptyAccumulator();
  const codespaces = emptyAccumulator();
  let totalSum = 0;
  let totalKnown = true;
  let inputTokens: number | null = 0;
  let outputTokens: number | null = 0;
  let reasoningTokens: number | null = 0;
  let cacheReadTokens: number | null = 0;
  let cacheWriteTokens: number | null = 0;
  let commands = 0;
  let failedCommands = 0;
  let missingCostAttempts = 0;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let timedOut = 0;

  for (const attempt of list) {
    if (attempt.status === 'completed') completed += 1;
    else if (attempt.status === 'failed') failed += 1;
    else if (attempt.status === 'cancelled') cancelled += 1;
    else if (attempt.status === 'timed_out') timedOut += 1;
    commands += attempt.commands.length;
    failedCommands += attempt.commands.filter((command) => command.status === 'failed').length;

    const cost = readAttemptCost(attempt.verification);
    const values = attemptCostValues(cost);
    model.attempts += 1;
    codespaces.attempts += 1;
    if (values.modelReportedUsd !== null) {
      model.reported += values.modelReportedUsd;
      model.reportedCount += 1;
    }
    if (values.modelEstimatedUsd !== null) {
      model.estimated += values.modelEstimatedUsd;
      model.estimatedCount += 1;
    }
    if (values.modelEffectiveUsd !== null) {
      model.effective += values.modelEffectiveUsd;
      model.effectiveCount += 1;
    } else {
      model.unknown.add('model cost unavailable');
    }
    if (values.codespaceEstimatedUsd !== null) {
      codespaces.estimated += values.codespaceEstimatedUsd;
      codespaces.estimatedCount += 1;
    }
    if (values.codespaceConfirmedUsd !== null) {
      codespaces.confirmed += values.codespaceConfirmedUsd;
      codespaces.confirmedCount += 1;
    }
    if (values.codespaceEffectiveUsd !== null) {
      codespaces.effective += values.codespaceEffectiveUsd;
      codespaces.effectiveCount += 1;
    } else {
      codespaces.unknown.add('Codespaces cost unavailable');
    }
    for (const item of values.unknown) {
      if (/codespace|runtime/i.test(item)) codespaces.unknown.add(item);
      else model.unknown.add(item);
    }

    if (values.totalUsd === null) {
      totalKnown = false;
      missingCostAttempts += 1;
    } else {
      totalSum += values.totalUsd;
    }
    inputTokens = inputTokens === null || values.inputTokens === null
      ? null
      : inputTokens + values.inputTokens;
    outputTokens = outputTokens === null || values.outputTokens === null
      ? null
      : outputTokens + values.outputTokens;
    reasoningTokens = reasoningTokens === null || values.reasoningTokens === null
      ? null
      : reasoningTokens + values.reasoningTokens;
    cacheReadTokens = cacheReadTokens === null || values.cacheReadTokens === null
      ? null
      : cacheReadTokens + values.cacheReadTokens;
    cacheWriteTokens = cacheWriteTokens === null || values.cacheWriteTokens === null
      ? null
      : cacheWriteTokens + values.cacheWriteTokens;
  }

  const totalUsd =
    totalKnown && list.length > 0 && missingCostAttempts === 0 ? round6(totalSum) : null;
  return {
    model: componentSummary(model),
    codespaces: componentSummary(codespaces),
    totalUsd,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    attempts: {
      total: list.length,
      completed,
      failed,
      cancelled,
      timedOut,
      retries: Math.max(0, list.length - 1),
    },
    commands: { total: commands, failed: failedCommands },
    missingCostAttempts,
  };
}

function estimateValue(estimate: DevCostEstimate | null): DevCostValue {
  if (!estimate) return EMPTY_VALUE;
  return {
    minUsd: finite(estimate.total.minUsd),
    expectedUsd: finite(estimate.total.expectedUsd),
    maxUsd: finite(estimate.total.maxUsd),
  };
}

function sumEstimates(estimates: Array<DevCostEstimate | null>): {
  value: DevCostValue;
  missing: number;
} {
  if (estimates.length === 0) return { value: EMPTY_VALUE, missing: 0 };
  let min: number | null = 0;
  let expected: number | null = 0;
  let max: number | null = 0;
  let missing = 0;
  for (const estimate of estimates) {
    const value = estimateValue(estimate);
    if (!estimate || value.minUsd === null || value.expectedUsd === null || value.maxUsd === null) {
      missing += 1;
      min = null;
      expected = null;
      max = null;
      continue;
    }
    if (min !== null) min += value.minUsd;
    if (expected !== null) expected += value.expectedUsd;
    if (max !== null) max += value.maxUsd;
  }
  return {
    value: {
      minUsd: min === null ? null : round6(min),
      expectedUsd: expected === null ? null : round6(expected),
      maxUsd: max === null ? null : round6(max),
    },
    missing,
  };
}

function variance(estimate: DevCostValue, actualUsd: number | null): DevCostVariance {
  if (actualUsd === null || estimate.expectedUsd === null) {
    return {
      expectedUsd: estimate.expectedUsd,
      actualUsd,
      deltaUsd: null,
      deltaPct: null,
      status: 'unknown',
    };
  }
  const delta = round6(actualUsd - estimate.expectedUsd);
  return {
    expectedUsd: estimate.expectedUsd,
    actualUsd,
    deltaUsd: delta,
    deltaPct:
      estimate.expectedUsd === 0 ? null : Math.round((delta / estimate.expectedUsd) * 10000) / 100,
    status:
      Math.abs(delta) < 0.01 ? 'on_target' : delta < 0 ? 'under' : 'over',
  };
}

function aggregate(input: {
  tasks: DevWorkbenchTask[];
  estimates: Array<DevCostEstimate | null>;
  attempts: DevAttempt[];
}): DevCostAggregate {
  const actual = buildAttemptTotals(input.attempts);
  const summed = sumEstimates(input.estimates);
  const successful = input.tasks.filter((task) => task.status === 'verified');
  const successfulAttemptTotals = successful.map((task) => {
    const attempts = input.attempts.filter((attempt) => attempt.taskId === task.id);
    return buildAttemptTotals(attempts).totalUsd;
  });
  const successfulWithCost = successfulAttemptTotals.filter(
    (value): value is number => value !== null
  );
  const unknown = new Set([
    ...actual.model.unknown,
    ...actual.codespaces.unknown,
    ...(summed.missing > 0 ? ['task estimate missing'] : []),
  ]);
  return {
    estimate: summed.value,
    actual,
    variance: variance(summed.value, actual.totalUsd),
    taskCount: input.tasks.length,
    successfulTasks: successful.length,
    successfulTasksWithCost: successfulWithCost.length,
    averageSuccessfulTaskUsd:
      successfulWithCost.length > 0
        ? round6(
            successfulWithCost.reduce((sum, value) => sum + value, 0) /
              successfulWithCost.length
          )
        : null,
    incomplete: {
      missingEstimateTasks: summed.missing,
      attemptsMissingCost: actual.missingCostAttempts,
      unknown: [...unknown],
    },
  };
}

function timestamp(attempt: DevAttempt): string | null {
  return attempt.finishedAt || attempt.startedAt || attempt.createdAt || null;
}

function inPeriod(attempt: DevAttempt, fromMs: number): boolean {
  const value = timestamp(attempt);
  if (!value) return false;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed >= fromMs;
}

function overlapMs(
  startA: string | null,
  endA: string | null,
  startB: string | null,
  endB: string | null
): number {
  if (!startA || !endA || !startB || !endB) return 0;
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return 0;
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function buildSessions(
  sessions: CostSessionInput[],
  attempts: DevAttempt[],
  periodFromMs: number
): {
  sessions: DevCodespaceSessionCost[];
  periodSessionEstimatedUsd: number | null;
  periodIdleEstimatedUsd: number | null;
} {
  let periodSessionSum = 0;
  let periodSessionCount = 0;
  let periodSessionInvalid = false;
  let periodIdleSum = 0;
  let periodIdleCount = 0;
  let periodIdleInvalid = false;
  const result = sessions.map((session) => {
    const attemptRuntimeMs = attempts.reduce(
      (sum, attempt) =>
        sum + overlapMs(session.startedAt, session.finishedAt, attempt.startedAt, attempt.finishedAt),
      0
    );
    const idleRuntimeMs =
      session.runtimeMs === null
        ? null
        : Math.max(0, session.runtimeMs - attemptRuntimeMs);
    const idleEstimatedUsd =
      idleRuntimeMs === null || session.hourlyUsd === null
        ? null
        : round6((session.hourlyUsd * idleRuntimeMs) / 3_600_000);
    const sessionAt = session.finishedAt || session.startedAt;
    const inWindow =
      sessionAt !== null &&
      Number.isFinite(new Date(sessionAt).getTime()) &&
      new Date(sessionAt).getTime() >= periodFromMs;
    if (inWindow) {
      if (session.estimatedUsd === null) periodSessionInvalid = true;
      else {
        periodSessionSum += session.estimatedUsd;
        periodSessionCount += 1;
      }
      if (idleEstimatedUsd === null) periodIdleInvalid = true;
      else {
        periodIdleSum += idleEstimatedUsd;
        periodIdleCount += 1;
      }
    }
    return {
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      machine: session.machine,
      runtimeMs: session.runtimeMs,
      hourlyUsd: session.hourlyUsd,
      estimatedUsd: session.estimatedUsd,
      currency: session.currency,
      pricingVersion: session.pricingVersion,
      source: session.source,
      reason: session.reason,
      attemptRuntimeMs,
      idleRuntimeMs,
      idleEstimatedUsd,
    };
  });
  return {
    sessions: result,
    periodSessionEstimatedUsd:
      periodSessionCount > 0 && !periodSessionInvalid ? round6(periodSessionSum) : null,
    periodIdleEstimatedUsd:
      periodIdleCount > 0 && !periodIdleInvalid ? round6(periodIdleSum) : null,
  };
}

export function buildCostLedger(input: BuildCostLedgerInput): DevCostLedger {
  const now = input.now || new Date();
  const periodDays = Math.min(Math.max(Math.trunc(input.periodDays || 30), 1), 365);
  const periodFrom = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const allAttempts = uniqueAttempts(input.tasks.flatMap((entry) => entry.attempts));
  const tasks = input.tasks.map((entry) => entry.task);
  const estimates = input.tasks.map((entry) => entry.task.costEstimate || null);
  const totals = aggregate({ tasks, estimates, attempts: allAttempts });

  const periodAttempts = allAttempts.filter((attempt) =>
    inPeriod(attempt, periodFrom.getTime())
  );
  const periodTaskIds = new Set(periodAttempts.map((attempt) => attempt.taskId));
  const periodTasks = input.tasks
    .filter((entry) => periodTaskIds.has(entry.task.id))
    .map((entry) => entry.task);
  const periodEstimates = input.tasks
    .filter((entry) => periodTaskIds.has(entry.task.id))
    .map((entry) => entry.task.costEstimate || null);
  const period = aggregate({
    tasks: periodTasks,
    estimates: periodEstimates,
    attempts: periodAttempts,
  });

  const taskLedger: DevCostLedgerTask[] = input.tasks.map((entry) => {
    const entryEstimate = entry.task.costEstimate || null;
    const result = aggregate({
      tasks: [entry.task],
      estimates: [entryEstimate],
      attempts: entry.attempts,
    });
    if (entry.task.attemptCount > entry.attempts.length) {
      result.incomplete.unknown.push(
        `${entry.task.attemptCount - entry.attempts.length} attempt(s) outside the loaded history`
      );
    }
    return {
      ...result,
      taskId: entry.task.id,
      title: entry.task.title,
      status: entry.task.status,
      batchId: entry.batchId,
      costEstimate: entryEstimate,
    };
  });

  const taskById = new Map(input.tasks.map((entry) => [entry.task.id, entry]));
  const batchLedger: DevCostLedgerBatch[] = input.batches.map((entry) => {
    const entries = entry.taskIds
      .map((taskId) => taskById.get(taskId))
      .filter((item): item is CostLedgerTaskInput => Boolean(item));
    const batchTasks = entries.map((item) => item.task);
    const batchAttempts = uniqueAttempts(entries.flatMap((item) => item.attempts));
    const missingTasks = entry.taskIds.length - entries.length;
    const result = aggregate({
      tasks: batchTasks,
      estimates: entries.map((item) => item.task.costEstimate || null),
      attempts: batchAttempts,
    });
    if (missingTasks > 0) {
      result.incomplete.unknown.push(`${missingTasks} batch task(s) not loaded`);
    }
    return {
      ...result,
      batchId: entry.batch.id,
      title: entry.batch.title,
      status: entry.batch.status,
      taskIds: entry.taskIds,
    };
  });

  const sessionResult = buildSessions(input.sessions, allAttempts, periodFrom.getTime());
  const expectedAttempts = tasks.reduce(
    (sum, devTask) => sum + Math.max(0, devTask.attemptCount),
    0
  );
  const dataQualityUnknown = new Set([
    ...totals.incomplete.unknown,
    ...(input.estimatesTableReady ? [] : ['cost estimate table not applied']),
    ...(expectedAttempts > allAttempts.length
      ? ['attempt history is truncated for some tasks']
      : []),
  ]);

  return {
    generatedAt: now.toISOString(),
    currency: 'USD',
    periodDays,
    periodFrom: periodFrom.toISOString(),
    pricing: {
      model: modelPricingRateInfo(),
      codespaces: codespaceRateInfo(null),
    },
    estimatesTableReady: input.estimatesTableReady,
    confirmedBilling: input.confirmedBilling,
    totals,
    period,
    tasks: taskLedger,
    batches: batchLedger,
    codespaces: {
      sessions: sessionResult.sessions,
      periodSessionEstimatedUsd: sessionResult.periodSessionEstimatedUsd,
      periodIdleEstimatedUsd: sessionResult.periodIdleEstimatedUsd,
      note: 'Codespace session and idle values are shown separately and are never added to task or batch actuals, because attempt runtime is already part of each attempt. Storage and shared account charges are excluded unless GitHub reports reliable attribution.',
    },
    dataQuality: {
      attemptsExamined: allAttempts.length,
      attemptsMissingCost: totals.incomplete.attemptsMissingCost,
      missingEstimateTasks: totals.incomplete.missingEstimateTasks,
      unknown: [...dataQualityUnknown],
    },
  };
}
