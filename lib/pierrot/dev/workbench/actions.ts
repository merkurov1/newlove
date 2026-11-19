import { randomUUID } from 'crypto';
import { assertServerOnly } from '@/lib/serverOnly';
import { dispatchRepositoryEvent, WorkbenchGitHubError } from './github';
import {
  appendEvent,
  completeTaskActionsDispatch,
  getActiveAttempt,
  getTaskDispatchBlockers,
  getTaskRowUnscoped,
  getWorker,
  isActionsDispatchRecoverySchemaReady,
  isActionsRoutingSchemaReady,
  isQueuePaused,
  listQueuedTasksForDispatch,
  patchTask,
  reserveTaskForActionsDispatch,
} from './store';
import type { DevWorkbenchTask } from './types';

assertServerOnly('lib/pierrot/dev/workbench/actions');

export const ACTIONS_EVENT_TYPE = 'pierrot-dev-task';
export const ACTIONS_WORKFLOW_FILE = 'pierrot-actions-executor.yml';
export const ACTIONS_DISPATCH_RECOVERY_MIGRATION_FILE =
  '2026-12-14_pierrot_actions_dispatch_recovery.sql';

/** Bounded dispatch requests per queue entry. Owner retry resets the counter. */
export const ACTIONS_DISPATCH_MAX_ATTEMPTS = 5;
/** A workflow accepted but not claimed after this long is considered stuck. */
export const ACTIONS_DISPATCH_STALE_MS = 3 * 60_000;
const ACTIONS_RETRY_BASE_MS = 60_000;
const ACTIONS_RETRY_MAX_MS = 15 * 60_000;
/** Mirrors the claim RPC's 120-second worker freshness window. */
const WORKER_FRESH_MS = 120_000;

export type ActionsDispatchResult = {
  dispatched: boolean;
  taskId: string | null;
  repository: string | null;
  code: string;
  reason: string;
  requestedAt: string | null;
  state?: string | null;
  retryAt?: string | null;
  correlationId?: string | null;
  attempts?: number;
};

export type ActionsClaimDiagnosis = {
  code: string;
  reason: string;
  retryable: boolean;
  terminal: boolean;
  action: string;
  retryAt: string | null;
  correlationId: string | null;
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
  repository: string | null = null,
  extra: Partial<ActionsDispatchResult> = {}
): ActionsDispatchResult {
  return {
    dispatched: false,
    taskId,
    repository,
    code,
    reason,
    requestedAt: null,
    ...extra,
  };
}

function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(Math.trunc(attempts || 1) - 1, 6));
  return Math.min(ACTIONS_RETRY_BASE_MS * 2 ** exponent, ACTIONS_RETRY_MAX_MS);
}

function retryAtFor(attempts: number): string {
  return new Date(Date.now() + retryDelayMs(attempts)).toISOString();
}

function isTransientGitHubFailure(error: WorkbenchGitHubError | null): boolean {
  if (!error) return true;
  if (error.code === 'GITHUB_TOKEN_MISSING' || error.code === 'GITHUB_TOKEN_INVALID') {
    return false;
  }
  if (error.status === 401 || error.status === 403 || error.status === 404) return false;
  if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
    return false;
  }
  return true;
}

const RECOVERABLE_REASON_CODES = new Set([
  'ACTIVE_ATTEMPT_OTHER_TASK',
  'CLAIM_CONFLICT',
  'STALE_WORKER',
  'DISPATCH_STALE_NO_CLAIM',
  'DISPATCH_API_TRANSIENT',
  'QUEUE_PAUSED',
  'DEPENDENCY_BLOCKED',
  'BATCH_PAUSED',
  'TASK_BLOCKED',
]);

function isRecoverableReason(code: string | null | undefined): boolean {
  return Boolean(code && RECOVERABLE_REASON_CODES.has(code));
}

async function requireDispatchSchema(taskId: string | null): Promise<void> {
  if (!(await isActionsRoutingSchemaReady())) {
    throw new ActionsDispatchError(
      'ACTIONS_ROUTING_MIGRATION_REQUIRED',
      'Actions routing requires the additive migration 2026-12-13_pierrot_actions_routing.sql. Apply it before dispatching. No Codespaces fallback was started.',
      503,
      taskId
    );
  }
  if (!(await isActionsDispatchRecoverySchemaReady())) {
    throw new ActionsDispatchError(
      'ACTIONS_DISPATCH_RECOVERY_MIGRATION_REQUIRED',
      `Actions dispatch recovery requires the additive migration ${ACTIONS_DISPATCH_RECOVERY_MIGRATION_FILE}. Apply it before dispatching. No Codespaces fallback was started.`,
      503,
      taskId
    );
  }
}

/**
 * Dispatch exactly one queued task to GitHub Actions.
 *
 * Routing rules:
 *   * the task must still be queued; a claimed/running/review task is never
 *     dispatched again;
 *   * a paused queue is an explicit no-op (the owner paused execution);
 *   * the task is reserved with an atomic conditional RPC before the GitHub
 *     call, so two Admin requests (or two app instances) cannot launch the
 *     same task;
 *   * every outcome is persisted (accepted, retry scheduled, terminal) with a
 *     correlation id; a failed dispatch never leaves an unexplained marker.
 */
export async function dispatchTaskToActions(input: {
  taskId: string;
  source: string;
  /**
   * When retrying an existing reservation, pass its marker so only the caller
   * that saw that exact revision can renew it. Omit for a first dispatch.
   */
  expectedRequestedAt?: string | null;
}): Promise<ActionsDispatchResult> {
  if (await isQueuePaused()) {
    return skipped(
      input.taskId,
      'QUEUE_PAUSED',
      'The queue is paused; no Actions run was dispatched.'
    );
  }
  await requireDispatchSchema(input.taskId);

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

  const correlationId = randomUUID();
  let reserved: Awaited<ReturnType<typeof reserveTaskForActionsDispatch>>;
  try {
    reserved = await reserveTaskForActionsDispatch(task.id, {
      correlationId,
      expectedRequestedAt: input.expectedRequestedAt || null,
      maxAttempts: ACTIONS_DISPATCH_MAX_ATTEMPTS,
    });
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
      payload: { source: input.source, code: 'ACTIONS_ROUTING_UNAVAILABLE', correlationId },
    }).catch(() => {});
    throw new ActionsDispatchError('ACTIONS_ROUTING_UNAVAILABLE', message, 503, task.id);
  }
  if (!reserved) {
    return skipped(
      task.id,
      'ACTIONS_DISPATCH_ALREADY_REQUESTED',
      'A dispatch is already in flight, retry-exhausted, or another runner owns the reservation; duplicate launch prevented.',
      task.repository
    );
  }
  const requestedAt = reserved.actionsDispatchRequestedAt || new Date().toISOString();
  const attempts = reserved.actionsDispatchAttempts || 1;

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
      correlationId,
      dispatchAttempt: attempts,
      maxAttempts: ACTIONS_DISPATCH_MAX_ATTEMPTS,
    },
    dedupeKey: `actions-dispatch-requested:${task.id}:${correlationId}`,
  }).catch(() => {});

  try {
    await dispatchRepositoryEvent({
      repository: task.repository,
      eventType: ACTIONS_EVENT_TYPE,
      clientPayload: {
        task_id: task.id,
        source: input.source,
        requested_at: requestedAt,
        correlation_id: correlationId,
        dispatch_attempt: attempts,
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

    const transient = isTransientGitHubFailure(githubError);
    const exhausted = attempts >= ACTIONS_DISPATCH_MAX_ATTEMPTS;
    const retryAt = transient && !exhausted ? retryAtFor(attempts) : null;
    const reasonCode = exhausted
      ? 'DISPATCH_RETRY_EXHAUSTED'
      : transient
        ? 'DISPATCH_API_TRANSIENT'
        : code;

    const completion = await completeTaskActionsDispatch({
      taskId: task.id,
      correlationId,
      outcome: transient && !exhausted ? 'retry' : 'terminal',
      reasonCode,
      reason: message.slice(0, 2000),
      retryAt,
      expectedRequestedAt: requestedAt,
      terminal: !transient || exhausted,
    }).catch(() => null);

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
        correlationId,
        dispatchAttempt: attempts,
        retryAt,
        transient,
        retryExhausted: exhausted,
        code,
        reasonCode,
        state: completion?.action || null,
        githubCode: githubError?.code || null,
        status: githubError?.status ?? null,
        endpoint: githubError?.endpoint ?? null,
        requiredPermission:
          githubError?.requiredPermission ?? 'Contents: write (repository_dispatch)',
      },
      dedupeKey: `actions-dispatch-failed:${task.id}:${correlationId}`,
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
        correlationId,
        retryAt,
        transient,
        retryExhausted: exhausted,
      }
    );
  }

  await completeTaskActionsDispatch({
    taskId: task.id,
    correlationId,
    outcome: 'accepted',
    reasonCode: 'GITHUB_ACCEPTED',
    reason: 'GitHub accepted the repository_dispatch request; awaiting a workflow claim.',
    expectedRequestedAt: requestedAt,
  }).catch(() => {});
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
      correlationId,
      dispatchAttempt: attempts,
      note: 'GitHub accepted the dispatch request; this is not proof that the task is running. The runner claim event confirms execution.',
    },
    dedupeKey: `actions-dispatched:${task.id}:${correlationId}`,
  }).catch(() => {});

  return {
    dispatched: true,
    taskId: task.id,
    repository: task.repository,
    code: 'ACTIONS_DISPATCHED',
    reason: 'GitHub accepted the repository_dispatch request.',
    requestedAt,
    state: 'accepted',
    retryAt: null,
    correlationId,
    attempts,
  };
}

/** Persist the durable `claimed` dispatch outcome after a successful claim. */
export async function recordActionsClaimSuccess(input: {
  taskId: string;
  workerId: string;
  correlationId?: string | null;
  executionId?: string | null;
}): Promise<void> {
  // The attempt already exists, so any workflow that legitimately claimed this
  // task is authoritative. Do not reject it only because a newer reservation
  // was created while the older workflow was still starting.
  const completion = await completeTaskActionsDispatch({
    taskId: input.taskId,
    correlationId: null,
    outcome: 'claimed',
    reasonCode: 'CLAIMED',
    reason: 'The Actions runner claimed the dispatched task.',
    workerId: input.workerId,
    executionId: input.executionId || null,
  }).catch(() => null);
  if (!completion?.ok) return;
  await appendEvent({
    taskId: input.taskId,
    workerId: input.workerId,
    type: 'task.actions_claim_recorded',
    message: `Actions workflow claimed task ${input.taskId}.`,
    payload: {
      correlationId: input.correlationId || null,
      executionId: input.executionId || null,
      state: completion.action,
    },
    dedupeKey: `actions-claim-recorded:${input.taskId}:${input.executionId || input.correlationId || 'unknown'}`,
  }).catch(() => {});
}

function workerIsFresh(worker: Awaited<ReturnType<typeof getWorker>>): boolean {
  if (!worker) return false;
  if (!['online', 'idle'].includes(worker.status)) return false;
  if (worker.stopRequested) return false;
  if (!worker.lastHeartbeatAt) return false;
  return Date.now() - Date.parse(worker.lastHeartbeatAt) <= WORKER_FRESH_MS;
}

/**
 * Classify a targeted claim that returned NULL. This is the workflow-started
 * path: the runner exists, but the database refused the claim. The answer is
 * persisted atomically and, only for genuinely transient reasons, a bounded
 * retry is scheduled.
 */
export async function recordActionsClaimMiss(input: {
  taskId: string;
  workerId: string;
  correlationId?: string | null;
  executionId?: string | null;
  source?: string;
}): Promise<ActionsClaimDiagnosis> {
  const task = await getTaskRowUnscoped(input.taskId);
  if (!task) {
    const diagnosis: ActionsClaimDiagnosis = {
      code: 'TASK_NOT_FOUND',
      reason: 'The dispatched task no longer exists.',
      retryable: false,
      terminal: true,
      action: 'ineligible',
      retryAt: null,
      correlationId: input.correlationId || null,
    };
    await appendEvent({
      taskId: input.taskId,
      workerId: input.workerId,
      type: 'task.actions_claim_missed',
      level: 'error',
      message: diagnosis.reason,
      payload: { ...diagnosis, executionId: input.executionId || null },
      dedupeKey: `actions-claim-missed:${input.taskId}:${input.executionId || input.correlationId || 'unknown'}`,
    }).catch(() => {});
    return diagnosis;
  }

  const [active, paused, blockers, worker] = await Promise.all([
    getActiveAttempt(),
    isQueuePaused(),
    getTaskDispatchBlockers(task.id),
    getWorker(input.workerId),
  ]);

  let code = 'CLAIM_CONFLICT';
  let reason = 'The task is queued but the atomic claim did not succeed.';
  let retryable = true;
  let terminal = false;

  if (task.status === 'in_progress' || blockers.activeAttemptForTask) {
    code = 'TASK_ALREADY_CLAIMED';
    reason = 'An active attempt already owns this task; this trigger lost the claim race.';
    retryable = false;
    terminal = false;
  } else if (task.status !== 'queued') {
    code = 'TASK_NOT_QUEUED';
    reason = `The task status is ${task.status}, not queued.`;
    retryable = false;
    terminal = true;
  } else if (task.assignedExecutor === 'codespace') {
    code = 'CODESPACE_ASSIGNED';
    reason = 'The task is assigned to the manual Codespace reserve.';
    retryable = false;
    terminal = true;
  } else if (paused) {
    code = 'QUEUE_PAUSED';
    reason = 'The queue is paused; the claim was refused.';
    retryable = false;
    terminal = false;
  } else if (active && active.taskId !== task.id) {
    code = 'ACTIVE_ATTEMPT_OTHER_TASK';
    reason = `Another task (${active.taskId}) owns the global active attempt slot.`;
    retryable = true;
  } else if (!workerIsFresh(worker)) {
    code = 'STALE_WORKER';
    reason = 'The ephemeral Actions worker was not registered or its heartbeat was stale.';
    retryable = true;
  } else if (task.blockedReason) {
    code = 'TASK_BLOCKED';
    reason = task.blockedReason;
    retryable = false;
    terminal = false;
  } else if (blockers.batchPaused) {
    code = 'BATCH_PAUSED';
    reason = 'The task belongs to a paused batch.';
    retryable = false;
    terminal = false;
  } else if (blockers.dependencyBlocked) {
    code = 'DEPENDENCY_BLOCKED';
    reason = 'A task dependency is not verified yet.';
    retryable = false;
    terminal = false;
  }

  const attempts = task.actionsDispatchAttempts || 1;
  if (retryable && attempts >= ACTIONS_DISPATCH_MAX_ATTEMPTS) {
    code = 'DISPATCH_RETRY_EXHAUSTED';
    reason = `All ${ACTIONS_DISPATCH_MAX_ATTEMPTS} bounded dispatch attempts were used: ${reason}`;
    retryable = false;
    terminal = true;
  }

  const retryAt = retryable ? retryAtFor(attempts) : null;
  const outcome = code === 'TASK_ALREADY_CLAIMED' ? 'claimed' : retryable ? 'retry' : 'terminal';
  const completion = await completeTaskActionsDispatch({
    taskId: task.id,
    correlationId: input.correlationId || task.actionsDispatchCorrelationId || null,
    outcome,
    reasonCode: code,
    reason,
    retryAt,
    expectedRequestedAt: task.actionsDispatchRequestedAt || null,
    terminal,
    workerId: input.workerId,
    executionId: input.executionId || null,
  }).catch(() => null);

  const staleWorkflow =
    completion !== null &&
    !completion.ok &&
    (completion.code === 'STALE_CORRELATION' || completion.code === 'STALE_RESERVATION');
  const action = staleWorkflow
    ? 'ignored'
    : completion?.action || (outcome === 'claimed' ? 'claimed' : 'not_claimable');
  const diagnosis: ActionsClaimDiagnosis = {
    code: staleWorkflow ? 'STALE_DISPATCH' : code,
    reason: staleWorkflow
      ? 'This workflow belongs to an older dispatch reservation; it did not change the current dispatch state.'
      : reason,
    retryable: staleWorkflow ? false : retryable,
    terminal: staleWorkflow ? false : terminal,
    action,
    retryAt: staleWorkflow ? null : retryAt,
    correlationId: input.correlationId || task.actionsDispatchCorrelationId || null,
  };

  await appendEvent({
    taskId: task.id,
    workerId: input.workerId,
    type: staleWorkflow
      ? 'task.actions_claim_ignored'
      : outcome === 'claimed'
        ? 'task.actions_claim_confirmed'
        : 'task.actions_claim_missed',
    level: staleWorkflow
      ? 'info'
      : outcome === 'claimed'
        ? 'info'
        : diagnosis.retryable
          ? 'warn'
          : 'error',
    message: staleWorkflow
      ? `Ignored a stale Actions workflow for task ${task.id}; the newer dispatch reservation is unchanged.`
      : outcome === 'claimed'
        ? `Actions claim raced with an existing attempt for task ${task.id}; no duplicate attempt was created.`
        : `Actions workflow could not claim task ${task.id}: ${diagnosis.reason}`,
    payload: {
      ...diagnosis,
      source: input.source || 'worker:claim',
      executionId: input.executionId || null,
      workerId: input.workerId,
      dispatchAttempt: attempts,
      maxAttempts: ACTIONS_DISPATCH_MAX_ATTEMPTS,
      persistedAction: completion?.action || null,
    },
    dedupeKey: `actions-claim-outcome:${task.id}:${input.executionId || diagnosis.correlationId || 'unknown'}`,
  }).catch(() => {});

  return diagnosis;
}

/**
 * Explicit safe owner retry after a failed or stuck dispatch.
 *
 * The release is an atomic RPC: it only clears the marker when the task is
 * still queued and no active attempt owns it. Owner retry also resets the
 * bounded attempt counter so a later transient failure has a fresh budget.
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
  await requireDispatchSchema(input.taskId);
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

  const hasDispatchFailure =
    Boolean(task.actionsDispatchRequestedAt) ||
    Boolean(task.lastErrorCode?.startsWith('ACTIONS_')) ||
    Boolean(task.actionsDispatchStatus && task.actionsDispatchStatus !== 'claimed');
  if (!hasDispatchFailure) {
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
    message: 'Owner requested a safe dispatch retry.',
    payload: {
      source: input.source,
      previousCode: task.lastErrorCode,
      previousStatus: task.actionsDispatchStatus,
      previousAttempts: task.actionsDispatchAttempts || 0,
    },
    dedupeKey: `actions-dispatch-retry:${task.id}:${Math.floor(Date.now() / 60_000)}`,
  }).catch(() => {});

  if (task.actionsDispatchRequestedAt) {
    const released = await completeTaskActionsDispatch({
      taskId: task.id,
      correlationId: task.actionsDispatchCorrelationId || null,
      outcome: 'retry',
      reasonCode: 'OWNER_RETRY',
      reason: 'Owner reset the dispatch reservation for a safe retry.',
      retryAt: null,
      expectedRequestedAt: task.actionsDispatchRequestedAt,
      resetAttempts: true,
    });
    if (!released.ok || !['released', 'reset'].includes(released.action)) {
      return skipped(
        task.id,
        released.code || 'ACTIONS_RETRY_BLOCKED',
        released.code === 'ACTIVE_ATTEMPT_FOR_TASK'
          ? 'An active attempt still owns this task; the dispatch reservation was not released.'
          : `The dispatch reservation could not be released safely (${released.action}).`,
        task.repository,
        { state: released.action, attempts: task.actionsDispatchAttempts || 0 }
      );
    }
  }

  return dispatchTaskToActions({ taskId: task.id, source: input.source });
}

/**
 * Safe automatic recovery for one still-queued task with a marker. It only
 * acts when:
 *   * the marker is a stale accepted/requested dispatch (workflow never
 *     claimed within the stale window), or
 *   * a bounded retry is due, or
 *   * a previously terminal blocker is demonstrably gone.
 */
async function recoverDispatchMarker(
  task: DevWorkbenchTask,
  source: string
): Promise<ActionsDispatchResult | null> {
  if (!task.actionsDispatchRequestedAt) return null;
  const status = task.actionsDispatchStatus || 'requested';
  const attempts = task.actionsDispatchAttempts || 0;
  const markerAt = Date.parse(task.actionsDispatchRequestedAt);
  const retryAt = task.actionsDispatchNextRetryAt
    ? Date.parse(task.actionsDispatchNextRetryAt)
    : null;
  const now = Date.now();

  if (attempts >= ACTIONS_DISPATCH_MAX_ATTEMPTS && status !== 'claimed') {
    await completeTaskActionsDispatch({
      taskId: task.id,
      correlationId: task.actionsDispatchCorrelationId || null,
      outcome: 'terminal',
      reasonCode: 'DISPATCH_RETRY_EXHAUSTED',
      reason: `All ${ACTIONS_DISPATCH_MAX_ATTEMPTS} bounded dispatch attempts were used. Owner retry is required.`,
      expectedRequestedAt: task.actionsDispatchRequestedAt,
      terminal: true,
    }).catch(() => {});
    return null;
  }

  const staleAccepted =
    ['requested', 'accepted', 'claimable'].includes(status) &&
    Number.isFinite(markerAt) &&
    now - markerAt >= ACTIONS_DISPATCH_STALE_MS;
  const retryDue = status === 'retry_scheduled' && (retryAt === null || retryAt <= now);
  const recoverableTerminal = ['not_claimable', 'ineligible', 'failed'].includes(status);

  if (!staleAccepted && !retryDue && !recoverableTerminal) return null;

  if (status === 'retry_scheduled' && !retryDue) return null;
  if (recoverableTerminal && !isRecoverableReason(task.actionsDispatchReasonCode)) return null;

  // Re-check deterministic blockers before releasing or renewing. This is what
  // prevents a paused batch / dependency / blocked task from looping.
  const blockers = await getTaskDispatchBlockers(task.id);
  if (
    task.blockedReason ||
    blockers.batchPaused ||
    blockers.dependencyBlocked ||
    blockers.activeAttemptForTask
  ) {
    return null;
  }

  if (staleAccepted || recoverableTerminal) {
    const released = await completeTaskActionsDispatch({
      taskId: task.id,
      correlationId: task.actionsDispatchCorrelationId || null,
      outcome: 'retry',
      reasonCode: staleAccepted ? 'DISPATCH_STALE_NO_CLAIM' : 'DISPATCH_RECOVERED',
      reason: staleAccepted
        ? 'The workflow was accepted but did not claim within the stale window; the safe reservation was released for retry.'
        : 'The previous dispatch blocker is gone; the safe reservation was released for retry.',
      retryAt: null,
      expectedRequestedAt: task.actionsDispatchRequestedAt,
    });
    if (!released.ok || released.action !== 'released') return null;
    return dispatchTaskToActions({ taskId: task.id, source });
  }

  // Bounded retry is due. Renew the exact reservation we observed.
  return dispatchTaskToActions({
    taskId: task.id,
    source,
    expectedRequestedAt: task.actionsDispatchRequestedAt,
  });
}

/**
 * Bounded recovery pump: dispatch at most one eligible queued task.
 *
 * This is used by Admin overview, worker completion and the existing scheduler
 * tick. It never starts a Codespace, never overrides a paused queue and never
 * dispatches a task that already has an in-flight request. The database
 * reservation remains the final duplicate-launch guard.
 */
export async function dispatchNextQueuedTask(input: {
  source: string;
}): Promise<ActionsDispatchResult> {
  if (await isQueuePaused()) {
    return skipped(null, 'QUEUE_PAUSED', 'The queue is paused; no Actions run was dispatched.');
  }
  if (!(await isActionsRoutingSchemaReady()) || !(await isActionsDispatchRecoverySchemaReady())) {
    const message =
      'Actions dispatch requires the additive migrations 2026-12-13_pierrot_actions_routing.sql and 2026-12-14_pierrot_actions_dispatch_recovery.sql. No Codespaces fallback was started.';
    await appendEvent({
      type: 'actions.dispatch_unavailable',
      level: 'error',
      message,
      payload: {
        source: input.source,
        migrations: [
          '2026-12-13_pierrot_actions_routing.sql',
          ACTIONS_DISPATCH_RECOVERY_MIGRATION_FILE,
        ],
      },
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

  const tasks = await listQueuedTasksForDispatch(20);
  let sawIneligible = false;
  for (const task of tasks) {
    if (task.assignedExecutor === 'codespace') continue;
    try {
      if (task.actionsDispatchRequestedAt) {
        const recovered = await recoverDispatchMarker(task, input.source);
        if (recovered) return recovered;
        sawIneligible = true;
        continue;
      }
      return await dispatchTaskToActions({ taskId: task.id, source: input.source });
    } catch (error) {
      if (error instanceof ActionsDispatchError) {
        return skipped(task.id, error.code, error.message, task.repository, {
          retryAt:
            typeof error.detail.retryAt === 'string' ? (error.detail.retryAt as string) : null,
        });
      }
      throw error;
    }
  }

  return skipped(
    null,
    'NO_QUEUED_WORK',
    tasks.length > 0
      ? sawIneligible
        ? 'Queued tasks are already dispatched, retry-exhausted, or blocked by another active attempt.'
        : 'Queued tasks are assigned to another executor.'
      : 'No queued work.'
  );
}
