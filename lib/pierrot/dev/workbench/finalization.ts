import { randomUUID } from 'crypto';
import { assertServerOnly } from '@/lib/serverOnly';
import {
  appendEvent,
  getBatchIdForTask,
  getQueueSnapshot,
  getSetting,
  isWorkbenchSchemaReady,
  listAttemptsForTasks,
  listFinalizationTasks,
  maybeCompleteBatch,
  patchTask,
  setSetting,
  tryAcquireFinalizationLock,
} from './store';
import {
  commitUrl,
  getBranchHead,
  getCommitChecks,
  getPullRequestStatus,
  mergeVerifiedPullRequest,
  type GitHubChecksSummary,
} from './github';
import { readAttemptCost, summarizeCosts } from './costs';
import { planTaskReconciliation } from './reconciliation';
import { notifyDevOwner } from './notifications';
import type {
  DevFinalizationCheckStatus,
  DevFinalizationPullRequest,
  DevFinalizationReport,
  DevFinalizationStage,
  DevLifecycleCost,
  DevWorkbenchTask,
} from './types';

assertServerOnly('lib/pierrot/dev/workbench/finalization');

const STATE_KEY = 'finalization:state';
const DEFAULT_BRANCH = 'main';
const MAX_PULL_REQUESTS = 20;

type FinalizationState = {
  id: string;
  stage: DevFinalizationStage;
  trigger: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  batchId: string | null;
  attempts: number;
  integrated: Array<{
    key: string;
    prNumber: number | null;
    url: string;
    sha: string | null;
    at: string;
  }>;
  prs: DevFinalizationPullRequest[];
  mainSha: string | null;
  commitUrl: string | null;
  ciStatus: DevFinalizationCheckStatus;
  ciDetail: string;
  checks: DevFinalizationPullRequest['checks'];
  blockedReason: string | null;
  failureStage: string | null;
  waitingSince: string | null;
  cost: DevLifecycleCost | null;
  lastTrigger: string;
  blockedCode: string | null;
  retryAt: string | null;
};

export type QueueDrainState = {
  drained: boolean;
  reasons: string[];
  counts: {
    queued: number;
    ready: number;
    active: number;
    activeTasks: number;
    review: number;
    activeBatches: number;
    paused: boolean;
  };
};

function nowIso(): string {
  return new Date().toISOString();
}

function ciTimeoutMs(): number {
  const raw = Number(process.env.PIERROT_DEV_FINALIZATION_CI_TIMEOUT_SECONDS);
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 30 * 60;
  return Math.min(Math.max(Math.trunc(seconds), 120), 2 * 60 * 60) * 1000;
}

function text(value: unknown, limit = 1600): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

export function parsePullRequestNumber(url: string): number | null {
  const match = String(url || '').match(/\/pull\/(\d+)(?:\b|$)/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function isQueueDrained(queue: {
  queued: number;
  ready?: number;
  active: number;
  activeTasks: number;
  activeBatches?: number;
  paused: boolean;
}): QueueDrainState {
  const ready = queue.ready ?? 0;
  const activeBatches = queue.activeBatches ?? 0;
  const reasons: string[] = [];
  if (queue.paused) reasons.push('The queue is paused.');
  if (queue.queued > 0) reasons.push(`${queue.queued} queued task(s).`);
  if (ready > 0) reasons.push(`${ready} ready task(s) awaiting explicit enqueue.`);
  if (queue.activeTasks > 0) reasons.push(`${queue.activeTasks} task(s) in progress.`);
  if (queue.active > 0) reasons.push(`${queue.active} active attempt(s).`);
  if (activeBatches > 0) reasons.push(`${activeBatches} active batch(es).`);
  return {
    drained: reasons.length === 0,
    reasons,
    counts: {
      queued: queue.queued,
      ready,
      active: queue.active,
      activeTasks: queue.activeTasks,
      review: 0,
      activeBatches,
      paused: queue.paused,
    },
  };
}

type PrCandidate = {
  task: DevWorkbenchTask;
  url: string;
  number: number | null;
};

export function collectPrCandidates(tasks: DevWorkbenchTask[]): PrCandidate[] {
  const seen = new Set<string>();
  const candidates: PrCandidate[] = [];
  for (const task of tasks) {
    for (const url of task.pullRequests) {
      if (!url || seen.has(url)) continue;
      seen.add(url);
      candidates.push({
        task,
        url,
        number: parsePullRequestNumber(url),
      });
    }
  }
  return candidates.slice(0, MAX_PULL_REQUESTS);
}

/** The first PR that is safe to merge; pending PRs wait for a later pass. */
export function chooseMergeCandidate(
  prs: DevFinalizationPullRequest[]
): DevFinalizationPullRequest | null {
  return (
    prs.find(
      (pr) =>
        !pr.integrated && pr.state === 'open' && pr.mergeable === true && pr.ciStatus === 'passed'
    ) || null
  );
}

function stateFromSetting(value: unknown): FinalizationState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = text(record.id, 80);
  const stage = text(record.stage, 30) as DevFinalizationStage;
  const stages: DevFinalizationStage[] = [
    'idle',
    'collecting',
    'integrating',
    'verifying',
    'completed',
    'blocked',
    'failed',
  ];
  if (!id || !stages.includes(stage)) return null;
  return {
    id,
    stage,
    trigger: text(record.trigger, 80) || 'unknown',
    startedAt: text(record.startedAt, 40) || nowIso(),
    updatedAt: text(record.updatedAt, 40) || nowIso(),
    completedAt: text(record.completedAt, 40) || null,
    batchId: text(record.batchId, 64) || null,
    attempts:
      typeof record.attempts === 'number' && Number.isFinite(record.attempts)
        ? Math.max(0, Math.trunc(record.attempts))
        : 0,
    integrated: Array.isArray(record.integrated)
      ? record.integrated
          .filter(
            (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
          )
          .map((item) => ({
            key: text(item.key, 300),
            prNumber:
              typeof item.prNumber === 'number' && Number.isFinite(item.prNumber)
                ? Math.trunc(item.prNumber)
                : null,
            url: text(item.url, 400),
            sha: text(item.sha, 40) || null,
            at: text(item.at, 40) || nowIso(),
          }))
          .filter((item) => item.url)
      : [],
    prs: Array.isArray(record.prs)
      ? (record.prs.filter(
          (item) => item && typeof item === 'object'
        ) as DevFinalizationPullRequest[])
      : [],
    mainSha: text(record.mainSha, 40) || null,
    commitUrl: text(record.commitUrl, 500) || null,
    ciStatus: (text(record.ciStatus, 20) || 'unknown') as DevFinalizationCheckStatus,
    ciDetail: text(record.ciDetail, 1000),
    checks: Array.isArray(record.checks)
      ? (record.checks as DevFinalizationPullRequest['checks'])
      : [],
    blockedReason: text(record.blockedReason, 2000) || null,
    failureStage: text(record.failureStage, 40) || null,
    waitingSince: text(record.waitingSince, 40) || null,
    cost: (record.cost as DevLifecycleCost) || null,
    lastTrigger: text(record.lastTrigger, 80) || 'unknown',
    blockedCode: text(record.blockedCode, 80) || null,
    retryAt: text(record.retryAt, 40) || null,
  };
}

function reportFromState(state: FinalizationState): DevFinalizationReport {
  const integrated = state.integrated.length;
  const completedAt = state.completedAt;
  const durationMs =
    completedAt && state.startedAt
      ? Math.max(0, new Date(completedAt).getTime() - new Date(state.startedAt).getTime())
      : null;
  return {
    id: state.id,
    stage: state.stage,
    trigger: state.lastTrigger || state.trigger,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    completedAt,
    durationMs,
    batchId: state.batchId,
    tasks: new Set(state.prs.map((pr) => pr.taskId)).size,
    completedTasks: state.prs.filter((pr) => pr.integrated).length,
    pullRequests: state.prs.length,
    integrated,
    commitSha: state.mainSha,
    commitUrl: state.commitUrl,
    ciStatus: state.ciStatus,
    ciDetail: state.ciDetail,
    checks: state.checks,
    cost: state.cost,
    prs: state.prs,
    blockedReason: state.blockedReason,
    failureStage: state.failureStage,
    attempts: state.attempts,
    blockedCode: state.blockedCode,
    retryAt: state.retryAt,
  };
}

export async function getFinalizationReport(): Promise<DevFinalizationReport | null> {
  try {
    const state = stateFromSetting(await getSetting<unknown>(STATE_KEY, null));
    return state ? reportFromState(state) : null;
  } catch {
    return null;
  }
}

async function saveState(state: FinalizationState): Promise<void> {
  state.updatedAt = nowIso();
  // Keep the idempotency ledger bounded; the event journal retains full history.
  state.integrated = state.integrated.slice(-200);
  state.prs = state.prs.slice(-50);
  await setSetting(STATE_KEY, state);
}

function integratedKeys(state: FinalizationState | null): Set<string> {
  return new Set((state?.integrated || []).map((item) => item.key).filter(Boolean));
}

type GitHubFailure = {
  code: string;
  message: string;
  endpoint: string | null;
  permission: string | null;
  retryAt: string | null;
  rateLimited: boolean;
  permissionDenied: boolean;
};

/**
 * Read a structured WorkbenchGitHubError without depending on the concrete
 * class. This keeps mocks and older persisted state safe while preserving the
 * endpoint/permission/retry details that caused a failure.
 */
function describeGitHubFailure(error: unknown): GitHubFailure {
  const value =
    error && typeof error === 'object'
      ? (error as {
          code?: unknown;
          endpoint?: unknown;
          requiredPermission?: unknown;
          retryAt?: unknown;
          rateLimited?: unknown;
          permissionDenied?: unknown;
        })
      : {};
  const code = typeof value.code === 'string' && value.code ? value.code : 'GITHUB_API_ERROR';
  const message =
    error instanceof Error && error.message
      ? error.message.slice(0, 1200)
      : 'The GitHub request failed.';
  const endpoint = typeof value.endpoint === 'string' ? value.endpoint : null;
  const permission = typeof value.requiredPermission === 'string' ? value.requiredPermission : null;
  const retryAt = typeof value.retryAt === 'string' ? value.retryAt : null;
  const rateLimited = value.rateLimited === true || code === 'GITHUB_RATE_LIMITED';
  const permissionDenied =
    value.permissionDenied === true ||
    code === 'GITHUB_PERMISSION_DENIED' ||
    code === 'GITHUB_AUTH_FAILED';
  return { code, message, endpoint, permission, retryAt, rateLimited, permissionDenied };
}

function formatGitHubBlockReason(action: string, failure: GitHubFailure): string {
  const details = [
    failure.endpoint ? `endpoint ${failure.endpoint}` : null,
    failure.permission ? `required permission ${failure.permission}` : null,
  ].filter(Boolean);
  const suffix = details.length > 0 ? ` (${details.join('; ')})` : '';
  if (failure.permissionDenied) {
    return `${action}: ${failure.message}${suffix} Automatic retry is disabled until GITHUB_TOKEN is fixed; use Retry finalization after updating the token.`;
  }
  if (failure.rateLimited) {
    return `${action}: ${failure.message}${suffix} Rate-limit retries are bounded; finalization will resume after ${
      failure.retryAt || 'the reset time'
    } or on an explicit retry.`;
  }
  return `${action}: ${failure.message}${suffix} No merge was attempted.`;
}

function recordIntegrated(
  state: FinalizationState,
  input: { key: string; prNumber: number | null; url: string; sha: string | null }
): boolean {
  if (state.integrated.some((item) => item.key === input.key)) return false;
  state.integrated.push({ ...input, at: nowIso() });
  return true;
}

function newState(input: {
  trigger: string;
  batchId: string | null;
  previous: FinalizationState | null;
}): FinalizationState {
  return {
    id: randomUUID(),
    stage: 'collecting',
    trigger: input.trigger,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
    batchId: input.batchId,
    attempts: 0,
    integrated: input.previous?.integrated || [],
    prs: [],
    mainSha: null,
    commitUrl: null,
    ciStatus: 'unknown',
    ciDetail: 'Finalization started.',
    checks: [],
    blockedReason: null,
    failureStage: null,
    waitingSince: null,
    cost: null,
    lastTrigger: input.trigger,
    blockedCode: null,
    retryAt: null,
  };
}

async function finalizationCost(taskIds: string[]): Promise<DevLifecycleCost | null> {
  if (taskIds.length === 0) return null;
  try {
    const attemptsByTask = await listAttemptsForTasks(taskIds, 50);
    const costs = [];
    for (const attempts of attemptsByTask.values()) {
      for (const attempt of attempts) {
        const cost = readAttemptCost(attempt.verification);
        if (cost) costs.push(cost);
      }
    }
    return summarizeCosts(costs);
  } catch {
    return null;
  }
}

async function verifyTaskIntegrated(input: {
  taskId: string;
  sha: string | null;
  prUrl: string;
  state: FinalizationState;
}): Promise<void> {
  const task = (await listFinalizationTasks(200)).find((item) => item.id === input.taskId);
  if (!task) return;
  if (task.status === 'review' || task.status === 'verified') {
    const attempts = (await listAttemptsForTasks([task.id], 5)).get(task.id) || [];
    const latest =
      attempts.find((attempt) => attempt.status === 'completed') || attempts[0] || null;
    // Use exactly the same semantics as the standalone reconciliation pass:
    // integration is not verification, and an invalid/legacy verification value
    // is never written (which previously left production rows stuck at
    // `review` + `partial` after the PR had merged).
    const plan = planTaskReconciliation({
      task,
      pr: {
        number: parsePullRequestNumber(input.prUrl),
        url: input.prUrl,
        state: 'closed',
        merged: true,
        mergeCommitSha: input.sha,
        headSha: input.sha,
      },
      attempt: latest as Parameters<typeof planTaskReconciliation>[0]['attempt'],
    });
    if (plan.patch) {
      await patchTask(task.id, plan.patch, ['review', 'verified']).catch(() => null);
    }
    if (plan.event) {
      await appendEvent({
        taskId: task.id,
        type: plan.event.type,
        level: plan.event.level,
        message: plan.event.message,
        payload: plan.event.payload,
        dedupeKey: plan.dedupeKey,
      }).catch(() => undefined);
    }
  }
  const batchId = await getBatchIdForTask(task.id).catch(() => null);
  if (batchId) await maybeCompleteBatch(batchId).catch(() => false);
}

async function block(
  state: FinalizationState,
  input: {
    stage: DevFinalizationStage;
    reason: string;
    level?: 'error' | 'warn';
    code?: string | null;
    retryAt?: string | null;
  }
): Promise<FinalizationState> {
  state.stage = 'blocked';
  state.failureStage = input.stage;
  state.blockedReason = text(input.reason, 2000) || 'Finalization was blocked.';
  state.blockedCode = input.code ?? null;
  state.retryAt = input.retryAt ?? null;
  await saveState(state);

  await appendEvent({
    type: 'integration.blocked',
    level: input.level || 'warn',
    message: state.blockedReason,
    payload: {
      finalizationId: state.id,
      stage: input.stage,
      code: state.blockedCode,
      retryAt: state.retryAt,
      prs: state.prs.map((pr) => ({
        number: pr.number,
        url: pr.url,
        state: pr.state,
        mergeable: pr.mergeable,
        ciStatus: pr.ciStatus,
        reason: pr.reason,
      })),
    },
    dedupeKey: `integration-blocked:${state.id}:${input.stage}:${state.blockedCode || 'none'}`,
  }).catch(() => {});
  await appendEvent({
    type: 'batch.finalization.failed',
    level: 'error',
    message: `Finalization blocked at ${input.stage}: ${state.blockedReason}`,
    payload: { finalizationId: state.id, failureStage: input.stage, code: state.blockedCode },
    dedupeKey: `batch-finalization-failed:${state.id}:${state.blockedCode || input.stage}`,
  }).catch(() => {});

  await notifyDevOwner({
    eventKey: `finalization-blocked:${state.id}:${state.blockedCode || input.stage}`,
    title: 'Pierrot Dev · finalization blocked',
    lines: [
      `Stage: ${input.stage}`,
      state.blockedReason,
      `PRs: ${state.prs.length}, integrated: ${state.integrated.length}`,
      'The Codespace may stop; no changes were discarded and no force push was performed.',
    ],
  }).catch(() => {});
  return state;
}

async function fail(
  state: FinalizationState,
  input: { stage: DevFinalizationStage; reason: string; code?: string | null }
): Promise<FinalizationState> {
  state.stage = 'failed';
  state.failureStage = input.stage;
  state.blockedReason = text(input.reason, 2000) || 'Finalization failed.';
  state.blockedCode = input.code ?? null;
  state.retryAt = null;
  await saveState(state);
  await appendEvent({
    type: 'batch.finalization.failed',
    level: 'error',
    message: state.blockedReason,
    payload: { finalizationId: state.id, failureStage: input.stage, code: state.blockedCode },
    dedupeKey: `batch-finalization-failed:${state.id}`,
  }).catch(() => {});
  await notifyDevOwner({
    eventKey: `finalization-failed:${state.id}`,
    title: 'Pierrot Dev · finalization failed',
    lines: [state.blockedReason, `Stage: ${input.stage}`],
  }).catch(() => {});
  return state;
}

function basePullRequest(input: {
  task: DevWorkbenchTask;
  url: string;
  number: number | null;
}): DevFinalizationPullRequest {
  return {
    taskId: input.task.id,
    taskTitle: input.task.title,
    number: input.number,
    url: input.url,
    state: 'unknown',
    merged: false,
    mergeable: null,
    mergeableState: null,
    headSha: input.task.resultCommit,
    ciStatus: 'unknown',
    ciDetail: 'PR status has not been read.',
    checks: [],
    integrated: false,
    integrationSha: null,
    reason: null,
    errorCode: null,
    errorDetail: null,
  };
}

async function refreshPullRequest(input: {
  task: DevWorkbenchTask;
  url: string;
  number: number | null;
}): Promise<DevFinalizationPullRequest> {
  const base = basePullRequest(input);
  if (!input.number) {
    return {
      ...base,
      state: 'invalid',
      ciStatus: 'unknown',
      ciDetail: 'The task stores a PR URL without a pull request number.',
      reason: 'INVALID_PR_URL',
      errorCode: 'INVALID_PR_URL',
    };
  }
  const status = await getPullRequestStatus(input.task.repository, input.number);
  if (!status) {
    return {
      ...base,
      ciStatus: 'unknown',
      ciDetail: `GitHub did not return pull request #${input.number} (404 or inaccessible).`,
      reason: 'PR_STATUS_UNAVAILABLE',
      errorCode: 'PR_STATUS_UNAVAILABLE',
    };
  }

  let checks: Awaited<ReturnType<typeof getCommitChecks>>;
  if (status.merged) {
    // The merge is already done. Try to report the real CI result, but never
    // block an already-integrated PR just because checks cannot be re-read.
    try {
      checks = await getCommitChecks(input.task.repository, status.headSha);
    } catch (error) {
      const failure = describeGitHubFailure(error);
      checks = {
        status: 'unknown',
        detail: `PR is already merged; CI could not be read: ${failure.message}`,
        checks: [],
      };
    }
  } else {
    checks = await getCommitChecks(input.task.repository, status.headSha);
  }

  const reason = status.merged
    ? 'ALREADY_MERGED'
    : checks.status === 'failed'
      ? 'CI_FAILED'
      : checks.status === 'unknown'
        ? 'CI_UNKNOWN'
        : checks.status === 'pending'
          ? 'CI_PENDING'
          : status.mergeable === false
            ? 'MERGE_CONFLICT'
            : null;
  return {
    ...base,
    state: status.merged ? 'merged' : status.state,
    merged: status.merged,
    mergeable: status.mergeable,
    mergeableState: status.mergeableState,
    headSha: status.headSha,
    ciStatus: checks.status,
    ciDetail: checks.detail,
    checks: checks.checks,
    integrated: status.merged,
    integrationSha: status.merged ? status.headSha : null,
    reason,
    errorCode: reason,
  };
}

function ciFromChecks(checks: GitHubChecksSummary): {
  status: DevFinalizationCheckStatus;
  detail: string;
  checks: DevFinalizationPullRequest['checks'];
} {
  return { status: checks.status, detail: checks.detail, checks: checks.checks };
}

async function advanceLocked(input: {
  trigger: string;
  force?: boolean;
}): Promise<DevFinalizationReport | null> {
  const [queue, tasks] = await Promise.all([getQueueSnapshot(), listFinalizationTasks(200)]);
  const drain = isQueueDrained(queue);
  let state = stateFromSetting(await getSetting<unknown>(STATE_KEY, null));
  const activeStages: DevFinalizationStage[] = ['collecting', 'integrating', 'verifying'];

  if (!drain.drained) {
    if (state && activeStages.includes(state.stage)) {
      state.stage = 'idle';
      state.blockedReason = `Queue refilled: ${drain.reasons.join(' ')}`;
      state.failureStage = null;
      state.blockedCode = null;
      state.retryAt = null;
      state.lastTrigger = input.trigger;
      await saveState(state);
      await appendEvent({
        type: 'queue.refilled',
        level: 'info',
        message: 'Finalization stopped because executable work arrived.',
        payload: { reasons: drain.reasons, finalizationId: state.id },
        dedupeKey: `queue-refilled:${state.id}:${Math.floor(Date.now() / 60_000)}`,
      }).catch(() => {});
    }
    return state ? reportFromState(state) : null;
  }

  const candidates = collectPrCandidates(tasks);
  const integrated = integratedKeys(state);
  const pending = candidates.filter((candidate) => !integrated.has(candidate.url));

  if (
    pending.length > 0 &&
    (!state ||
      (!activeStages.includes(state.stage) &&
        state.stage !== 'blocked' &&
        state.stage !== 'failed'))
  ) {
    const candidateTaskId = candidates[0]?.task.id || null;
    state = newState({
      trigger: input.trigger,
      batchId: candidateTaskId ? await getBatchIdForTask(candidateTaskId).catch(() => null) : null,
      previous: state,
    });
    await saveState(state);
    await appendEvent({
      type: 'queue.drained',
      message: `Queue drained: ${queue.queued} queued, ${queue.ready || 0} ready, ${queue.active} active attempt(s).`,
      payload: {
        finalizationId: state.id,
        queued: queue.queued,
        ready: queue.ready || 0,
        activeAttempts: queue.active,
        activeTasks: queue.activeTasks,
        activeBatches: queue.activeBatches || 0,
      },
      dedupeKey: `queue-drained:${Math.floor(Date.now() / 600_000)}`,
    }).catch(() => {});
    await appendEvent({
      type: 'batch.finalization.started',
      message: `Finalization started for ${candidates.length} pull request(s).`,
      payload: { finalizationId: state.id, pullRequests: candidates.length },
      dedupeKey: `batch-finalization-started:${state.id}`,
    }).catch(() => {});
    await notifyDevOwner({
      eventKey: `queue-drained:${state.id}`,
      title: 'Pierrot Dev · queue drained',
      lines: [
        'All queued work is complete. Final integration has started.',
        `Pull requests to integrate: ${candidates.length}`,
      ],
    }).catch(() => {});
  }

  if (!state) {
    // Nothing to integrate and no previous finalization. Record a quiet pass so
    // Admin can distinguish "drained, nothing to do" from "still working".
    const empty = newState({
      trigger: input.trigger,
      batchId: null,
      previous: null,
    });
    empty.stage = 'completed';
    empty.completedAt = nowIso();
    empty.ciStatus = 'none';
    empty.ciDetail = 'No completed task with a pull request needed integration.';
    await saveState(empty);
    await appendEvent({
      type: 'queue.drained',
      message: 'Queue drained; no pull requests needed integration.',
      payload: { finalizationId: empty.id },
      dedupeKey: `queue-drained:${Math.floor(Date.now() / 600_000)}`,
    }).catch(() => {});
    return reportFromState(empty);
  }

  state.attempts += 1;
  state.lastTrigger = input.trigger;
  state.updatedAt = nowIso();

  if (state.stage === 'blocked' && !input.force) {
    const retryAt = state.retryAt ? new Date(state.retryAt).getTime() : Number.NaN;
    const rateLimitReady =
      state.blockedCode === 'GITHUB_RATE_LIMITED' &&
      Number.isFinite(retryAt) &&
      Date.now() >= retryAt;
    if (!rateLimitReady) {
      await saveState(state);
      return reportFromState(state);
    }
    // Rate-limit reset has passed: continue the same idempotent pass.
  }
  if (state.stage === 'failed' && !input.force) {
    await saveState(state);
    return reportFromState(state);
  }
  if (state.stage === 'completed') {
    if (pending.length === 0) return reportFromState(state);
    state = newState({
      trigger: input.trigger,
      batchId: state.batchId,
      previous: state,
    });
    await saveState(state);
  }
  if (state.stage === 'idle' || state.stage === 'blocked' || state.stage === 'failed') {
    state.stage = 'collecting';
    state.blockedReason = null;
    state.failureStage = null;
    state.blockedCode = null;
    state.retryAt = null;
    state.completedAt = null;
    state.waitingSince = null;
    await saveState(state);
  }

  if (state.stage === 'collecting') {
    const refreshed: DevFinalizationPullRequest[] = [];
    for (const candidate of pending) {
      const existing = state.prs.find((pr) => pr.url === candidate.url);
      if (existing?.integrated) {
        refreshed.push(existing);
        continue;
      }
      let pr: DevFinalizationPullRequest;
      try {
        pr = await refreshPullRequest(candidate);
      } catch (error) {
        const failure = describeGitHubFailure(error);
        pr = {
          ...basePullRequest(candidate),
          ciStatus: 'unknown',
          ciDetail: failure.message,
          reason: failure.code,
          errorCode: failure.code,
          errorDetail: failure.message,
        };
        refreshed.push(pr);
        state.prs = refreshed;
        return reportFromState(
          await block(state, {
            stage: 'collecting',
            reason: formatGitHubBlockReason(`Could not read PR ${candidate.url}`, failure),
            code: failure.code,
            retryAt: failure.retryAt,
            level: failure.permissionDenied ? 'error' : 'warn',
          })
        );
      }
      refreshed.push(pr);
      if (pr.integrated) {
        recordIntegrated(state, {
          key: pr.url,
          prNumber: pr.number,
          url: pr.url,
          sha: pr.integrationSha,
        });
        await verifyTaskIntegrated({
          taskId: pr.taskId,
          sha: pr.integrationSha,
          prUrl: pr.url,
          state,
        });
      }
    }
    state.prs = refreshed;
    if (refreshed.length === 0) {
      state.stage = 'completed';
      state.completedAt = nowIso();
      state.ciStatus = 'none';
      state.ciDetail = 'No pull requests needed integration.';
      await saveState(state);
      return reportFromState(state);
    }
    const unavailable = refreshed.find((pr) => pr.reason === 'PR_STATUS_UNAVAILABLE');
    if (unavailable) {
      return reportFromState(
        await block(state, {
          stage: 'collecting',
          reason: `Could not read PR ${unavailable.url}: ${unavailable.ciDetail}`,
          code: 'PR_STATUS_UNAVAILABLE',
        })
      );
    }
    const failedCi = refreshed.filter((pr) => !pr.integrated && pr.ciStatus === 'failed');
    if (failedCi.length > 0) {
      return reportFromState(
        await fail(state, {
          stage: 'collecting',
          reason: `CI failed for ${failedCi.map((pr) => `#${pr.number}`).join(', ')}. No merge was attempted.`,
        })
      );
    }
    const conflict = refreshed.find(
      (pr) => !pr.integrated && pr.state === 'open' && pr.mergeable === false
    );
    if (conflict) {
      return reportFromState(
        await block(state, {
          stage: 'collecting',
          reason: `PR #${conflict.number} has a merge conflict (${conflict.mergeableState || 'dirty'}). An architectural decision is required; no merge was attempted.`,
        })
      );
    }
    state.stage = 'integrating';
    state.waitingSince = null;
    await saveState(state);
  }

  if (state.stage === 'integrating') {
    const open = state.prs.filter((pr) => !pr.integrated);
    if (open.length === 0) {
      state.stage = 'verifying';
      state.waitingSince = nowIso();
      await saveState(state);
    } else {
      const mergeable = chooseMergeCandidate(open);
      if (!mergeable) {
        const unknownCi = open.find((pr) => pr.state === 'open' && pr.ciStatus === 'unknown');
        if (unknownCi) {
          return reportFromState(
            await block(state, {
              stage: 'integrating',
              reason: `CI status for PR #${unknownCi.number} could not be read: ${unknownCi.ciDetail}`,
            })
          );
        }
        const pendingCi = open.filter(
          (pr) => pr.state === 'open' && (pr.ciStatus === 'pending' || pr.ciStatus === 'none')
        );
        if (pendingCi.length > 0) {
          state.waitingSince = state.waitingSince || nowIso();
          if (Date.now() - new Date(state.waitingSince).getTime() > ciTimeoutMs()) {
            return reportFromState(
              await fail(state, {
                stage: 'integrating',
                reason: `CI did not finish within the finalization timeout for ${pendingCi
                  .map((pr) => `#${pr.number}`)
                  .join(', ')}.`,
              })
            );
          }
          await saveState(state);
          return reportFromState(state);
        }
        const notMergeable = open.find((pr) => pr.state === 'open' && pr.mergeable === false);
        if (notMergeable) {
          return reportFromState(
            await block(state, {
              stage: 'integrating',
              reason: `PR #${notMergeable.number} is not mergeable (${notMergeable.mergeableState || 'dirty'}). No merge was attempted.`,
            })
          );
        }
        const invalid = open.find((pr) => pr.state !== 'open');
        if (invalid) {
          return reportFromState(
            await block(state, {
              stage: 'integrating',
              reason: `PR #${invalid.number} is ${invalid.state}, not open. The task cannot be integrated without owner confirmation.`,
            })
          );
        }
        state.waitingSince = state.waitingSince || nowIso();
        if (Date.now() - new Date(state.waitingSince).getTime() > ciTimeoutMs()) {
          return reportFromState(
            await fail(state, {
              stage: 'integrating',
              reason:
                'GitHub did not report a mergeable PR within the finalization timeout. No merge was attempted.',
            })
          );
        }
        await saveState(state);
        return reportFromState(state);
      }

      // Refresh the exact PR state immediately before merging so a stale
      // mergeability or head SHA can never be used.
      const mergeTask = tasks.find((task) => task.id === mergeable.taskId);
      if (!mergeTask) {
        return reportFromState(
          await block(state, {
            stage: 'integrating',
            reason: `Task ${mergeable.taskId} disappeared before PR #${mergeable.number} could be merged.`,
          })
        );
      }
      let refreshed: DevFinalizationPullRequest;
      try {
        refreshed = await refreshPullRequest({
          task: mergeTask,
          url: mergeable.url,
          number: mergeable.number,
        });
      } catch (error) {
        const failure = describeGitHubFailure(error);
        return reportFromState(
          await block(state, {
            stage: 'integrating',
            reason: formatGitHubBlockReason(
              `Could not re-read PR #${mergeable.number} before merging`,
              failure
            ),
            code: failure.code,
            retryAt: failure.retryAt,
            level: failure.permissionDenied ? 'error' : 'warn',
          })
        );
      }
      const current = state.prs.findIndex((pr) => pr.url === mergeable.url);
      if (current >= 0) state.prs[current] = { ...refreshed, integrated: refreshed.integrated };
      if (refreshed.integrated || refreshed.merged) {
        // The PR was merged after collection (or by a previous attempt whose
        // state write was lost). Record it once and never merge again.
        recordIntegrated(state, {
          key: refreshed.url,
          prNumber: refreshed.number,
          url: refreshed.url,
          sha: refreshed.integrationSha || refreshed.headSha,
        });
        if (current >= 0) {
          state.prs[current] = {
            ...refreshed,
            integrated: true,
            integrationSha: refreshed.integrationSha || refreshed.headSha,
            state: 'merged',
            merged: true,
          };
        }
        await verifyTaskIntegrated({
          taskId: refreshed.taskId,
          sha: refreshed.integrationSha || refreshed.headSha,
          prUrl: refreshed.url,
          state,
        });
        await saveState(state);
        return reportFromState(state);
      }
      if (!refreshed.number) {
        return reportFromState(
          await block(state, { stage: 'integrating', reason: refreshed.ciDetail })
        );
      }
      if (refreshed.ciStatus === 'failed') {
        return reportFromState(
          await fail(state, {
            stage: 'integrating',
            reason: `CI failed for PR #${refreshed.number}: ${refreshed.ciDetail}`,
          })
        );
      }
      if (refreshed.ciStatus === 'unknown') {
        return reportFromState(
          await block(state, {
            stage: 'integrating',
            reason: `CI status for PR #${refreshed.number} could not be read: ${refreshed.ciDetail}`,
          })
        );
      }
      if (refreshed.ciStatus !== 'passed') {
        state.waitingSince = state.waitingSince || nowIso();
        if (Date.now() - new Date(state.waitingSince).getTime() > ciTimeoutMs()) {
          return reportFromState(
            await fail(state, {
              stage: 'integrating',
              reason: `CI did not pass within the finalization timeout for PR #${refreshed.number}.`,
            })
          );
        }
        await saveState(state);
        return reportFromState(state);
      }
      if (refreshed.mergeable !== true || refreshed.state !== 'open') {
        return reportFromState(
          await block(state, {
            stage: 'integrating',
            reason: `PR #${refreshed.number} is not mergeable (${refreshed.mergeableState || refreshed.state}).`,
          })
        );
      }
      const expectedHead = refreshed.headSha || '';
      try {
        const merged = await mergeVerifiedPullRequest({
          repository: mergeTask.repository,
          number: refreshed.number,
          expectedHeadSha: expectedHead,
        });
        if (!merged.merged) {
          return reportFromState(
            await block(state, {
              stage: 'integrating',
              reason: `GitHub did not merge PR #${refreshed.number}: ${merged.message || 'unknown reason'}.`,
            })
          );
        }
        const sha = merged.sha || expectedHead;
        recordIntegrated(state, {
          key: refreshed.url,
          prNumber: refreshed.number,
          url: refreshed.url,
          sha,
        });
        if (current >= 0) {
          state.prs[current] = {
            ...refreshed,
            integrated: true,
            integrationSha: sha,
            state: 'merged',
            merged: true,
            reason: 'ALREADY_MERGED',
            errorCode: null,
            errorDetail: null,
          };
        }
        await verifyTaskIntegrated({
          taskId: refreshed.taskId,
          sha,
          prUrl: refreshed.url,
          state,
        });
        await appendEvent({
          type: 'integration.completed',
          message: `PR #${refreshed.number} integrated into ${DEFAULT_BRANCH} at ${sha.slice(0, 7)}.`,
          payload: {
            finalizationId: state.id,
            prNumber: refreshed.number,
            url: refreshed.url,
            sha,
          },
          dedupeKey: `integration-completed:${refreshed.number}:${sha}`,
        }).catch(() => {});
        await appendEvent({
          type: 'push.completed',
          message: `Commit ${sha.slice(0, 7)} is on ${DEFAULT_BRANCH} via PR #${refreshed.number}.`,
          payload: { finalizationId: state.id, sha, prNumber: refreshed.number },
          dedupeKey: `push-completed:${sha}`,
        }).catch(() => {});
        await notifyDevOwner({
          eventKey: `push-completed:${sha}`,
          title: 'Pierrot Dev · commit pushed to main',
          lines: [
            `PR #${refreshed.number}: ${refreshed.taskTitle}`,
            `${DEFAULT_BRANCH} now contains ${sha.slice(0, 7)}.`,
          ],
          url: commitUrl(mergeTask.repository, sha),
        }).catch(() => {});
        state.stage = 'integrating';
        state.waitingSince = null;
        await saveState(state);
        return reportFromState(state);
      } catch (error) {
        const failure = describeGitHubFailure(error);
        return reportFromState(
          await block(state, {
            stage: 'integrating',
            reason: formatGitHubBlockReason(`PR #${refreshed.number} could not be merged`, failure),
            code: failure.code,
            retryAt: failure.retryAt,
            level: failure.permissionDenied ? 'error' : 'warn',
          })
        );
      }
    }
  }

  if (state.stage === 'verifying') {
    const repository = tasks[0]?.repository || 'newlove';
    let mainSha: string | null;
    try {
      mainSha = await getBranchHead(repository, DEFAULT_BRANCH);
    } catch (error) {
      const failure = describeGitHubFailure(error);
      return reportFromState(
        await block(state, {
          stage: 'verifying',
          reason: formatGitHubBlockReason(`Could not read the ${DEFAULT_BRANCH} head`, failure),
          code: failure.code,
          retryAt: failure.retryAt,
          level: failure.permissionDenied ? 'error' : 'warn',
        })
      );
    }
    state.mainSha = mainSha;
    state.commitUrl = mainSha ? commitUrl(repository, mainSha) : null;
    if (!mainSha) {
      return reportFromState(
        await fail(state, {
          stage: 'verifying',
          reason: `Could not read the ${DEFAULT_BRANCH} head after integration.`,
          code: 'GITHUB_BRANCH_NOT_FOUND',
        })
      );
    }
    let checks: ReturnType<typeof ciFromChecks>;
    try {
      checks = ciFromChecks(await getCommitChecks(repository, mainSha));
    } catch (error) {
      const failure = describeGitHubFailure(error);
      return reportFromState(
        await block(state, {
          stage: 'verifying',
          reason: formatGitHubBlockReason(
            `Could not read CI for ${DEFAULT_BRANCH} at ${mainSha.slice(0, 7)}`,
            failure
          ),
          code: failure.code,
          retryAt: failure.retryAt,
          level: failure.permissionDenied ? 'error' : 'warn',
        })
      );
    }
    state.ciStatus = checks.status;
    state.ciDetail = checks.detail;
    state.checks = checks.checks;
    if (checks.status === 'pending') {
      state.waitingSince = state.waitingSince || nowIso();
      if (Date.now() - new Date(state.waitingSince).getTime() > ciTimeoutMs()) {
        return reportFromState(
          await fail(state, {
            stage: 'verifying',
            reason: `CI on ${DEFAULT_BRANCH} did not finish within the finalization timeout.`,
          })
        );
      }
      await saveState(state);
      return reportFromState(state);
    }
    if (checks.status === 'failed') {
      return reportFromState(
        await fail(state, {
          stage: 'verifying',
          reason: `CI on ${DEFAULT_BRANCH} failed: ${checks.detail}`,
        })
      );
    }
    state.stage = 'completed';
    state.completedAt = nowIso();
    state.cost = await finalizationCost([...new Set(state.prs.map((pr) => pr.taskId))]);
    state.batchId =
      state.batchId || (await getBatchIdForTask(state.prs[0]?.taskId || '').catch(() => null));
    if (state.batchId) await maybeCompleteBatch(state.batchId).catch(() => false);
    await saveState(state);
    await appendEvent({
      type: 'integration.completed',
      message: `Final ${DEFAULT_BRANCH} CI ${checks.status}; ${state.integrated.length} PR(s) integrated.`,
      payload: {
        finalizationId: state.id,
        sha: mainSha,
        ciStatus: checks.status,
        integrated: state.integrated.length,
      },
      dedupeKey: `integration-final:${state.id}`,
    }).catch(() => {});
    await appendEvent({
      type: 'batch.finalization.completed',
      message: `Finalization completed: ${state.integrated.length} PR(s) integrated at ${mainSha.slice(0, 7)}; CI ${checks.status}.`,
      payload: {
        finalizationId: state.id,
        sha: mainSha,
        ciStatus: checks.status,
        integrated: state.integrated.length,
        durationMs: state.completedAt
          ? Math.max(0, new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime())
          : null,
      },
      dedupeKey: `batch-finalization-completed:${state.id}`,
    }).catch(() => {});
    await notifyDevOwner({
      eventKey: `finalization-completed:${state.id}`,
      title: 'Pierrot Dev · queue finalized',
      lines: [
        `Integrated ${state.integrated.length} PR(s) into ${DEFAULT_BRANCH}.`,
        `CI: ${checks.status}.`,
        state.cost?.totalUsd !== null && state.cost?.totalUsd !== undefined
          ? `Cost: $${state.cost.totalUsd.toFixed(4)}.`
          : 'Cost: partially unavailable.',
      ],
      url: state.commitUrl,
    }).catch(() => {});
    return reportFromState(state);
  }

  await saveState(state);
  return reportFromState(state);
}

/**
 * Advance the queue-drain finalization by one bounded step.
 *
 * This function is intentionally safe to call from every idle poll and Admin
 * overview request: a database lock grants one winner per 30-second window,
 * every merge is guarded by the exact PR head SHA, and completed PRs are
 * remembered in settings so a retry is idempotent.
 */
export async function advanceFinalization(input: {
  trigger: string;
  force?: boolean;
}): Promise<DevFinalizationReport | null> {
  if (!(await isWorkbenchSchemaReady())) return null;
  if (!(await tryAcquireFinalizationLock(input.trigger))) {
    return getFinalizationReport();
  }
  try {
    return await advanceLocked(input);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 800) : 'Finalization failed.';
    const state = stateFromSetting(await getSetting<unknown>(STATE_KEY, null));
    if (state) {
      return reportFromState(await fail(state, { stage: state.stage, reason: message }));
    }
    return null;
  }
}

/** Owner-triggered retry after a blocked or failed finalization. */
export async function retryFinalization(
  trigger = 'admin:retry'
): Promise<DevFinalizationReport | null> {
  const state = stateFromSetting(await getSetting<unknown>(STATE_KEY, null));
  if (state) {
    state.stage = 'collecting';
    state.blockedReason = null;
    state.failureStage = null;
    state.blockedCode = null;
    state.retryAt = null;
    state.waitingSince = null;
    state.attempts = 0;
    await saveState(state);
  }
  return advanceFinalization({ trigger, force: true });
}

export async function finalizationNeedsAttention(): Promise<boolean> {
  const report = await getFinalizationReport();
  return Boolean(report && (report.stage === 'blocked' || report.stage === 'failed'));
}
