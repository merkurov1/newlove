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
import type { DevCostEstimate, DevWorkbenchOverview, DevWorkbenchTask } from './types';

assertServerOnly('lib/pierrot/dev/workbench/overview');

const HISTORY_STATUSES = ['failed', 'rejected', 'cancelled', 'verified', 'archived'];
let lastReapAt = 0;

export type WorkbenchOverviewOptions = {
  /**
   * The caller already ran reapExpiredAttempts in this request. Skip the
   * throttled duplicate RPC while still building the post-reap snapshot.
   */
  skipReap?: boolean;
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
  const schemaReady = await isWorkbenchSchemaReady();

  // Viewing Admin is enough to detect an expired worker lease. This is a
  // bounded RPC, not a cron job, and it never creates work. It must finish
  // before the lifecycle snapshot is read so Admin reports the recovered state.
  if (schemaReady && !options.skipReap && Date.now() - lastReapAt > 30_000) {
    lastReapAt = Date.now();
    await reapExpiredAttempts();
  }

  const [lifecycle, finalization] = await Promise.all([
    getLifecycleSnapshot(),
    getFinalizationReport(),
  ]);
  const updatedAt = new Date().toISOString();

  const [allTasks, paused] = await Promise.all([
    listTaskRows({ userId, limit: 200 }),
    schemaReady ? isQueuePaused() : Promise.resolve(false),
  ]);

  const storedEstimates = schemaReady
    ? await listLatestCostEstimates(allTasks.map((task) => task.id))
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
  const queue = tasks
    .filter((task) => task.status === 'queued')
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.queuePosition ?? Number.MAX_SAFE_INTEGER) -
          (b.queuePosition ?? Number.MAX_SAFE_INTEGER) ||
        (a.queuedAt || '').localeCompare(b.queuedAt || '')
    );
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
      recentEvents: [],
      lifecycle,
      finalization,
      updatedAt,
    };
  }

  const [attemptsByTask, batches, workers, activeAttempt, recentEvents] = await Promise.all([
    listAttemptsForTasks(
      historyTasks.map((task) => task.id),
      20
    ),
    listBatches(userId),
    listWorkers(),
    getActiveAttempt(),
    listEvents({ limit: 40 }),
  ]);

  let active: DevWorkbenchOverview['active'] = null;
  if (activeAttempt) {
    const task = await getTaskRowUnscoped(activeAttempt.taskId);
    if (task) {
      const events = await listEvents({ attemptId: activeAttempt.id, limit: 40 });
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
