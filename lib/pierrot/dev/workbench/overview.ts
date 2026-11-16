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
  listTaskRows,
  listWorkers,
} from './store';
import { getLifecycleSnapshot } from './lifecycle';
import type { DevWorkbenchOverview, DevWorkbenchTask } from './types';

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

  const lifecycle = await getLifecycleSnapshot();
  const updatedAt = new Date().toISOString();

  const [allTasks, paused] = await Promise.all([
    listTaskRows({ userId, limit: 200 }),
    schemaReady ? isQueuePaused() : Promise.resolve(false),
  ]);

  const counts: Record<string, number> = {};
  for (const task of allTasks) {
    counts[task.status] = (counts[task.status] || 0) + 1;
  }

  const inbox = allTasks.filter((task) =>
    ['draft', 'ready', 'blocked'].includes(task.status)
  );
  const queue = allTasks
    .filter((task) => task.status === 'queued')
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.queuePosition ?? Number.MAX_SAFE_INTEGER) -
          (b.queuePosition ?? Number.MAX_SAFE_INTEGER) ||
        (a.queuedAt || '').localeCompare(b.queuedAt || '')
    );
  const review = allTasks.filter(
    (task) =>
      task.status === 'review' ||
      (task.status === 'verified' && task.pullRequests.length > 0)
  );
  const historyTasks = allTasks
    .filter((task) => HISTORY_STATUSES.includes(task.status))
    .slice(0, 24);

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
      updatedAt,
    };
  }

  const [attemptsByTask, batches, workers, activeAttempt, recentEvents] = await Promise.all([
    listAttemptsForTasks(historyTasks.map((task) => task.id), 20),
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
