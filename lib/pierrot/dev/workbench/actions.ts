import { assertServerOnly } from '@/lib/serverOnly';
import { dispatchRepositoryEvent, WorkbenchGitHubError } from './github';
import {
  appendEvent,
  clearTaskActionsDispatch,
  getActiveAttempt,
  getTaskRowUnscoped,
  isActionsRoutingSchemaReady,
  isQueuePaused,
  listQueuedTasksForDispatch,
  patchTask,
  reserveTaskForActionsDispatch,
} from './store';

assertServerOnly('lib/pierrot/dev/workbench/actions');

export const ACTIONS_EVENT_TYPE = 'pierrot-dev-task';
export const ACTIONS_WORKFLOW_FILE = 'pierrot-actions-executor.yml';

export type ActionsDispatchResult = {
  dispatched: boolean;
  taskId: string | null;
  repository: string | null;
  code: string;
  reason: string;
  requestedAt: string | null;
};

export class ActionsDispatchError extends Error {
  readonly code: string;
  readonly status: number;
  readonly taskId: string | null;
  readonly detail: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 502,
    taskId: string | null = null,
    detail: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ActionsDispatchError';
    this.code = code;
    this.status = status;
    this.taskId = taskId;
    this.detail = detail;
  }
}

function skipped(
  taskId: string | null,
  code: string,
  reason: string,
  repository: string | null = null
): ActionsDispatchResult {
  return { dispatched: false, taskId, repository, code, reason, requestedAt: null };
}

/**
 * Dispatch exactly one queued task to GitHub Actions.
 *
 * Routing rules:
 *   * the task must still be queued; a claimed/running/review task is never
 *     dispatched again;
 *   * a paused queue is an explicit no-op (the owner paused execution);
 *   * the task is reserved with a conditional update before the GitHub call, so
 *     two Admin requests (or two app instances) cannot launch the same task;
 *   * a failed dispatch records an error event and last_error_* on the task and
 *     throws. There is deliberately no Codespaces fallback here.
 */
export async function dispatchTaskToActions(input: {
  taskId: string;
  source: string;
}): Promise<ActionsDispatchResult> {
  if (await isQueuePaused()) {
    return skipped(
      input.taskId,
      'QUEUE_PAUSED',
      'The queue is paused; no Actions run was dispatched.'
    );
  }
  if (!(await isActionsRoutingSchemaReady())) {
    throw new ActionsDispatchError(
      'ACTIONS_ROUTING_MIGRATION_REQUIRED',
      'Actions routing requires the additive migration 2026-12-13_pierrot_actions_routing.sql. Apply it before dispatching. No Codespaces fallback was started.',
      503,
      input.taskId
    );
  }
  const task = await getTaskRowUnscoped(input.taskId);
  if (!task) {
    throw new ActionsDispatchError('DEV_TASK_NOT_FOUND', 'Task not found.', 404, input.taskId);
  }
  if (task.status !== 'queued') {
    throw new ActionsDispatchError(
      'DEV_TASK_NOT_QUEUED',
      `Only queued tasks can be dispatched to GitHub Actions (current status: ${task.status}).`,
      409,
      task.id
    );
  }
  if (task.assignedExecutor === 'codespace') {
    throw new ActionsDispatchError(
      'ACTIONS_DISPATCH_CODESPACE_ASSIGNED',
      'This task is explicitly assigned to the manual Codespace reserve and was not dispatched to Actions.',
      409,
      task.id
    );
  }

  let reserved: Awaited<ReturnType<typeof reserveTaskForActionsDispatch>>;
  try {
    reserved = await reserveTaskForActionsDispatch(task.id);
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message.slice(0, 800) : 'The dispatch reservation failed.';
    await patchTask(task.id, {
      last_error_code: 'ACTIONS_ROUTING_UNAVAILABLE',
      last_error_message: message,
    }).catch(() => {});
    await appendEvent({
      taskId: task.id,
      type: 'task.actions_dispatch_failed',
      level: 'error',
      message: `GitHub Actions dispatch reservation failed: ${message}`,
      payload: { source: input.source, code: 'ACTIONS_ROUTING_UNAVAILABLE' },
    }).catch(() => {});
    throw new ActionsDispatchError('ACTIONS_ROUTING_UNAVAILABLE', message, 503, task.id);
  }
  if (!reserved) {
    return skipped(
      task.id,
      'ACTIONS_DISPATCH_ALREADY_REQUESTED',
      'A dispatch was already requested for this task; duplicate launch prevented.',
      task.repository
    );
  }
  const requestedAt = reserved.actionsDispatchRequestedAt || new Date().toISOString();

  await appendEvent({
    taskId: task.id,
    type: 'task.actions_dispatch_requested',
    message: `GitHub Actions dispatch requested for task ${task.id} (${input.source}).`,
    payload: {
      source: input.source,
      repository: task.repository,
      eventType: ACTIONS_EVENT_TYPE,
      workflow: ACTIONS_WORKFLOW_FILE,
      requestedAt,
    },
    dedupeKey: `actions-dispatch-requested:${task.id}:${requestedAt}`,
  }).catch(() => {});

  try {
    await dispatchRepositoryEvent({
      repository: task.repository,
      eventType: ACTIONS_EVENT_TYPE,
      clientPayload: {
        task_id: task.id,
        source: input.source,
        requested_at: requestedAt,
      },
    });
  } catch (caught) {
    const githubError = caught instanceof WorkbenchGitHubError ? caught : null;
    const code =
      githubError?.code === 'GITHUB_TOKEN_MISSING'
        ? 'ACTIONS_DISPATCH_NOT_CONFIGURED'
        : 'ACTIONS_DISPATCH_FAILED';
    const message =
      code === 'ACTIONS_DISPATCH_NOT_CONFIGURED'
        ? 'GitHub Actions dispatch is not configured: GITHUB_TOKEN is missing on the server. No Codespaces fallback was started.'
        : githubError?.message ||
          (caught instanceof Error
            ? caught.message.slice(0, 800)
            : 'GitHub Actions dispatch failed.');

    await patchTask(task.id, {
      last_error_code: code,
      last_error_message: message.slice(0, 2000),
    }).catch(() => {});
    await appendEvent({
      taskId: task.id,
      type: 'task.actions_dispatch_failed',
      level: 'error',
      message: `GitHub Actions dispatch failed: ${message}`,
      payload: {
        source: input.source,
        repository: task.repository,
        eventType: ACTIONS_EVENT_TYPE,
        workflow: ACTIONS_WORKFLOW_FILE,
        requestedAt,
        code,
        githubCode: githubError?.code || null,
        status: githubError?.status ?? null,
        endpoint: githubError?.endpoint ?? null,
        requiredPermission:
          githubError?.requiredPermission ?? 'Contents: write (repository_dispatch)',
        retryAt: githubError?.retryAt ?? null,
      },
      dedupeKey: `actions-dispatch-failed:${task.id}:${requestedAt}`,
    }).catch(() => {});

    throw new ActionsDispatchError(
      code,
      message,
      code === 'ACTIONS_DISPATCH_NOT_CONFIGURED' ? 503 : 502,
      task.id,
      {
        githubCode: githubError?.code || null,
        status: githubError?.status ?? null,
        requiredPermission:
          githubError?.requiredPermission ?? 'Contents: write (repository_dispatch)',
        requestedAt,
      }
    );
  }

  await patchTask(task.id, {
    last_error_code: null,
    last_error_message: null,
  }).catch(() => {});
  await appendEvent({
    taskId: task.id,
    type: 'task.actions_dispatched',
    message: `GitHub Actions accepted the repository_dispatch for task ${task.id}.`,
    payload: {
      source: input.source,
      repository: task.repository,
      eventType: ACTIONS_EVENT_TYPE,
      workflow: ACTIONS_WORKFLOW_FILE,
      requestedAt,
      note: 'GitHub accepted the dispatch request; the workflow run is confirmed by the runner claim/provenance events.',
    },
    dedupeKey: `actions-dispatched:${task.id}:${requestedAt}`,
  }).catch(() => {});

  return {
    dispatched: true,
    taskId: task.id,
    repository: task.repository,
    code: 'ACTIONS_DISPATCHED',
    reason: 'GitHub accepted the repository_dispatch request.',
    requestedAt,
  };
}

/**
 * Explicit safe retry after a failed repository_dispatch.
 *
 * A failed dispatch deliberately keeps `actions_dispatch_requested_at` set so
 * the automatic recovery pump cannot hammer GitHub. Only an owner action may
 * clear that marker. This function refuses to retry anything that is not a
 * failed Actions dispatch, then delegates to the normal reservation path so a
 * concurrent retry still produces at most one repository_dispatch.
 */
export async function retryActionsDispatch(input: {
  taskId: string;
  source: string;
}): Promise<ActionsDispatchResult> {
  if (await isQueuePaused()) {
    return skipped(
      input.taskId,
      'QUEUE_PAUSED',
      'The queue is paused; no Actions retry was dispatched.'
    );
  }
  const task = await getTaskRowUnscoped(input.taskId);
  if (!task) {
    throw new ActionsDispatchError('DEV_TASK_NOT_FOUND', 'Task not found.', 404, input.taskId);
  }
  if (task.status !== 'queued') {
    return skipped(
      task.id,
      'ACTIONS_RETRY_NOT_QUEUED',
      `Only a queued task can be retried (current status: ${task.status}).`,
      task.repository
    );
  }
  if (task.assignedExecutor === 'codespace') {
    return skipped(
      task.id,
      'ACTIONS_DISPATCH_CODESPACE_ASSIGNED',
      'This task belongs to the manual Codespace reserve and was not retried on Actions.',
      task.repository
    );
  }
  const retryable =
    task.lastErrorCode === 'ACTIONS_DISPATCH_FAILED' ||
    task.lastErrorCode === 'ACTIONS_DISPATCH_NOT_CONFIGURED' ||
    task.lastErrorCode === 'ACTIONS_ROUTING_UNAVAILABLE';
  if (!retryable) {
    return skipped(
      task.id,
      'ACTIONS_RETRY_NOT_REQUIRED',
      'The task does not have a recorded Actions dispatch failure.',
      task.repository
    );
  }

  await appendEvent({
    taskId: task.id,
    type: 'task.actions_dispatch_retry',
    level: 'warn',
    message: `Owner requested a safe retry after ${task.lastErrorCode}.`,
    payload: { source: input.source, previousCode: task.lastErrorCode },
    dedupeKey: `actions-dispatch-retry:${task.id}:${Math.floor(Date.now() / 60_000)}`,
  }).catch(() => {});
  await clearTaskActionsDispatch(task.id);
  return dispatchTaskToActions({ taskId: task.id, source: input.source });
}

/**
 * Bounded recovery pump: dispatch at most one eligible queued task.
 *
 * This is used by Admin overview and after a worker completion. It never starts
 * a Codespace, never overrides a paused queue and never dispatches a task that
 * already has an in-flight request. The database reservation remains the final
 * duplicate-launch guard.
 */
export async function dispatchNextQueuedTask(input: {
  source: string;
}): Promise<ActionsDispatchResult> {
  if (await isQueuePaused()) {
    return skipped(null, 'QUEUE_PAUSED', 'The queue is paused; no Actions run was dispatched.');
  }
  if (!(await isActionsRoutingSchemaReady())) {
    const message =
      'Actions routing requires the additive migration 2026-12-13_pierrot_actions_routing.sql. No Codespaces fallback was started.';
    await appendEvent({
      type: 'actions.dispatch_unavailable',
      level: 'error',
      message,
      payload: { source: input.source, migration: '2026-12-13_pierrot_actions_routing.sql' },
      dedupeKey: `actions-routing-migration:${Math.floor(Date.now() / 3_600_000)}`,
    }).catch(() => {});
    throw new ActionsDispatchError('ACTIONS_ROUTING_MIGRATION_REQUIRED', message, 503);
  }
  const active = await getActiveAttempt();
  if (active) {
    return skipped(
      active.taskId,
      'ACTIVE_ATTEMPT',
      'An execution attempt is already active; no additional dispatch was requested.'
    );
  }

  const tasks = await listQueuedTasksForDispatch(10);
  for (const task of tasks) {
    if (task.assignedExecutor === 'codespace') continue;
    if (task.actionsDispatchRequestedAt) continue;
    try {
      return await dispatchTaskToActions({ taskId: task.id, source: input.source });
    } catch (error) {
      if (error instanceof ActionsDispatchError) {
        return skipped(task.id, error.code, error.message, task.repository);
      }
      throw error;
    }
  }

  return skipped(
    null,
    'NO_QUEUED_WORK',
    tasks.length > 0
      ? 'Queued tasks are assigned to another executor or already dispatched.'
      : 'No queued work.'
  );
}
