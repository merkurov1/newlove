import { randomBytes } from 'crypto';
import { NextResponse, after } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getClientIp } from '@/lib/rateLimit';
import { checkPierrotRateLimit } from '@/lib/pierrot/rateLimit';
import {
  WorkbenchExecutionError,
  acceptTask,
  archiveTask,
  cancelTask,
  dequeueTask,
  enqueueTask,
  mergeTask,
  rejectTask,
  retryTask,
  approveTask,
} from '@/lib/pierrot/dev/workbench/execution';
import {
  WorkbenchUnavailableError,
  appendEvent,
  createBatch,
  getBatchIdForTask,
  getTaskRow,
  isUuid,
  patchTask,
  reapExpiredAttempts,
  reorderBatchItem,
  reorderQueue,
  setBatchItemDependency,
  requestWorkerStop,
  setSetting,
  startBatch,
  transitionTask,
  updateBatchStatus,
} from '@/lib/pierrot/dev/workbench/store';
import {
  createCodespace,
  listUserCodespaces,
} from '@/lib/pierrot/dev/workbench/github';
import {
  ensureCodespaceForQueuedWork,
  retryPendingStart,
  startCodespaceNow,
  stopCodespaceNow,
} from '@/lib/pierrot/dev/workbench/lifecycle';
import type { EnsureStartResult } from '@/lib/pierrot/dev/workbench/lifecycle';
import { CODESPACE_NAME_ENV } from '@/lib/pierrot/dev/workbench/setup';
import { getWorkbenchOverview } from '@/lib/pierrot/dev/workbench/overview';
import { DevTransitionError } from '@/lib/pierrot/dev/workbench/state';
import { WorkbenchGitHubError } from '@/lib/pierrot/dev/workbench/github';
import type { DevBatchStatus, DevWorkbenchTaskStatus } from '@/lib/pierrot/dev/workbench/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TASK_ACTIONS = new Set([
  'approve',
  'enqueue',
  'dequeue',
  'cancel',
  'retry',
  'accept',
  'reject',
  'archive',
  'set_priority',
]);

const BATCH_STATUSES: DevBatchStatus[] = ['draft', 'active', 'paused', 'completed', 'archived'];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/**
 * If a stop is in flight, startup is recorded and retried after the response.
 * The enqueue action never waits for the whole Codespace boot.
 */
function schedulePendingStart(result: EnsureStartResult, source: string): void {
  if (result.action !== 'start-pending') return;
  after(async () => {
    // A shutdown can take tens of seconds. Retry within the function budget
    // instead of giving up after the first GitHub state read.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 9_000));
      try {
        const retried = await retryPendingStart(`${source}:retry`);
        if (retried.action !== 'start-pending') return;
      } catch (error) {
        console.error('[Pierrot Dev Workbench] pending start retry failed', {
          code: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
  });
}

function strings(value: unknown, limit = 60): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, 2000))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function errorResponse(error: unknown) {
  if (error instanceof WorkbenchUnavailableError) {
    return json({ error: error.message, code: error.code }, 503);
  }
  if (error instanceof WorkbenchExecutionError) {
    return json(
      {
        error: error.message,
        code: error.code,
        detail: error.detail ?? null,
      },
      error.status
    );
  }
  if (error instanceof DevTransitionError) {
    return json({ error: error.message, code: error.code }, 409);
  }
  if (error instanceof WorkbenchGitHubError) {
    return json(
      {
        error: error.message,
        code: error.code,
        status: error.status,
      },
      error.status === 401 || error.status === 403 ? 403 : 502
    );
  }
  const code = error instanceof Error ? error.message : 'DEV_ACTION_FAILED';
  console.error('[Pierrot Dev Workbench] action failed', { code });
  return json({ error: 'The action failed.', code }, 500);
}

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const limited = await checkPierrotRateLimit({
    identifier: `dev-workbench:${admin.id || getClientIp(req)}`,
    intervalMs: 60 * 1000,
    maxRequests: 60,
    keyPrefix: 'pierrot-dev-workbench',
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== 'string') {
    return json({ error: 'A valid action is required.' }, 400);
  }
  const action = body.action;
  const taskId = typeof body.taskId === 'string' ? body.taskId : '';

  try {
    if (TASK_ACTIONS.has(action) && !isUuid(taskId)) {
      return json({ error: 'A valid taskId is required.' }, 400);
    }

    switch (action) {
      case 'approve': {
        const task = await approveTask(admin.id, taskId);
        if (!task) return json({ error: 'Task not found.' }, 404);
        // Approval is the owner's normal entry point. A standalone task enters
        // the queue immediately (and therefore starts the Codespace). Tasks
        // already attached to a batch stay ready so the batch owns their order.
        const batchId = await getBatchIdForTask(task.id);
        if (!batchId) {
          try {
            await enqueueTask(admin.id, taskId);
          } catch {
            await appendEvent({
              taskId,
              type: 'task.auto_enqueue_failed',
              level: 'warn',
              message: 'Task was approved but could not be queued automatically.',
            }).catch(() => {});
          }
        }
        schedulePendingStart(
          await ensureCodespaceForQueuedWork({ source: 'admin:approve', waitForStopMs: 0 }),
          'admin:approve'
        );
        break;
      }
      case 'enqueue': {
        const task = await enqueueTask(
          admin.id,
          taskId,
          typeof body.batchId === 'string' ? body.batchId : null
        );
        if (!task) return json({ error: 'Task not found.' }, 404);
        schedulePendingStart(
          await ensureCodespaceForQueuedWork({ source: 'admin:enqueue', waitForStopMs: 0 }),
          'admin:enqueue'
        );
        break;
      }
      case 'dequeue': {
        const task = await dequeueTask(admin.id, taskId);
        if (!task) return json({ error: 'Task not found.' }, 404);
        break;
      }
      case 'cancel': {
        const task = await cancelTask(admin.id, taskId);
        if (!task) return json({ error: 'Task not found.' }, 404);
        break;
      }
      case 'retry': {
        const task = await retryTask(admin.id, taskId);
        if (!task) return json({ error: 'Task not found.' }, 404);
        schedulePendingStart(
          await ensureCodespaceForQueuedWork({ source: 'admin:retry', waitForStopMs: 0 }),
          'admin:retry'
        );
        break;
      }
      case 'accept': {
        const manualCriteria = strings(body.manualCriteria);
        const task = await acceptTask({ userId: admin.id, taskId, manualCriteria });
        if (!task) return json({ error: 'Task not found.' }, 404);
        break;
      }
      case 'reject': {
        const reason = typeof body.reason === 'string' ? body.reason.slice(0, 8000) : '';
        const task = await rejectTask(admin.id, taskId, reason);
        if (!task) return json({ error: 'Task not found.' }, 404);
        break;
      }
      case 'archive': {
        const task = await archiveTask(admin.id, taskId);
        if (!task) return json({ error: 'Task not found.' }, 404);
        break;
      }
      case 'merge': {
        if (body.confirm !== true) {
          return json(
            { error: 'Merge requires an explicit confirmation.', code: 'MERGE_CONFIRMATION_REQUIRED' },
            409
          );
        }
        const result = await mergeTask(admin.id, taskId);
        const overview = await getWorkbenchOverview(admin.id);
        return json({ ok: true, merge: result, overview });
      }
      case 'reorder': {
        const position = Number(body.position);
        if (!Number.isFinite(position)) {
          return json({ error: 'A numeric position is required.' }, 400);
        }
        const moved = await reorderQueue(admin.id, taskId, position);
        if (!moved) return json({ error: 'Task is not in the queue.' }, 409);
        break;
      }
      case 'set_priority': {
        const priority = Math.trunc(Number(body.priority));
        if (!Number.isFinite(priority) || priority < -100 || priority > 100) {
          return json({ error: 'Priority must be between -100 and 100.' }, 400);
        }
        const task = await getTaskRow(admin.id, taskId);
        if (!task) return json({ error: 'Task not found.' }, 404);
        await patchTask(taskId, { priority });
        await appendEvent({
          taskId,
          type: 'task.priority_changed',
          message: `Priority changed to ${priority}.`,
          payload: { priority },
        });
        break;
      }
      case 'pause_queue':
      case 'resume_queue': {
        const paused = action === 'pause_queue';
        await setSetting('queue_paused', paused);
        await appendEvent({
          type: paused ? 'queue.paused' : 'queue.resumed',
          level: paused ? 'warn' : 'info',
          message: paused ? 'Queue paused by the owner.' : 'Queue resumed by the owner.',
        });
        if (!paused) {
          schedulePendingStart(
            await ensureCodespaceForQueuedWork({ source: 'admin:resume', waitForStopMs: 0 }),
            'admin:resume'
          );
        }
        break;
      }
      case 'create_batch': {
        const title = typeof body.title === 'string' ? body.title.slice(0, 200) : '';
        if (!title.trim()) return json({ error: 'A batch title is required.' }, 400);
        const batch = await createBatch({
          userId: admin.id,
          title,
          description: typeof body.description === 'string' ? body.description : '',
          taskIds: strings(body.taskIds, 100),
          status: BATCH_STATUSES.includes(body.status as DevBatchStatus)
            ? (body.status as DevBatchStatus)
            : 'draft',
        });
        if (!batch) return json({ error: 'Unable to create the batch.' }, 500);
        break;
      }
      case 'start_batch': {
        const batchId = typeof body.batchId === 'string' ? body.batchId : '';
        if (!isUuid(batchId)) {
          return json({ error: 'A valid batchId is required.' }, 400);
        }
        const result = await startBatch(admin.id, batchId);
        if (!result.ok) {
          const status =
            result.error === 'BATCH_NOT_FOUND' || result.error === 'BATCH_TASK_NOT_FOUND'
              ? 404
              : result.error === 'BATCH_START_FAILED'
                ? 500
                : 409;
          const message =
            result.error === 'BATCH_NOT_READY'
              ? 'Every task in the batch must be approved (ready) before the batch can start.'
              : result.error === 'BATCH_EMPTY'
                ? 'The batch has no tasks.'
                : result.error === 'BATCH_CLOSED'
                  ? 'A completed or archived batch cannot be restarted.'
                  : result.error === 'BATCH_TASK_NOT_FOUND'
                    ? 'One or more batch tasks were not found.'
                    : result.error === 'BATCH_NOT_FOUND'
                      ? 'Batch not found.'
                      : 'The batch could not be started.';
          return json({ error: message, code: result.error, notReady: result.notReady }, status);
        }
        schedulePendingStart(
          await ensureCodespaceForQueuedWork({ source: 'admin:start_batch', waitForStopMs: 0 }),
          'admin:start_batch'
        );
        break;
      }
      case 'update_batch': {
        const batchId = typeof body.batchId === 'string' ? body.batchId : '';
        const status = body.status as DevBatchStatus;
        if (!isUuid(batchId) || !BATCH_STATUSES.includes(status)) {
          return json({ error: 'A valid batchId and status are required.' }, 400);
        }
        const updated = await updateBatchStatus(admin.id, batchId, status);
        if (!updated) return json({ error: 'Batch not found.' }, 404);
        break;
      }
      case 'reorder_batch': {
        const batchId = typeof body.batchId === 'string' ? body.batchId : '';
        const position = Number(body.position);
        if (!isUuid(batchId) || !isUuid(taskId) || !Number.isFinite(position)) {
          return json({ error: 'batchId, taskId and position are required.' }, 400);
        }
        const moved = await reorderBatchItem(admin.id, batchId, taskId, position);
        if (!moved) return json({ error: 'Unable to reorder the batch item.' }, 500);
        break;
      }
      case 'set_batch_dependency': {
        const batchId = typeof body.batchId === 'string' ? body.batchId : '';
        const dependsOn = typeof body.dependsOnTaskId === 'string' ? body.dependsOnTaskId : null;
        if (!isUuid(batchId) || !isUuid(taskId) || (dependsOn && !isUuid(dependsOn))) {
          return json({ error: 'batchId, taskId and dependsOnTaskId are required.' }, 400);
        }
        const updated = await setBatchItemDependency(admin.id, batchId, taskId, dependsOn);
        if (!updated) return json({ error: 'Unable to set the dependency.' }, 409);
        break;
      }
      case 'generate_worker_token': {
        // One-time setup helper. The secret is generated in memory, returned
        // once to the authenticated owner and never stored or logged here.
        const token = randomBytes(36).toString('base64url');
        await appendEvent({
          type: 'setup.worker_token_generated',
          message:
            'A one-time worker token was generated for setup. The value is not stored or logged.',
        });
        return json({
          ok: true,
          token,
          envName: 'PIERROT_DEV_WORKER_TOKEN',
          instructions: [
            'Store it as a Vercel Production environment variable PIERROT_DEV_WORKER_TOKEN.',
            'Store the same value as a Codespaces secret for the repository.',
            'Redeploy the admin app and restart the Codespace, then run Re-check in SETUP.',
          ],
        });
      }
      case 'list_codespaces': {
        const codespaces = await listUserCodespaces();
        return json({ ok: true, codespaces });
      }
      case 'start_codespace': {
        const result = await startCodespaceNow({ source: 'admin:manual', waitForStopMs: 0 });
        if (result.action === 'blocked') {
          return json(
            {
              error:
                result.reason ||
                `No Codespace was found for this repository. Set ${CODESPACE_NAME_ENV} or create one from Admin.`,
              code: 'CODESPACE_START_FAILED',
            },
            502
          );
        }
        schedulePendingStart(result, 'admin:manual');
        break;
      }
      case 'stop_codespace': {
        const result = await stopCodespaceNow({ source: 'admin:manual' });
        if (!result.stopped) {
          return json(
            {
              error: result.reason,
              code: 'CODESPACE_STOP_REFUSED',
            },
            409
          );
        }
        break;
      }
      case 'create_codespace': {
        const codespace = await createCodespace({
          repository: typeof body.repository === 'string' ? body.repository : 'newlove',
          machine: typeof body.machine === 'string' ? body.machine : undefined,
        });
        await appendEvent({
          type: 'codespace.created',
          message: `Codespace created: ${codespace.name}. Set ${CODESPACE_NAME_ENV}=${codespace.name}.`,
          payload: { name: codespace.name, machine: codespace.machine },
        });
        break;
      }
      case 'stop_worker': {
        const workerId = typeof body.workerId === 'string' ? body.workerId : '';
        if (!workerId) return json({ error: 'workerId is required.' }, 400);
        const stopped = await requestWorkerStop(workerId);
        if (!stopped) return json({ error: 'Worker not found.' }, 404);
        break;
      }
      case 'reap': {
        const reaped = await reapExpiredAttempts();
        await appendEvent({
          type: 'lease.reap',
          message: `Lease check completed; ${reaped} expired attempt(s) marked timed_out.`,
        });
        break;
      }
      case 'block': {
        const reason = typeof body.reason === 'string' ? body.reason.slice(0, 2000) : '';
        const task = await getTaskRow(admin.id, taskId);
        if (!task) return json({ error: 'Task not found.' }, 404);
        const updated = await transitionTask({
          userId: admin.id,
          taskId,
          to: 'blocked' as DevWorkbenchTaskStatus,
          patch: { blocked_reason: reason || 'Blocked by the owner.' },
          event: { type: 'task.blocked', level: 'warn', message: reason || 'Blocked by the owner.' },
        });
        if (!updated) return json({ error: 'Unable to block the task.' }, 409);
        break;
      }
      default:
        return json({ error: 'Unknown action.' }, 400);
    }

    const overview = await getWorkbenchOverview(admin.id);
    return json({ ok: true, overview });
  } catch (error) {
    return errorResponse(error);
  }
}
