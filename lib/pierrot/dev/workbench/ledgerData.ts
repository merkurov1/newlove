import { assertServerOnly } from '@/lib/serverOnly';
import { estimateTaskCost } from './costs';
import { buildCostLedger } from './ledger';
import type { CostSessionInput } from './ledger';
import {
  getSetting,
  isCostLedgerTableReady,
  isWorkbenchSchemaReady,
  listAttemptsForLedger,
  listBatches,
  listLatestCostEstimates,
  listTaskRows,
} from './store';
import { getCodespacesBillingSnapshot } from './billing';
import type { DevAttempt, DevCostEstimate } from './types';

assertServerOnly('lib/pierrot/dev/workbench/ledgerData');

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseSessions(value: unknown): CostSessionInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .slice(-50)
    .map((item) => ({
      startedAt: stringOrNull(item.startedAt),
      finishedAt: stringOrNull(item.finishedAt),
      machine: stringOrNull(item.machine),
      runtimeMs: numberOrNull(item.runtimeMs),
      hourlyUsd: numberOrNull(item.hourlyUsd),
      estimatedUsd: numberOrNull(item.estimatedUsd),
      currency: stringOrNull(item.currency) || 'USD',
      pricingVersion: stringOrNull(item.pricingVersion),
      source: stringOrNull(item.source) || 'lifecycle',
      reason: stringOrNull(item.reason),
    }));
}

export async function getDevCostLedger(
  userId: string,
  options: { days?: number } = {}
) {
  const schemaReady = await isWorkbenchSchemaReady();
  const tasks = schemaReady ? await listTaskRows({ userId, limit: 200 }) : [];
  const taskIds = tasks.map((task) => task.id);

  const [batches, estimates, attempts, estimatesTableReady, sessionsValue, confirmedBilling] =
    await Promise.all([
      schemaReady ? listBatches(userId) : Promise.resolve([]),
      schemaReady
        ? listLatestCostEstimates(taskIds)
        : Promise.resolve(new Map<string, DevCostEstimate>()),
      schemaReady ? listAttemptsForLedger(taskIds) : Promise.resolve([] as DevAttempt[]),
      schemaReady ? isCostLedgerTableReady() : Promise.resolve(false),
      schemaReady
        ? getSetting<unknown>('lifecycle:sessions', [])
        : Promise.resolve([] as unknown[]),
      getCodespacesBillingSnapshot(),
    ]);

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const attemptsByTask = new Map<string, DevAttempt[]>();
  for (const attempt of attempts) {
    const bucket = attemptsByTask.get(attempt.taskId) || [];
    bucket.push(attempt);
    attemptsByTask.set(attempt.taskId, bucket);
  }
  const batchIdByTask = new Map<string, string>();
  for (const batch of batches) {
    for (const item of batch.items) {
      if (!batchIdByTask.has(item.taskId)) batchIdByTask.set(item.taskId, batch.id);
    }
  }

  const ledgerTasks = tasks.map((task) => {
    const stored = estimates.get(task.id);
    const estimate: DevCostEstimate =
      stored ||
      estimateTaskCost({
        title: task.title,
        objective: task.objective,
        acceptanceCriteria: task.acceptanceCriteria,
      });
    return {
      task: { ...task, costEstimate: estimate },
      attempts: attemptsByTask.get(task.id) || [],
      batchId: batchIdByTask.get(task.id) || null,
    };
  });

  return buildCostLedger({
    tasks: ledgerTasks,
    batches: batches.map((batch) => ({
      batch,
      taskIds: batch.items
        .map((item) => item.taskId)
        .filter((taskId) => taskById.has(taskId)),
    })),
    sessions: parseSessions(sessionsValue),
    periodDays: options.days || 30,
    estimatesTableReady,
    confirmedBilling,
  });
}
