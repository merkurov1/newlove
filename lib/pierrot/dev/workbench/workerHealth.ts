/**
 * Pure worker-health diagnostics shared by the Admin overview and tests.
 *
 * The worker table is history: finished and heartbeat-expired rows stay in
 * Supabase. This helper derives what the owner should see without mutating or
 * deleting anything, and flags worker pointers that no longer match the one
 * active attempt.
 */

import type { DevAttempt, DevWorker, DevWorkerHealthSummary } from './types';

export function deriveWorkerHealth(
  workers: DevWorker[],
  activeAttempts: DevAttempt[] = []
): DevWorkerHealthSummary {
  const activeById = new Map(activeAttempts.map((attempt) => [attempt.id, attempt]));
  const summary: DevWorkerHealthSummary = {
    total: workers.length,
    active: 0,
    stale: 0,
    historical: 0,
    finished: 0,
    orphan: 0,
    pointerMismatch: 0,
    issues: [],
  };

  for (const worker of workers) {
    const isActive = worker.online === true && worker.finished !== true;
    if (isActive) summary.active += 1;
    else if (worker.stale === true) summary.stale += 1;
    else summary.historical += 1;
    if (worker.finished === true) summary.finished += 1;

    let hasOrphanPointer = false;
    if (worker.currentAttemptId) {
      const attempt = activeById.get(worker.currentAttemptId);
      if (!attempt) {
        hasOrphanPointer = true;
        summary.issues.push({
          workerId: worker.id,
          code: 'ORPHAN_CURRENT_ATTEMPT',
          message: `Worker points at attempt ${worker.currentAttemptId}, which is not active.`,
        });
      } else if (attempt.workerId && attempt.workerId !== worker.id) {
        hasOrphanPointer = true;
        summary.issues.push({
          workerId: worker.id,
          code: 'ORPHAN_CURRENT_ATTEMPT',
          message: `Worker points at attempt ${attempt.id}, but the attempt belongs to ${attempt.workerId}.`,
        });
      } else if (worker.currentTaskId && worker.currentTaskId !== attempt.taskId) {
        summary.pointerMismatch += 1;
        summary.issues.push({
          workerId: worker.id,
          code: 'POINTER_MISMATCH',
          message: `Worker current_task_id ${worker.currentTaskId} does not match active attempt task ${attempt.taskId}.`,
        });
      }
    } else if (worker.currentTaskId) {
      hasOrphanPointer = true;
      summary.issues.push({
        workerId: worker.id,
        code: 'ORPHAN_CURRENT_TASK',
        message: `Worker points at task ${worker.currentTaskId} without an active attempt.`,
      });
    }

    if (hasOrphanPointer) summary.orphan += 1;

    for (const attempt of activeAttempts) {
      if (attempt.workerId !== worker.id) continue;
      if (worker.currentAttemptId === attempt.id) continue;
      summary.pointerMismatch += 1;
      summary.issues.push({
        workerId: worker.id,
        code: 'MISSING_ACTIVE_POINTER',
        message: `Active attempt ${attempt.id} is owned by this worker, but its current_attempt_id is not set.`,
      });
    }
  }

  summary.issues = summary.issues.slice(0, 50);
  return summary;
}
