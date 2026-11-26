import { assertServerOnly } from '@/lib/serverOnly';
import {
  WORKBENCH_MIGRATION_FILE,
  getActiveAttempt,
  getTaskRowUnscoped,
  isQueuePaused,
  isWorkbenchSchemaReady,
  listAttemptsForTasks,
  listBatches,
  reapExpiredAttempts,
  listEvents,
  listLatestCostEstimates,
  listTaskRows,
  listWorkers,
} from './store';
import { getLifecycleSnapshot } from './lifecycle';
import { getFinalizationReport } from './finalization';
import { estimateTaskCost } from './costs';
import { deriveWorkerHealth } from './workerHealth';
import { WorkbenchStageTimer } from './telemetry';
import type { DevCostEstimate, DevWorkbenchOverview, DevWorkbenchTask } from './types';

assertServerOnly('lib/pierrot/dev/workbench/overview');

const HISTORY_STATUSES = [
  'failed',
  'manual_review',
  'rejected',
  'cancelled',
  'verified',
  'archived',
];
let lastReapAt = 0;

export type WorkbenchOverviewOptions = {
  /**
   * The caller already ran reapExpiredAttempts in this request (or is a
   * read-only endpoint and must not mutate state). Skip the throttled RPC while
   * still building the snapshot.
   */
  skipReap?: boolean;
  /**
   * Optional stage timer owned by the caller. When omitted the overview creates
   * its own so durations are still emitted to structured telemetry.
   */
  telemetry?: WorkbenchStageTimer;
};

/**
 * The OWNER REVIEW list contains only tasks that genuinely wait for an owner
 * decision. Verified tasks (accepted or merged) belong to history/finalization;
 * showing a merged task here made the owner re-open already-decided work.
 */
export function selectReviewTasks(tasks: DevWorkbenchTask[]): DevWorkbenchTask[] {
  return tasks.filter((task) => task.status === 'review');
}

export async function getWorkbenchOverview(
  userId: string,
  options: WorkbenchOverviewOptions = {}
): Promise<DevWorkbenchOverview> {
  const timer =
    options.telemetry ??
    new WorkbenchStageTimer({ label: 'workbench-overview', source: 'overview' });
  const ownsTimer = !options.telemetry;
  try {
    return await buildWorkbenchOverview(userId, options, timer);
  } finally {
    if (ownsTimer) timer.log();
  }
}

async function buildWorkbenchOverview(
  userId: string,
  options: WorkbenchOverviewOptions,
  timer: WorkbenchStageTimer
): Promise<DevWorkbenchOverview> {
  const schemaReady = await timer.measure('overview.schema', () => isWorkbenchSchemaReady());

  // Callers that intentionally recover (legacy Admin actions) may still run the
  // bounded reap here. Read-only endpoints pass `skipReap`; the cron tick owns
  // autonomous recovery now.
  if (schemaReady && !options.skipReap && Date.now() - lastReapAt > 30_000) {
    lastReapAt = Date.now();
    await timer.measure('overview.reap', () => reapExpiredAttempts());
  }

  const [lifecycle, finalization] = await Promise.all([
    timer.measure('overview.lifecycle', () => getLifecycleSnapshot()),
    timer.measure('overview.finalization_report', () => getFinalizationReport()),
  ]);
  const updatedAt = new Date().toISOString();

  const [allTasks, paused] = await Promise.all([
    timer.measure('overview.tasks', () => listTaskRows({ userId, limit: 200 })),
    schemaReady
      ? timer.measure('overview.queue_state', () => isQueuePaused())
      : Promise.resolve(false),
  ]);

  const storedEstimates = schemaReady
    ? await timer.measure('overview.costs', () =>
        listLatestCostEstimates(allTasks.map((task) => task.id))
      )
    : new Map<string, DevCostEstimate>();
  const tasks = allTasks.map((task) => ({
    ...task,
    // A stored estimate exists for tasks that already entered the queue. Drafts
    // get the same deterministic preview so the owner can see the range before
    // approving them; only the queued value is persisted.
    costEstimate:
      storedEstimates.get(task.id) ||
      estimateTaskCost({
        title: task.title,
        objective: task.objective,
        acceptanceCriteria: task.acceptanceCriteria,
      }),
  }));

  const counts: Record<string, number> = {};
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] || 0) + 1;
  }

  const inbox = tasks.filter((task) => ['draft', 'ready', 'blocked'].includes(task.status));
  // The Queue tab must never look empty while approved work is waiting for an
  // explicit enqueue. Ready tasks are part of the same execution queue: they
  // have no position yet but are shown after the queued tasks so the owner can
  // see and enqueue them without hunting through the inbox.
  const queue = tasks
    .filter((task) => task.status === 'queued' || task.status === 'ready')
    .sort((a, b) => {
      const rank = (task: DevWorkbenchTask) => (task.status === 'queued' ? 0 : 1);
      return (
        rank(a) - rank(b) ||
        b.priority - a.priority ||
        (a.queuePosition ?? Number.MAX_SAFE_INTEGER) -
          (b.queuePosition ?? Number.MAX_SAFE_INTEGER) ||
        (a.queuedAt || '').localeCompare(b.queuedAt || '') ||
        a.createdAt.localeCompare(b.createdAt)
      );
    });
  const review = selectReviewTasks(tasks);
  const historyTasks = tasks.filter((task) => HISTORY_STATUSES.includes(task.status)).slice(0, 24);

  if (!schemaReady) {
    return {
      schemaReady: false,
      migrationFile: WORKBENCH_MIGRATION_FILE,
      queuePaused: false,
      counts,
      inbox,
      queue,
      batches: [],
      active: null,
      history: historyTasks.map((task) => ({ task, attempts: [] })),
      review,
      workers: [],
      workerHealth: deriveWorkerHealth([], []),
      recentEvents: [],
      lifecycle,
      finalization,
      updatedAt,
    };
  }

  const [attemptsByTask, batches, workers, activeAttempt, recentEvents] = await Promise.all([
    timer.measure('overview.attempts', () =>
      listAttemptsForTasks(
        historyTasks.map((task) => task.id),
        20
      )
    ),
    timer.measure('overview.batches', () => listBatches(userId)),
    timer.measure('overview.workers', () => listWorkers()),
    timer.measure('overview.active_attempt', () => getActiveAttempt()),
    timer.measure('overview.events', () => listEvents({ limit: 40 })),
  ]);

  const workerHealth = deriveWorkerHealth(workers, activeAttempt ? [activeAttempt] : []);

  let active: DevWorkbenchOverview['active'] = null;
  if (activeAttempt) {
    const task = await timer.measure('overview.active_task', () =>
      getTaskRowUnscoped(activeAttempt.taskId)
    );
    if (task) {
      const events = await timer.measure('overview.active_events', () =>
        listEvents({ attemptId: activeAttempt.id, limit: 40 })
      );
      active = {
        task,
        attempt: activeAttempt,
        worker: workers.find((worker) => worker.id === activeAttempt.workerId) || null,
        events,
      };
    }
  }

  return {
    schemaReady: true,
    migrationFile: WORKBENCH_MIGRATION_FILE,
    queuePaused: paused,
    counts,
    inbox,
    queue,
    batches,
    active,
    history: historyTasks.map((task) => ({
      task,
      attempts: attemptsByTask.get(task.id) || [],
    })),
    review,
    workers,
    workerHealth,
    recentEvents,
    lifecycle,
    finalization,
    updatedAt,
  };
}

export function findTaskInOverview(
  overview: DevWorkbenchOverview,
  taskId: string
): DevWorkbenchTask | null {
  const buckets = [
    ...overview.inbox,
    ...overview.queue,
    ...overview.review,
    ...overview.history.map((entry) => entry.task),
    ...(overview.active ? [overview.active.task] : []),
  ];
  return buckets.find((task) => task.id === taskId) || null;
}
