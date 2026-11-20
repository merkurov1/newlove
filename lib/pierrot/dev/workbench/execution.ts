import { assertServerOnly } from '@/lib/serverOnly';
import { attachDevTaskResult, validateDevTaskCompletion } from '../tasks';
import { resolveDevRepository } from '../repositories';
import {
  appendEvent,
  claimNextTask,
  claimTask,
  clearTaskActionsDispatch,
  clearWorkerAttempt,
  expectedBranch,
  getActiveAttempt,
  getAttempt,
  getBatchIdForTask,
  getQueueSnapshot,
  getSetting,
  getTaskExecutionMaterial,
  getTaskRow,
  getTaskRowUnscoped,
  getWorker,
  isUuid,
  leaseExpiryIso,
  listAttempts,
  maybeCompleteBatch,
  nextQueuePosition,
  patchAttempt,
  patchTask,
  reapExpiredAttempts,
  recordTaskCostEstimate,
  setQueueOptOut,
  touchWorkerHeartbeat,
  transitionTask,
} from './store';
import {
  assertAttemptTransition,
  assertTaskTransition,
  branchNameForAttempt,
  truncateLog,
  truncateText,
} from './state';
import { buildExecutionPrompt } from './prompt';
import { collectAttemptEvidence } from './evidence';
import { buildAttemptCost } from './costs';
import { notifyDevOwner } from './notifications';
import type { AttemptEvidence } from './evidence';
import {
  createPullRequestForAttempt,
  getPullRequestStatus,
  getVercelDeploymentStatus,
  mergeVerifiedPullRequest,
} from './github';
import type { DevAttempt, DevReviewView, DevWorkbenchTask, DevWorkbenchTaskStatus } from './types';

assertServerOnly('lib/pierrot/dev/workbench/execution');

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const MAX_FILES = 200;

/**
 * The executor that owned the attempt. The worker id is durable provenance:
 * Actions runners are `actions:<run_id>:<attempt>` and the manual reserve is
 * `codespace:<name>`. The stored verification is a fallback for older rows.
 */
export function attemptExecutor(attempt: DevAttempt): 'actions' | 'codespace' | 'local' {
  const workerId = String(attempt.workerId || '');
  if (workerId.startsWith('actions:')) return 'actions';
  if (workerId.startsWith('codespace:')) return 'codespace';
  if (workerId.startsWith('local:')) return 'local';
  const executor = attempt.verification?.executor;
  if (executor === 'github-actions') return 'actions';
  if (executor === 'codespace') return 'codespace';
  return 'codespace';
}

let lastReapAt = 0;

export class WorkbenchExecutionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: unknown;

  constructor(code: string, message: string, status = 409, detail?: unknown) {
    super(message);
    this.name = 'WorkbenchExecutionError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function ensureOwnership(attempt: DevAttempt | null, workerId: string): DevAttempt {
  if (!attempt) {
    throw new WorkbenchExecutionError('ATTEMPT_NOT_FOUND', 'Attempt not found.', 404);
  }
  if (attempt.workerId !== workerId) {
    throw new WorkbenchExecutionError(
      'ATTEMPT_NOT_OWNED',
      'This attempt belongs to a different worker.',
      403
    );
  }
  return attempt;
}

/**
 * Execution for a task is finished. If it belongs to a batch, mark the batch
 * completed once every item has left the executable queue. This is best effort:
 * a batch bookkeeping failure must never hide the task result.
 */
async function settleBatchForTask(taskId: string): Promise<void> {
  try {
    const batchId = await getBatchIdForTask(taskId);
    if (batchId) await maybeCompleteBatch(batchId);
  } catch {
    // Best effort only.
  }
}

/**
 * Claim the next queued task. The database RPC is the single source of truth
 * for ordering, locking, lease creation and the one-active-attempt rule.
 */
export async function claimTaskForWorker(
  workerId: string,
  taskId?: string
): Promise<{ task: DevWorkbenchTask; attempt: DevAttempt; prompt: string } | null> {
  if (taskId || Date.now() - lastReapAt > 60_000) {
    lastReapAt = Date.now();
    await reapExpiredAttempts();
  }

  let claim: { task: DevWorkbenchTask; attempt: DevAttempt; prompt: string } | null;
  try {
    claim = taskId ? await claimTask(workerId, taskId) : await claimNextTask(workerId);
  } catch (error) {
    if ((error as { code?: string }).code === 'TARGETED_CLAIM_RPC_MISSING') {
      throw new WorkbenchExecutionError(
        'TARGETED_CLAIM_UNAVAILABLE',
        'The GitHub Actions executor requires the additive migration 2026-12-12_pierrot_actions_executor.sql. Apply it before dispatching a specific task.',
        503
      );
    }
    throw error;
  }
  if (!claim) return null;

  const material = await getTaskExecutionMaterial(claim.task.id);
  if (!material) {
    await appendEvent({
      taskId: claim.task.id,
      attemptId: claim.attempt.id,
      workerId,
      type: 'attempt.material_missing',
      level: 'error',
      message: 'Task material disappeared after claim.',
    });
    return null;
  }

  const config = resolveDevRepository(claim.task.repository);
  const prompt = buildExecutionPrompt({
    task: material,
    attemptId: claim.attempt.id,
    attemptNumber: claim.attempt.attemptNumber,
    branch:
      claim.attempt.branch || branchNameForAttempt(claim.task.id, claim.attempt.attemptNumber),
    repositoryFullName: config.fullName,
    baseRef: claim.attempt.baseRef || material.baseRef,
    baseCommit: claim.attempt.baseCommit || material.baseCommit,
  });

  return { task: claim.task, attempt: claim.attempt, prompt };
}

export type ClaimUnavailableDiagnostics = {
  code: string;
  idempotent: boolean;
  reason: string;
  taskId: string | null;
  taskStatus: string | null;
  queuePaused: boolean;
  queue: { queued: number; active: number; paused: boolean } | null;
  activeAttempt: {
    id: string;
    taskId: string;
    attemptNumber: number;
    status: string;
    workerId: string | null;
    leaseExpiresAt: string | null;
  } | null;
};

/**
 * Explain a null claim without mutating any task or attempt.
 *
 * A claim can legitimately lose a race to another executor, arrive after the
 * task left the queue, or collide with a paused queue. Those are idempotent
 * no-ops with useful diagnostics. A runner that is not claimable at all is a
 * real setup failure and is marked non-idempotent so the workflow stays red.
 */
export async function describeClaimUnavailable(
  workerId: string,
  taskId?: string
): Promise<ClaimUnavailableDiagnostics> {
  const [queue, worker, active] = await Promise.all([
    getQueueSnapshot().catch(() => null),
    getWorker(workerId).catch(() => null),
    getActiveAttempt().catch(() => null),
  ]);
  const task = taskId ? await getTaskRowUnscoped(taskId).catch(() => null) : null;
  const activeAttempt =
    active && (!taskId || String(active.taskId) === String(taskId)) ? active : null;
  const base = {
    taskId: taskId || null,
    taskStatus: task?.status || null,
    queuePaused: queue?.paused === true,
    queue: queue ? { queued: queue.queued, active: queue.active, paused: queue.paused } : null,
    activeAttempt: activeAttempt
      ? {
          id: activeAttempt.id,
          taskId: activeAttempt.taskId,
          attemptNumber: activeAttempt.attemptNumber,
          status: activeAttempt.status,
          workerId: activeAttempt.workerId,
          leaseExpiresAt: activeAttempt.leaseExpiresAt,
        }
      : null,
  };

  if (activeAttempt) {
    const ownedByThisRunner = activeAttempt.workerId === workerId;
    return {
      ...base,
      code: 'TASK_ALREADY_CLAIMED',
      idempotent: true,
      reason: `${taskId ? `Task ${taskId}` : `Task ${activeAttempt.taskId}`} is already active: ${
        ownedByThisRunner ? 'this runner' : `worker ${activeAttempt.workerId || 'unknown'}`
      } owns attempt ${activeAttempt.attemptNumber} (${activeAttempt.status}, lease until ${
        activeAttempt.leaseExpiresAt || 'unknown'
      }). This dispatch is an idempotent no-op; the owning lease was not touched.`,
    };
  }

  const workerClaimable =
    worker !== null &&
    ['online', 'idle'].includes(worker.status) &&
    worker.stopRequested !== true &&
    (!taskId || worker.kind === 'actions');
  if (!workerClaimable) {
    return {
      ...base,
      code: 'WORKER_NOT_CLAIMABLE',
      idempotent: false,
      reason: `Worker ${workerId} is not claimable (status ${
        worker?.status || 'missing'
      }, kind ${worker?.kind || 'missing'}, stopRequested ${
        worker ? String(worker.stopRequested === true) : 'missing'
      }). The task was not claimed; this is a runner/setup failure, not a lost race.`,
    };
  }

  if (queue?.paused === true) {
    return {
      ...base,
      code: 'QUEUE_PAUSED',
      idempotent: true,
      reason: `The queue is paused; ${
        taskId ? `task ${taskId}` : 'no task'
      } was not claimed. This dispatch is an idempotent no-op.`,
    };
  }

  if (!taskId) {
    return {
      ...base,
      code: 'NO_QUEUED_TASK',
      idempotent: true,
      reason: `No queued task was claimable (queued ${queue?.queued ?? 'unknown'}, active ${
        queue?.active ?? 'unknown'
      }, paused ${Boolean(queue?.paused)}). This dispatch is an idempotent no-op.`,
    };
  }

  if (!task) {
    return {
      ...base,
      code: 'TASK_NOT_FOUND',
      idempotent: true,
      reason: `Task ${taskId} no longer exists; no attempt was created. This dispatch is an idempotent no-op.`,
    };
  }
  if (task.assignedExecutor === 'codespace') {
    return {
      ...base,
      code: 'TASK_ASSIGNED_TO_CODESPACE',
      idempotent: true,
      reason: `Task ${taskId} is assigned to the manual Codespace reserve and was not claimed by Actions. This dispatch is an idempotent no-op.`,
    };
  }
  if (task.blockedReason) {
    return {
      ...base,
      code: 'TASK_BLOCKED',
      idempotent: true,
      reason: `Task ${taskId} is blocked (${task.blockedReason}); no attempt was created. This dispatch is an idempotent no-op.`,
    };
  }
  if (task.status !== 'queued') {
    return {
      ...base,
      code: 'TASK_NOT_QUEUED',
      idempotent: true,
      reason: `Task ${taskId} is '${task.status}', not queued${
        task.queuePosition === null ? '' : ` (queue position ${task.queuePosition})`
      }. This dispatch is an idempotent no-op.`,
    };
  }

  return {
    ...base,
    code: 'CLAIM_UNAVAILABLE',
    idempotent: true,
    reason: `Task ${taskId} is queued but was not claimable (dependency, paused batch, routing, or a concurrent claim). This dispatch is an idempotent no-op.`,
  };
}

/** Mark the attempt as really running (workspace prepared, OpenCode starting). */
export async function startAttempt(
  workerId: string,
  attemptId: string,
  executionId?: string
): Promise<{ attempt: DevAttempt; stopRequested: boolean }> {
  const attempt = ensureOwnership(await getAttempt(attemptId), workerId);
  if (attempt.status === 'running') {
    return { attempt, stopRequested: false };
  }
  assertAttemptTransition(attempt.status, 'running');

  const normalizedExecutionId =
    typeof executionId === 'string' && /^[A-Za-z0-9:._-]{8,160}$/.test(executionId.trim())
      ? executionId.trim()
      : null;

  const patch: Record<string, unknown> = {
    status: 'running',
    progress_stage: 'starting',
    heartbeat_at: new Date().toISOString(),
    lease_expires_at: leaseExpiryIso(),
  };
  if (normalizedExecutionId) {
    // Durable provenance on the attempt itself. The attempt UUID remains the
    // lock/lease id; executionId identifies the runner invocation that owns it.
    patch.verification = {
      ...(attempt.verification || {}),
      executionId: normalizedExecutionId,
    };
  }
  const updated = await patchAttempt(attemptId, patch, ['claimed']);
  if (!updated) {
    throw new WorkbenchExecutionError('ATTEMPT_NOT_ACTIVE', 'Attempt is no longer claimable.');
  }

  await appendEvent({
    taskId: updated.taskId,
    attemptId,
    workerId,
    type: 'attempt.running',
    message: 'Worker started the execution attempt.',
    // The attempt UUID is the durable, unique execution id. The GitHub run id
    // is additional provenance stored in the append-only journal, not a lock.
    payload: normalizedExecutionId ? { executionId: normalizedExecutionId } : {},
  });

  return { attempt: updated, stopRequested: false };
}

export async function progressAttempt(input: {
  workerId: string;
  attemptId: string;
  stage: string;
  message?: string;
  dedupeKey?: string;
  logExcerpt?: string;
}): Promise<{ cancelled: boolean; attempt: DevAttempt }> {
  const attempt = ensureOwnership(await getAttempt(input.attemptId), input.workerId);

  if (attempt.status === 'cancelled' || attempt.status === 'failed') {
    return { cancelled: true, attempt };
  }
  if (!['claimed', 'running'].includes(attempt.status)) {
    throw new WorkbenchExecutionError('ATTEMPT_NOT_ACTIVE', 'Attempt is not active.');
  }

  const patch: Record<string, unknown> = {
    progress_stage: truncateText(input.stage, 120),
    heartbeat_at: new Date().toISOString(),
    lease_expires_at: leaseExpiryIso(),
  };
  if (typeof input.logExcerpt === 'string') {
    patch.log_excerpt = truncateLog(input.logExcerpt);
  }
  const updated = await patchAttempt(input.attemptId, patch, ['claimed', 'running']);
  if (!updated) {
    throw new WorkbenchExecutionError('ATTEMPT_NOT_ACTIVE', 'Attempt is not active.');
  }

  // Progress arrives from the executor heartbeat while the worker's main loop
  // is blocked in OpenCode. It must keep the worker liveness timestamp fresh
  // too, otherwise a long model call makes Admin report the worker offline.
  await touchWorkerHeartbeat(input.workerId);

  if (input.message) {
    await appendEvent({
      taskId: attempt.taskId,
      attemptId: attempt.id,
      workerId: input.workerId,
      type: 'attempt.progress',
      message: truncateText(input.message, 3800),
      payload: { stage: input.stage },
      dedupeKey: input.dedupeKey || null,
    });
  }

  return { cancelled: false, attempt: updated };
}

export type AttemptResultInput = {
  exitCode: number | null;
  opencodeSessionId?: string | null;
  headSha?: string | null;
  changedFiles?: string[];
  commands?: Array<{
    name: string;
    status: 'passed' | 'failed' | 'skipped' | 'unknown';
    detail?: string;
  }>;
  summary?: string;
  warnings?: string[];
  criteria?: Array<{
    criterion: string;
    status: 'satisfied' | 'not_verified' | 'failed';
    evidence: string;
  }>;
  logExcerpt?: string;
  verification?: Record<string, unknown>;
  /** Raw OpenCode step_finish usage. Normalized and priced server-side. */
  usage?: Record<string, unknown>;
  runtimeMs?: number | null;
};

function normalizeFiles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.replace(/\\/g, '/').trim())
        .filter((item) => item.length > 0 && item.length <= 500 && !item.includes('\u0000'))
    ),
  ].slice(0, MAX_FILES);
}

/** Complete an attempt and move the task to review. Never sets verified. */
export async function completeAttempt(
  workerId: string,
  attemptId: string,
  result: AttemptResultInput
): Promise<{ attempt: DevAttempt; task: DevWorkbenchTask | null }> {
  const attempt = ensureOwnership(await getAttempt(attemptId), workerId);

  if (attempt.status === 'completed') {
    const existingTask = await getTaskRowUnscoped(attempt.taskId);
    if (existingTask) {
      await ensurePullRequest({ task: existingTask, attempt, workerId });
    }
    return {
      attempt: (await getAttempt(attemptId)) || attempt,
      task: existingTask ? await getTaskRowUnscoped(attempt.taskId) : null,
    };
  }
  if (!['claimed', 'running'].includes(attempt.status)) {
    throw new WorkbenchExecutionError(
      'ATTEMPT_NOT_ACTIVE',
      `Attempt is ${attempt.status}; a result cannot be recorded.`
    );
  }
  assertAttemptTransition(attempt.status, 'completed');

  const headSha =
    typeof result.headSha === 'string' && SHA_PATTERN.test(result.headSha.trim())
      ? result.headSha.trim().toLowerCase()
      : null;
  const changedFiles = normalizeFiles(result.changedFiles);

  if (attempt.branch !== expectedBranch(attempt.taskId, attempt.attemptNumber)) {
    throw new WorkbenchExecutionError(
      'ATTEMPT_BRANCH_MISMATCH',
      'Attempt branch does not match the expected pierrot/dev/<task>/<attempt> branch.'
    );
  }

  const commands = Array.isArray(result.commands) ? result.commands.slice(0, 30) : [];
  const warnings = Array.isArray(result.warnings)
    ? result.warnings.filter((item): item is string => typeof item === 'string').slice(0, 40)
    : [];

  // Cost is recorded with the attempt. Model cost is actual only when
  // OpenCode reported it; Codespaces cost is an estimate from measured runtime.
  const codespaceMeta =
    (await getSetting<Record<string, unknown>>('lifecycle:codespace', {})) || {};
  const runtimeMs =
    typeof result.runtimeMs === 'number' && Number.isFinite(result.runtimeMs)
      ? Math.max(0, Math.trunc(result.runtimeMs))
      : attempt.startedAt
        ? Math.max(0, Date.now() - new Date(attempt.startedAt).getTime())
        : null;
  const finishedAt = new Date().toISOString();
  const cost = buildAttemptCost({
    usage: result.usage,
    machine: typeof codespaceMeta.machine === 'string' ? codespaceMeta.machine : null,
    runtimeMs,
    startedAt: attempt.startedAt,
    finishedAt,
    modelStarted: true,
    executor: attemptExecutor(attempt),
  });

  const updatedAttempt = await patchAttempt(
    attemptId,
    {
      status: 'completed',
      finished_at: finishedAt,
      exit_code: typeof result.exitCode === 'number' ? result.exitCode : null,
      opencode_session_id: truncateText(result.opencodeSessionId, 200) || null,
      head_sha: headSha,
      changed_files: changedFiles,
      commands,
      verification: {
        ...(attempt.verification || {}),
        ...(result.verification || {}),
        criteria: Array.isArray(result.criteria) ? result.criteria.slice(0, 60) : [],
        cost,
        selfReported: true,
      },
      warnings,
      result_summary: truncateText(result.summary, 12_000),
      log_excerpt: truncateLog(result.logExcerpt),
      progress_stage: 'completed',
      error_code: null,
      error_message: null,
    },
    ['claimed', 'running']
  );

  if (!updatedAttempt) {
    // A concurrent cancel won the race. Do not overwrite it.
    const current = await getAttempt(attemptId);
    if (current?.status === 'completed') {
      return { attempt: current, task: await getTaskRowUnscoped(attempt.taskId) };
    }
    throw new WorkbenchExecutionError('ATTEMPT_NOT_ACTIVE', 'Attempt is no longer active.');
  }

  const task = await getTaskRowUnscoped(attempt.taskId);
  if (task) {
    if (task.status === 'in_progress') {
      await patchTask(task.id, {
        status: 'review',
        result_commit: headSha,
        result_notes: truncateText(result.summary, 12_000),
        verification_status: 'not_run',
        verification_notes: '',
        verified_at: null,
        last_error_code: null,
        last_error_message: null,
      });
    } else {
      // The task was cancelled or otherwise moved while the worker was
      // running. Keep the attempt history but do not resurrect the task.
      await appendEvent({
        taskId: task.id,
        attemptId,
        workerId,
        type: 'attempt.completed_after_status_change',
        level: 'warn',
        message: `Attempt completed, but the task is now ${task.status}. Review was not reopened.`,
      });
    }
  }

  await clearWorkerAttempt(workerId, attemptId);
  await settleBatchForTask(attempt.taskId);

  await appendEvent({
    taskId: attempt.taskId,
    attemptId,
    workerId,
    type: 'attempt.completed',
    message: `Attempt ${attempt.attemptNumber} completed with ${changedFiles.length} changed file(s). Handed to review; not verified automatically.`,
    payload: {
      headSha,
      changedFiles: changedFiles.length,
      exitCode: result.exitCode,
      cost: {
        modelUsd: cost.model.costUsd,
        codespaceEstimatedUsd: cost.codespace.estimatedUsd,
        totalUsd: cost.totalUsd,
        unknown: cost.unknown,
      },
    },
  });

  // PR creation is a side effect. Duplicate completion is guarded above and
  // the helper is safe to call again to repair a crash between the attempt and
  // the pull request.
  if (task) {
    await ensurePullRequest({
      task: (await getTaskRowUnscoped(task.id)) || task,
      attempt: updatedAttempt,
      workerId,
    });
    const completedTask = await getTaskRowUnscoped(task.id);
    if (completedTask && completedTask.priority >= 10) {
      await notifyDevOwner({
        eventKey: `task-completed:${completedTask.id}:${attemptId}`,
        title: 'Pierrot Dev · important task completed',
        lines: [
          completedTask.title,
          `Attempt ${attempt.attemptNumber} finished and was handed to review.`,
        ],
        url: completedTask.pullRequests.slice(-1)[0] || null,
      }).catch(() => {});
    }
  }

  return { attempt: (await getAttempt(attemptId)) || updatedAttempt, task };
}

async function ensurePullRequest(input: {
  task: DevWorkbenchTask;
  attempt: DevAttempt;
  workerId: string;
}): Promise<void> {
  const { task, attempt, workerId } = input;
  if (!attempt.headSha || attempt.changedFiles.length === 0) return;
  if (task.pullRequests.some((url) => url.includes('/pull/'))) return;
  if (attempt.prUrl) return;

  try {
    const pr = await createPullRequestForAttempt({
      repository: task.repository,
      head: attempt.branch || '',
      base: resolveDevRepository(task.repository).defaultBranch,
      title: `[Pierrot] ${task.title}`.slice(0, 240),
      body: [
        `Task: ${task.id}`,
        `Attempt: ${attempt.attemptNumber} (${attempt.id})`,
        '',
        truncateText(attempt.resultSummary, 8000) || 'Automated Pierrot execution.',
        '',
        'Acceptance criteria:',
        ...task.acceptanceCriteria.map((criterion) => `- ${criterion}`),
        '',
        'This pull request requires explicit owner review in Pierrot Admin. It is not merged automatically.',
      ].join('\n'),
    });
    await patchAttempt(attempt.id, { pr_number: pr.number, pr_url: pr.url });
    await patchTask(task.id, {
      pull_requests: [...task.pullRequests, pr.url].slice(-10),
    });
    await appendEvent({
      taskId: task.id,
      attemptId: attempt.id,
      workerId,
      type: 'pull_request.created',
      message: `Pull request #${pr.number} created.`,
      payload: { url: pr.url },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PR creation failed.';
    await patchAttempt(attempt.id, {
      warnings: [...attempt.warnings, `PR creation failed: ${message}`],
    });
    await appendEvent({
      taskId: task.id,
      attemptId: attempt.id,
      workerId,
      type: 'pull_request.failed',
      level: 'warn',
      message: `Branch was pushed but PR creation failed: ${message}`,
    });
  }
}

export async function failAttempt(input: {
  workerId: string;
  attemptId: string;
  errorCode: string;
  errorMessage: string;
  timedOut?: boolean;
  exitCode?: number | null;
  logExcerpt?: string;
  changedFiles?: string[];
  headSha?: string | null;
  /** Raw OpenCode step_finish usage, available when the model already ran. */
  usage?: Record<string, unknown>;
  runtimeMs?: number | null;
  /** False when the failure happened before OpenCode started. */
  modelStarted?: boolean;
  verification?: Record<string, unknown>;
}): Promise<DevAttempt> {
  const attempt = ensureOwnership(await getAttempt(input.attemptId), input.workerId);
  const target = input.timedOut ? 'timed_out' : 'failed';
  if (!['claimed', 'running'].includes(attempt.status)) {
    const current = await getAttempt(input.attemptId);
    if (current) return current;
    throw new WorkbenchExecutionError('ATTEMPT_NOT_FOUND', 'Attempt not found.', 404);
  }
  assertAttemptTransition(attempt.status, target);

  // A failed attempt may already have spent money on the model. Preserve the
  // usage and measured runtime exactly like a successful attempt; unknown data
  // stays null and is never reported as zero.
  const codespaceMeta =
    (await getSetting<Record<string, unknown>>('lifecycle:codespace', {})) || {};
  const runtimeMs =
    typeof input.runtimeMs === 'number' && Number.isFinite(input.runtimeMs)
      ? Math.max(0, Math.trunc(input.runtimeMs))
      : attempt.startedAt
        ? Math.max(0, Date.now() - new Date(attempt.startedAt).getTime())
        : null;
  const finishedAt = new Date().toISOString();
  const cost = buildAttemptCost({
    usage: input.usage,
    machine: typeof codespaceMeta.machine === 'string' ? codespaceMeta.machine : null,
    runtimeMs,
    startedAt: attempt.startedAt,
    finishedAt,
    modelStarted: input.modelStarted !== false,
    executor: attemptExecutor(attempt),
  });
  const headSha =
    typeof input.headSha === 'string' && SHA_PATTERN.test(input.headSha.trim())
      ? input.headSha.trim().toLowerCase()
      : null;

  const updated = await patchAttempt(
    input.attemptId,
    {
      status: target,
      finished_at: finishedAt,
      exit_code: typeof input.exitCode === 'number' ? input.exitCode : null,
      head_sha: headSha ?? attempt.headSha,
      error_code: truncateText(input.errorCode, 120) || 'EXECUTION_FAILED',
      error_message: truncateText(input.errorMessage, 2000),
      log_excerpt: truncateLog(input.logExcerpt),
      changed_files: normalizeFiles(input.changedFiles),
      progress_stage: target,
      verification: {
        ...(attempt.verification || {}),
        ...(input.verification || {}),
        cost,
        failure: {
          code: truncateText(input.errorCode, 120) || 'EXECUTION_FAILED',
          modelStarted: input.modelStarted !== false,
          runtimeMs,
        },
      },
    },
    ['claimed', 'running']
  );

  if (!updated) {
    const current = await getAttempt(input.attemptId);
    if (current) return current;
    throw new WorkbenchExecutionError('ATTEMPT_NOT_FOUND', 'Attempt not found.', 404);
  }

  const task = await getTaskRowUnscoped(attempt.taskId);
  if (task && task.status === 'in_progress') {
    // When the worker preserved partial work on the attempt branch, retrying
    // must resume from that commit instead of throwing the work away. Only a
    // pushed SHA is ever recorded as the base by the worker.
    const resumeFrom =
      headSha &&
      [
        'EXECUTION_TIMEOUT',
        'OPENCODE_FAILED',
        'OPENCODE_INTERRUPTED',
        'OPENCODE_REPORT_MISSING',
      ].includes(input.errorCode)
        ? headSha
        : null;
    await patchTask(task.id, {
      status: 'failed',
      last_error_code: truncateText(input.errorCode, 120),
      last_error_message: truncateText(input.errorMessage, 2000),
      ...(resumeFrom ? { base_commit: resumeFrom } : {}),
    });
  }

  await clearWorkerAttempt(input.workerId, attempt.id);
  await settleBatchForTask(attempt.taskId);

  await appendEvent({
    taskId: attempt.taskId,
    attemptId: attempt.id,
    workerId: input.workerId,
    type: input.timedOut ? 'attempt.timed_out' : 'attempt.failed',
    level: 'error',
    message: truncateText(input.errorMessage, 3800) || 'Execution failed.',
    payload: {
      errorCode: input.errorCode,
      exitCode: input.exitCode ?? null,
      headSha,
      cost: {
        modelUsd: cost.model.costUsd,
        codespaceEstimatedUsd: cost.codespace.estimatedUsd,
        totalUsd: cost.totalUsd,
        unknown: cost.unknown,
      },
    },
  });

  return updated;
}

/**
 * Controlled worker shutdown: release the lease, record a timed_out attempt
 * (history preserved) and put the task back at the end of the queue.
 */
export async function releaseAttempt(
  workerId: string,
  attemptId: string,
  reason = 'Worker stopped before completion.'
): Promise<boolean> {
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.workerId !== workerId) return false;
  if (!['claimed', 'running'].includes(attempt.status)) return false;

  const released = await patchAttempt(
    attemptId,
    {
      status: 'timed_out',
      finished_at: new Date().toISOString(),
      error_code: 'WORKER_STOPPED',
      error_message: truncateText(reason, 2000),
      progress_stage: 'released',
    },
    ['claimed', 'running']
  );
  // Completion or another owner action may have won the race. Never overwrite
  // a terminal attempt with a late release callback.
  if (!released) return false;

  const task = await getTaskRowUnscoped(attempt.taskId);
  if (task && task.status === 'in_progress') {
    await patchTask(task.id, {
      status: 'failed',
      last_error_code: 'WORKER_STOPPED',
      last_error_message: truncateText(reason, 2000),
    });
    const position = await nextQueuePosition();
    await recordTaskCostEstimate({
      taskId: task.id,
      batchId: await getBatchIdForTask(task.id),
      title: task.title,
      objective: task.objective,
      acceptanceCriteria: task.acceptanceCriteria,
      trigger: 'release',
    });
    await patchTask(task.id, {
      status: 'queued',
      queue_position: position,
      queued_at: new Date().toISOString(),
    });
  }

  await clearWorkerAttempt(workerId, attemptId);

  await appendEvent({
    taskId: attempt.taskId,
    attemptId,
    workerId,
    type: 'attempt.released',
    level: 'warn',
    message: truncateText(reason, 3800),
  });

  return true;
}

// ---------------------------------------------------------------------------
// Owner actions
// ---------------------------------------------------------------------------

export async function approveTask(
  userId: string,
  taskId: string
): Promise<DevWorkbenchTask | null> {
  const task = await getTaskRow(userId, taskId);
  if (!task) return null;
  // Approval is idempotent. A second click on an already approved or queued
  // task must not add another task.approved event, re-enqueue it, or move its
  // queue_position.
  if (task.status === 'queued') return task;
  if (task.status === 'ready') {
    // Re-approving a ready task re-arms auto-enqueue without emitting a
    // duplicate approval event.
    await setQueueOptOut(taskId, false);
    return task;
  }
  if (!task.objective.trim()) {
    throw new WorkbenchExecutionError(
      'DEV_OBJECTIVE_REQUIRED',
      'A task needs an objective before it can be approved.'
    );
  }
  if (task.acceptanceCriteria.length === 0) {
    throw new WorkbenchExecutionError(
      'DEV_ACCEPTANCE_CRITERIA_REQUIRED',
      'A task needs at least one acceptance criterion before it can be approved.'
    );
  }
  const approved = await transitionTask({
    userId,
    taskId,
    to: 'ready',
    patch: { blocked_reason: null },
    event: {
      type: 'task.approved',
      message: 'Task approved and ready for the queue.',
    },
  });
  // A concurrent approval may have won the compare-and-set. Re-read once and
  // treat the already-approved/queued state as the same idempotent success.
  if (!approved) {
    const current = await getTaskRow(userId, taskId);
    if (current?.status === 'queued') return current;
    if (current?.status === 'ready') {
      await setQueueOptOut(taskId, false);
      return current;
    }
    return null;
  }
  // A fresh approval re-arms the standalone auto-enqueue path.
  await setQueueOptOut(taskId, false);
  return approved;
}

export async function enqueueTask(
  userId: string,
  taskId: string,
  batchId?: string | null
): Promise<DevWorkbenchTask | null> {
  const task = await getTaskRow(userId, taskId);
  if (!task) return null;
  // Repeated enqueue is a no-op: the task already has a queue position and a
  // queued event. This is deliberately before cost estimation so a double
  // click cannot append a second estimate either.
  if (task.status === 'queued') return task;
  if (task.status !== 'ready') {
    throw new WorkbenchExecutionError(
      'DEV_TASK_NOT_READY',
      `Only ready tasks can be queued (current status: ${task.status}).`
    );
  }
  const position = await nextQueuePosition();
  // The estimate is durable before the task reaches the queue. If the optional
  // ledger table is missing, the event payload still preserves the value.
  const estimate = await recordTaskCostEstimate({
    taskId: task.id,
    batchId: isUuid(batchId) ? batchId : null,
    title: task.title,
    objective: task.objective,
    acceptanceCriteria: task.acceptanceCriteria,
    trigger: 'enqueue',
  });
  await appendEvent({
    taskId: task.id,
    type: 'cost.estimated',
    message: `Pre-queue estimate: $${estimate.total.minUsd ?? '—'}–$${
      estimate.total.maxUsd ?? '—'
    } (expected $${estimate.total.expectedUsd ?? '—'}), confidence ${estimate.confidence}.`,
    payload: { estimate: estimate as unknown as Record<string, unknown> },
  }).catch(() => {});
  const patch: Record<string, unknown> = {
    queue_position: position,
    queued_at: new Date().toISOString(),
    last_error_code: null,
    last_error_message: null,
  };
  if (isUuid(batchId)) patch.queue_batch_id = batchId;
  const queued = await transitionTask({
    userId,
    taskId,
    to: 'queued',
    patch,
    event: {
      type: 'task.queued',
      message: `Task added to the queue at position ${position}.`,
    },
  });
  if (queued) {
    await setQueueOptOut(taskId, false);
    await clearTaskActionsDispatch(taskId);
    return queued;
  }
  // A concurrent enqueue or claim won the compare-and-set. A task that is
  // already queued is the same idempotent outcome; anything else is reported
  // as not queued rather than overwriting the winner.
  const current = await getTaskRow(userId, taskId);
  return current?.status === 'queued' ? current : null;
}

export async function dequeueTask(
  userId: string,
  taskId: string
): Promise<DevWorkbenchTask | null> {
  const task = await getTaskRow(userId, taskId);
  if (!task) return null;
  if (task.status === 'ready') {
    // Repeated dequeue is an idempotent no-op. Re-assert the durable opt-out
    // marker without appending another task.dequeued event.
    await setQueueOptOut(taskId, true);
    return task;
  }
  if (task.status === 'in_progress') {
    throw new WorkbenchExecutionError(
      'DEV_TASK_ACTIVE',
      'The task was claimed by a worker and can no longer be dequeued.'
    );
  }
  if (task.status !== 'queued') {
    throw new WorkbenchExecutionError(
      'DEV_TASK_NOT_QUEUED',
      `Only queued tasks can be dequeued (current status: ${task.status}).`
    );
  }
  const dequeued = await transitionTask({
    userId,
    taskId,
    to: 'ready',
    patch: { queue_position: null, queued_at: null },
    event: { type: 'task.dequeued', message: 'Task removed from the queue.' },
  });
  // `ready` is shared with the approval state. Keep the owner's explicit
  // removal durable so idle promotion does not resurrect the task.
  if (dequeued) {
    await setQueueOptOut(taskId, true);
    return dequeued;
  }
  // The claim won the race after our read. Do not write anything else.
  const current = await getTaskRow(userId, taskId);
  if (current?.status === 'in_progress') {
    throw new WorkbenchExecutionError(
      'DEV_TASK_ACTIVE',
      'The task was claimed by a worker and can no longer be dequeued.'
    );
  }
  if (current?.status === 'ready') {
    await setQueueOptOut(taskId, true);
    return current;
  }
  return null;
}

export async function retryTask(userId: string, taskId: string): Promise<DevWorkbenchTask | null> {
  const task = await getTaskRow(userId, taskId);
  if (!task) return null;
  // Retrying an already queued task is a no-op. Re-enqueueing it would move it
  // and clear an in-flight dispatch marker, which could launch a duplicate
  // runner. A genuinely stuck dispatch uses the explicit retry_dispatch path.
  if (task.status === 'queued') return task;
  const active = await getActiveAttempt();
  if (active && active.taskId === taskId) {
    throw new WorkbenchExecutionError(
      'DEV_TASK_ACTIVE',
      'An attempt is still active. Cancel it before retrying.'
    );
  }
  const position = await nextQueuePosition();
  const estimate = await recordTaskCostEstimate({
    taskId: task.id,
    batchId: await getBatchIdForTask(task.id),
    title: task.title,
    objective: task.objective,
    acceptanceCriteria: task.acceptanceCriteria,
    trigger: 'retry',
  });
  await appendEvent({
    taskId: task.id,
    type: 'cost.estimated',
    message: `Retry estimate: expected $${estimate.total.expectedUsd ?? '—'} (${estimate.confidence} confidence).`,
    payload: { estimate: estimate as unknown as Record<string, unknown>, trigger: 'retry' },
  }).catch(() => {});
  const updated = await transitionTask({
    userId,
    taskId,
    to: 'queued',
    patch: {
      queue_position: position,
      queued_at: new Date().toISOString(),
      result_commit: null,
      pull_requests: [],
      verification_status: 'not_run',
      verification_notes: '',
      verified_at: null,
      last_error_code: null,
      last_error_message: null,
    },
    event: {
      type: 'task.retry_queued',
      message: `Retry requested. Previous attempts are preserved; the next attempt will get a new ID and branch.`,
    },
  });
  if (updated) {
    await setQueueOptOut(taskId, false);
    await clearTaskActionsDispatch(taskId);
    return updated;
  }
  // A concurrent retry won the compare-and-set. The task is already queued,
  // which is the same safe outcome; do not enqueue or dispatch it a second time.
  const current = await getTaskRow(userId, taskId);
  return current?.status === 'queued' ? current : null;
}

export async function cancelTask(userId: string, taskId: string): Promise<DevWorkbenchTask | null> {
  const task = await getTaskRow(userId, taskId);
  if (!task) return null;
  if (task.status === 'verified') {
    throw new WorkbenchExecutionError(
      'DEV_TASK_VERIFIED',
      'A verified task cannot be cancelled. Archive it instead.'
    );
  }

  if (task.status === 'in_progress') {
    const active = await getActiveAttempt();
    if (active && active.taskId === task.id && ['claimed', 'running'].includes(active.status)) {
      assertAttemptTransition(active.status, 'cancelled');
      await patchAttempt(active.id, {
        status: 'cancelled',
        finished_at: new Date().toISOString(),
        error_code: 'CANCELLED_BY_OWNER',
        error_message: 'Cancelled by the owner in Admin.',
        progress_stage: 'cancelled',
      });
      await clearWorkerAttempt(active.workerId, active.id);
    }
  }

  const updated = await transitionTask({
    userId,
    taskId,
    to: 'cancelled',
    patch: {
      queue_position: null,
      last_error_code: 'CANCELLED_BY_OWNER',
      last_error_message: 'Cancelled by the owner in Admin.',
    },
    event: {
      type: 'task.cancelled',
      level: 'warn',
      message: 'Task cancelled by the owner.',
    },
  });
  if (updated) await settleBatchForTask(taskId);
  return updated;
}

export async function archiveTask(
  userId: string,
  taskId: string
): Promise<DevWorkbenchTask | null> {
  return transitionTask({
    userId,
    taskId,
    to: 'archived',
    event: { type: 'task.archived', message: 'Task archived.' },
  });
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

function evidenceNotes(evidence: AttemptEvidence): string {
  return [
    `Verdict: ${evidence.verdict}`,
    '',
    `Changed files: ${evidence.changedFiles.length}`,
    `CI checks passed: ${evidence.ciPassed ? 'yes' : 'no'}; failed: ${evidence.ciFailed ? 'yes' : 'no'}`,
    `Executor-reported local commands: ${evidence.localReportedPassed ? 'present' : 'none'}${
      evidence.localTrusted
        ? ' (trusted by server policy)'
        : ' (self-reported, not trusted as proof)'
    }`,
    `Manual confirmation: ${evidence.manualAll ? 'all criteria confirmed by owner' : 'not recorded'}`,
    '',
    'Acceptance criteria:',
    ...evidence.criteria.map(
      (criterion) =>
        `- [${criterion.status}] (${criterion.source}) ${criterion.criterion} — ${criterion.evidence}`
    ),
  ].join('\n');
}

export async function acceptTask(input: {
  userId: string;
  taskId: string;
  manualCriteria?: string[];
}): Promise<DevWorkbenchTask | null> {
  const task = await getTaskRow(input.userId, input.taskId);
  if (!task) return null;
  if (task.status !== 'review') {
    throw new WorkbenchExecutionError(
      'DEV_TASK_NOT_IN_REVIEW',
      `Only review tasks can be accepted (current status: ${task.status}).`
    );
  }

  const attempts = await listAttempts(task.id, 5);
  const attempt = attempts.find((item) => item.status === 'completed') || null;
  const evidence = await collectAttemptEvidence({
    task,
    attempt,
    manualCriteria: input.manualCriteria,
  });

  if (evidence.localReportedFailed && !evidence.ciPassed) {
    throw new WorkbenchExecutionError(
      'DEV_EXECUTOR_REPORTED_FAILURE',
      'The executor reported a failed verification command and no CI run passed. Retry or confirm with new evidence.',
      409,
      { blockingReasons: ['Executor reported a failed command.'], verdict: evidence.verdict }
    );
  }

  if (evidence.verdict === 'rejected' || evidence.verdict === 'not_verified') {
    throw new WorkbenchExecutionError(
      'DEV_EVIDENCE_INSUFFICIENT',
      'The result cannot be verified yet. Resolve the blocking evidence gaps or confirm the criteria manually.',
      409,
      { blockingReasons: evidence.blockingReasons, verdict: evidence.verdict }
    );
  }

  // `verified` must mean every criterion has real evidence. Warnings are
  // allowed, but an unverified criterion is never accepted silently.
  if (evidence.criteria.some((criterion) => criterion.status !== 'satisfied')) {
    throw new WorkbenchExecutionError(
      'DEV_CRITERIA_UNVERIFIED',
      'Every acceptance criterion needs CI evidence or explicit manual confirmation before acceptance.',
      409,
      { blockingReasons: evidence.blockingReasons, verdict: evidence.verdict }
    );
  }

  assertTaskTransition('review', 'verified');
  const notes = evidenceNotes(evidence);

  const updated = await attachDevTaskResult({
    userId: input.userId,
    taskId: task.id,
    resultCommit: attempt?.headSha || task.resultCommit,
    pullRequests: attempt?.prUrl ? [attempt.prUrl] : task.pullRequests,
    resultNotes: attempt?.resultSummary || task.resultCommit || '',
    verificationStatus: evidence.verdict,
    verificationNotes: notes,
    status: 'verified',
  });
  if (!updated) {
    throw new WorkbenchExecutionError(
      'DEV_ACCEPT_FAILED',
      'Unable to persist the acceptance.',
      500
    );
  }

  // Guard against a regression in the shared validator.
  validateDevTaskCompletion({
    verificationStatus: updated.verificationStatus,
    acceptanceCriteria: updated.acceptanceCriteria,
    tests: updated.tests,
    unverified: updated.unverified,
    verificationNotes: updated.verificationNotes,
    resultCommit: updated.resultCommit,
    pullRequests: updated.pullRequests,
  });

  await appendEvent({
    taskId: task.id,
    attemptId: attempt?.id,
    type: 'task.verified',
    message: `Owner accepted the result (${evidence.verdict}).`,
    payload: {
      verdict: evidence.verdict,
      manualAll: evidence.manualAll,
      ciPassed: evidence.ciPassed,
      criteria: evidence.criteria.map((criterion) => ({
        criterion: criterion.criterion,
        status: criterion.status,
        source: criterion.source,
      })),
    },
  });

  return getTaskRow(input.userId, task.id);
}

export async function rejectTask(
  userId: string,
  taskId: string,
  reason: string
): Promise<DevWorkbenchTask | null> {
  return transitionTask({
    userId,
    taskId,
    to: 'rejected',
    patch: {
      verification_status: 'rejected',
      verification_notes: truncateText(reason, 16_000) || 'Rejected by the owner.',
      verified_at: new Date().toISOString(),
    },
    event: {
      type: 'task.rejected',
      level: 'warn',
      message: truncateText(reason, 3800) || 'Rejected by the owner.',
    },
  });
}

export async function mergeTask(
  userId: string,
  taskId: string
): Promise<{ prUrl: string; mergeSha: string | null; deployment: DevReviewView['deployment'] }> {
  const task = await getTaskRow(userId, taskId);
  if (!task) throw new WorkbenchExecutionError('DEV_TASK_NOT_FOUND', 'Task not found.', 404);
  if (task.status !== 'verified') {
    throw new WorkbenchExecutionError(
      'DEV_TASK_NOT_VERIFIED',
      'Only an explicitly verified task can be merged.'
    );
  }

  const attempts = await listAttempts(task.id, 5);
  const attempt = attempts.find((item) => item.prNumber && item.headSha) || null;
  if (!attempt || !attempt.prNumber || !attempt.headSha) {
    throw new WorkbenchExecutionError(
      'DEV_PR_REQUIRED',
      'No pull request with a reviewed head SHA is attached to this task.'
    );
  }

  const status = await getPullRequestStatus(task.repository, attempt.prNumber);
  if (!status) {
    throw new WorkbenchExecutionError('DEV_PR_UNAVAILABLE', 'GitHub PR status is unavailable.');
  }
  if (status.merged) {
    throw new WorkbenchExecutionError(
      'DEV_PR_ALREADY_MERGED',
      'The pull request is already merged.'
    );
  }
  if (status.headSha.toLowerCase() !== attempt.headSha.toLowerCase()) {
    throw new WorkbenchExecutionError(
      'DEV_PR_STALE',
      'The PR head changed after verification. Re-run review and verify again.'
    );
  }

  const merged = await mergeVerifiedPullRequest({
    repository: task.repository,
    number: attempt.prNumber,
    expectedHeadSha: attempt.headSha,
  });
  if (!merged.merged) {
    throw new WorkbenchExecutionError(
      'DEV_MERGE_FAILED',
      `GitHub did not merge the pull request: ${merged.message || 'unknown reason'}`
    );
  }

  const deployment = await getVercelDeploymentStatus({
    repository: task.repository,
    commitSha: merged.sha,
  });

  const verification = {
    mergedAt: new Date().toISOString(),
    mergeSha: merged.sha,
    mergedBy: userId,
    deployment,
  };
  await patchAttempt(attempt.id, {
    verification: {
      ...(typeof attempt.verification === 'object' && attempt.verification
        ? attempt.verification
        : {}),
      ...verification,
    },
  });
  await patchTask(task.id, {
    result_notes:
      `${task.resultNotes ? `${task.resultNotes}\n\n` : ''}Merged ${merged.sha || ''} at ${verification.mergedAt}.`.trim(),
  });

  await appendEvent({
    taskId: task.id,
    attemptId: attempt.id,
    type: 'pull_request.merged',
    message: `Owner merged PR #${attempt.prNumber} (${merged.sha || 'sha unavailable'}).`,
    payload: { prUrl: status.url, mergeSha: merged.sha, deployment: deployment.state },
  });

  // The merge is final. Archiving keeps the full history and removes the task
  // from the active review queue without deleting anything.
  await transitionTask({
    userId,
    taskId: task.id,
    to: 'archived',
    event: {
      type: 'task.merged_archived',
      message: `Merged PR #${attempt.prNumber}; task archived after the merge.`,
    },
  });

  return { prUrl: status.url, mergeSha: merged.sha, deployment };
}

// ---------------------------------------------------------------------------
// Review view
// ---------------------------------------------------------------------------

export async function buildAttemptReview(input: {
  userId: string;
  taskId: string;
  report?: {
    changedFiles: DevReviewView['changedFiles'];
    checks: DevReviewView['checks'];
    findings: DevReviewView['findings'];
    summary: string;
    limitations: string[];
    verdict: string | null;
  } | null;
  manualCriteria?: string[];
}): Promise<DevReviewView | null> {
  const task = await getTaskRow(input.userId, input.taskId);
  if (!task) return null;
  const attempts = await listAttempts(task.id, 10);
  const attempt = attempts.find((item) => item.status === 'completed') || attempts[0] || null;
  const evidence = await collectAttemptEvidence({
    task,
    attempt,
    manualCriteria: input.manualCriteria,
  });

  return {
    task,
    attempt,
    criteria: evidence.criteria,
    changedFiles: input.report?.changedFiles || [],
    checks: evidence.ciRuns,
    findings: input.report?.findings || [],
    verdict: input.report?.verdict || evidence.verdict,
    summary: input.report?.summary || attempt?.resultSummary || '',
    limitations: [
      ...(input.report?.limitations || []),
      'Executor-reported commands are self-reported unless PIERROT_DEV_TRUST_SELF_REPORTED_CHECKS is enabled.',
      'A commit or pull request alone is not proof that acceptance criteria are satisfied.',
    ],
    prUrl: attempt?.prUrl || task.pullRequests[0] || null,
    mergeable: Boolean(
      task.status === 'verified' &&
        attempt?.prNumber &&
        attempt?.headSha &&
        !['rejected', 'not_verified'].includes(evidence.verdict)
    ),
    deployment: null,
  };
}

export async function countTaskStatuses(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const { listTaskRows } = await import('./store');
  const rows = await listTaskRows({ userId, limit: 200 });
  for (const row of rows) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }
  return counts;
}

export async function queuePaused(): Promise<boolean> {
  const value = await getSetting<boolean>('queue_paused', false);
  return value === true;
}

export function statusAfterCancel(status: DevWorkbenchTaskStatus): DevWorkbenchTaskStatus {
  assertTaskTransition(status, 'cancelled');
  return 'cancelled';
}
