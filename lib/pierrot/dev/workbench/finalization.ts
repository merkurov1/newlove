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
  closePullRequest,
  getBranchHead,
  getCommitChecks,
  getCommitRange,
  getLatestProductionDeployment,
  getPullRequestFiles,
  getPullRequestStatus,
  mergeBranchInto,
  mergeVerifiedPullRequest,
  type GitHubChecksSummary,
} from './github';
import {
  canRetirePullRequest,
  parsePullRequestNumber,
  selectAuthoritativePullRequest,
  verifyProductionDeployment,
} from './delivery';

export { parsePullRequestNumber };
import {
  blockingLandingRisks,
  canMarkLanded,
  detectLandingRisks,
  formatLandingRiskReason,
  type LandingRisk,
} from './landing';
import { readAttemptCost, summarizeCosts } from './costs';
import { notifyDevOwner } from './notifications';
import type {
  DevDeploymentStatus,
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
/** At most two non-destructive branch synchronisations per finalization. */
const MAX_BRANCH_SYNCS = 2;

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
    headSha: string | null;
    ciStatus: string | null;
    attemptId: string | null;
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
  deployment: DevDeploymentStatus | null;
  productionVerified: boolean;
  deliveryStage: DevFinalizationReport['deliveryStage'];
  syncAttempts: number;
  syncedHeads: string[];
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
  attemptNumber: number | null;
};

type AttemptPrLink = {
  attemptNumber: number;
  prUrl?: string | null;
};

export function collectPrCandidates(
  tasks: DevWorkbenchTask[],
  attemptsByTask: Map<string, AttemptPrLink[]> = new Map()
): PrCandidate[] {
  const seen = new Set<string>();
  const candidates: PrCandidate[] = [];
  for (const task of tasks) {
    const attemptByUrl = new Map<string, number>();
    for (const attempt of attemptsByTask.get(task.id) || []) {
      if (!attempt.prUrl) continue;
      const current = attemptByUrl.get(attempt.prUrl);
      if (current === undefined || attempt.attemptNumber > current) {
        attemptByUrl.set(attempt.prUrl, attempt.attemptNumber);
      }
    }
    task.pullRequests.forEach((url, index) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      candidates.push({
        task,
        url,
        number: parsePullRequestNumber(url),
        attemptNumber: attemptByUrl.get(url) ?? index + 1,
      });
    });
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
            headSha: text(item.headSha, 40) || null,
            ciStatus: text(item.ciStatus, 20) || null,
            attemptId: text(item.attemptId, 80) || null,
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
    deployment:
      record.deployment && typeof record.deployment === 'object'
        ? (record.deployment as DevDeploymentStatus)
        : null,
    productionVerified: record.productionVerified === true,
    deliveryStage:
      (text(record.deliveryStage, 40) as DevFinalizationReport['deliveryStage']) || null,
    syncAttempts:
      typeof record.syncAttempts === 'number' && Number.isFinite(record.syncAttempts)
        ? Math.min(Math.max(0, Math.trunc(record.syncAttempts)), MAX_BRANCH_SYNCS)
        : 0,
    syncedHeads: Array.isArray(record.syncedHeads)
      ? record.syncedHeads.filter((item): item is string => typeof item === 'string').slice(-20)
      : [],
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
    deployment: state.deployment,
    productionVerified: state.productionVerified,
    deliveryStage: state.deliveryStage,
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
  input: {
    key: string;
    prNumber: number | null;
    url: string;
    sha: string | null;
    headSha?: string | null;
    ciStatus?: string | null;
    attemptId?: string | null;
  }
): boolean {
  if (state.integrated.some((item) => item.key === input.key)) return false;
  state.integrated.push({
    key: input.key,
    prNumber: input.prNumber,
    url: input.url,
    sha: input.sha,
    headSha: input.headSha ?? null,
    ciStatus: input.ciStatus ?? null,
    attemptId: input.attemptId ?? null,
    at: nowIso(),
  });
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
    deployment: null,
    productionVerified: false,
    deliveryStage: 'collecting',
    syncAttempts: 0,
    syncedHeads: [],
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

/**
 * Mark a task landed only when the PR is really merged and real CI passed for
 * the exact head SHA. Executor self-report is stored as attempt evidence but
 * never used as the merge gate. A merged PR whose CI cannot be proven stays in
 * review, so no unverified work is presented as complete.
 */
async function verifyTaskIntegrated(input: {
  taskId: string;
  sha: string | null;
  prUrl: string;
  state: FinalizationState;
  headSha: string | null;
  ciStatus: string;
  mergeSha?: string | null;
  checks?: DevFinalizationPullRequest['checks'];
}): Promise<string | null> {
  const task = (await listFinalizationTasks(200)).find((item) => item.id === input.taskId);
  if (!task) return null;

  const attempts = (await listAttemptsForTasks([task.id], 5)).get(task.id) || [];
  const latest = attempts.find((attempt) => attempt.status === 'completed') || attempts[0] || null;
  const attemptId = latest?.id || null;
  const prState = input.state.prs.find((pr) => pr.url === input.prUrl);
  if (prState) {
    prState.attemptId = attemptId;
    prState.mergeSha = input.mergeSha || input.sha || null;
    if (input.headSha) prState.headSha = input.headSha;
  }

  if (task.status === 'review' || task.status === 'verified') {
    const headSha = input.headSha || task.resultCommit;
    const landed = canMarkLanded({
      merged: true,
      ciStatus: input.ciStatus,
      headSha,
      expectedHeadSha: headSha,
    });

    if (!landed) {
      await patchTask(task.id, {
        status: 'review',
        verification_status:
          input.ciStatus === 'passed' ? 'integration_only' : 'ci_evidence_missing',
        verification_notes: `Integrated into ${DEFAULT_BRANCH} by automatic landing (${input.prUrl}), but not verified: real CI evidence for the exact head is required (observed CI: ${input.ciStatus}). No unverified work is marked complete.`,
        verified_at: null,
        result_commit: input.mergeSha || input.sha || task.resultCommit,
      }).catch(() => null);
      await appendEvent({
        taskId: task.id,
        type: 'task.verification_required',
        level: 'warn',
        message:
          'PR merged but task kept in review: real CI checks for the exact head did not pass or could not be read. Executor self-report is not a merge gate.',
        payload: {
          prUrl: input.prUrl,
          headSha,
          mergeSha: input.mergeSha || input.sha,
          attemptId,
          ciStatus: input.ciStatus,
          checks: input.checks || [],
        },
        dedupeKey: `task-verification-required:${task.id}:${input.prUrl}:${input.ciStatus}`,
      }).catch(() => undefined);
      return attemptId;
    }

    const ciSummary = (input.checks || [])
      .map((check) => `${check.name}=${check.conclusion || check.status || 'unknown'}`)
      .slice(0, 10)
      .join(', ');
    await patchTask(task.id, {
      status: 'verified',
      verification_status: 'passed',
      verification_notes: `Landed in ${DEFAULT_BRANCH} by automatic landing (${input.prUrl}) at head ${headSha?.slice(0, 7) || 'unknown'} and merge ${(input.mergeSha || input.sha || '').slice(0, 7) || 'unknown'} with passing real CI${ciSummary ? `: ${ciSummary}` : ''}. Production deployment was observed at that commit; no task was marked verified before this check.`,
      verified_at: nowIso(),
      result_commit: input.mergeSha || input.sha || task.resultCommit,
    }).catch(() => null);
    await appendEvent({
      taskId: task.id,
      type: 'task.verified',
      message: `Task verified after merge into ${DEFAULT_BRANCH} with passing CI for the exact head.`,
      payload: {
        prUrl: input.prUrl,
        headSha,
        mergeSha: input.mergeSha || input.sha,
        attemptId,
        ciStatus: input.ciStatus,
        checks: input.checks || [],
      },
      dedupeKey: `task-verified:${task.id}:${input.prUrl}:${input.sha || headSha}`,
    }).catch(() => undefined);
  }
  const batchId = await getBatchIdForTask(task.id).catch(() => null);
  if (batchId) await maybeCompleteBatch(batchId).catch(() => false);
  return attemptId;
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
  state.deliveryStage = 'blocked';
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
  state.deliveryStage = 'failed';
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
  attemptNumber?: number | null;
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
    headRef: null,
    baseRef: input.task.baseRef || DEFAULT_BRANCH,
    baseSha: null,
    attemptNumber: input.attemptNumber ?? null,
    superseded: false,
    supersededBy: null,
    ciStatus: 'unknown',
    ciDetail: 'PR status has not been read.',
    checks: [],
    integrated: false,
    integrationSha: null,
    mergeSha: null,
    attemptId: null,
    risks: [],
    reason: null,
    errorCode: null,
    errorDetail: null,
  };
}

async function refreshPullRequest(input: {
  task: DevWorkbenchTask;
  url: string;
  number: number | null;
  attemptNumber?: number | null;
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

  // A PR that changes secrets, destructive SQL or the CI workflow must never be
  // landed by the automatic path. The file list is real GitHub evidence; if it
  // cannot be read, refresh throws and the caller stops with a precise reason.
  let risks: LandingRisk[] = [];
  if (!status.merged) {
    const files = await getPullRequestFiles(input.task.repository, input.number);
    risks = detectLandingRisks(files);
  }
  const blocking = blockingLandingRisks(risks);

  const reason = status.merged
    ? 'ALREADY_MERGED'
    : checks.status === 'failed'
      ? 'CI_FAILED'
      : checks.status === 'unknown'
        ? 'CI_UNKNOWN'
        : blocking.length > 0
          ? 'SECURITY_SENSITIVE_CHANGE'
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
    headRef: status.headBranch,
    baseRef: status.baseBranch,
    baseSha: status.baseSha,
    ciStatus: checks.status,
    ciDetail:
      blocking.length > 0
        ? `${checks.detail} Landing blocked: ${formatLandingRiskReason(blocking)}`
        : checks.detail,
    checks: checks.checks,
    integrated: status.merged,
    integrationSha: status.merged ? status.mergeCommitSha || status.headSha : null,
    mergeSha: status.mergeCommitSha,
    risks,
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

/** Convert a refreshed PR into the pure delivery-rule shape. */
function deliveryRef(pr: DevFinalizationPullRequest) {
  return {
    taskId: pr.taskId,
    url: pr.url,
    number: pr.number,
    state: pr.state,
    merged: pr.merged,
    attemptNumber: pr.attemptNumber ?? null,
    headSha: pr.headSha,
    headRef: pr.headRef ?? null,
    baseRef: pr.baseRef ?? null,
    updatedAt: null,
  };
}

/**
 * Synchronise an open PR branch with its base branch using a real merge (never
 * a force push). The attempt is bounded per finalization so a persistent
 * conflict cannot loop forever.
 */
async function synchronizePullRequestBranch(input: {
  state: FinalizationState;
  pr: DevFinalizationPullRequest;
  repository: string;
}): Promise<{
  attempted: boolean;
  synced: boolean;
  reason: string;
  code: string | null;
  failure: GitHubFailure | null;
}> {
  const { state, pr, repository } = input;
  if (!pr.headRef || !pr.baseRef) {
    return {
      attempted: false,
      synced: false,
      reason: 'The PR head or base branch is unknown, so it cannot be synchronised automatically.',
      code: 'PR_BRANCH_UNKNOWN',
      failure: null,
    };
  }
  if (state.syncAttempts >= MAX_BRANCH_SYNCS) {
    return {
      attempted: false,
      synced: false,
      reason: `Branch synchronisation was already attempted ${state.syncAttempts} time(s); no further automatic merge will be tried.`,
      code: 'BRANCH_SYNC_BUDGET_EXHAUSTED',
      failure: null,
    };
  }
  const key = `${pr.number}:${pr.headRef}:${pr.baseRef}:${pr.headSha || ''}:${pr.baseSha || ''}`;
  if (state.syncedHeads.includes(key)) {
    return {
      attempted: false,
      synced: false,
      reason: 'This exact PR head was already synchronised with its base in an earlier pass.',
      code: 'BRANCH_SYNC_ALREADY_ATTEMPTED',
      failure: null,
    };
  }

  state.syncAttempts += 1;
  state.syncedHeads = [...state.syncedHeads, key].slice(-20);
  try {
    const merged = await mergeBranchInto({
      repository,
      base: pr.headRef,
      head: pr.baseRef,
      commitMessage: `Merge ${pr.baseRef} into ${pr.headRef} to synchronise PR #${pr.number} with the current base.`,
    });
    await appendEvent({
      type: 'integration.branch_synced',
      message: `PR #${pr.number} branch ${pr.headRef} was synchronised with ${pr.baseRef}${
        merged.sha ? ` at ${merged.sha.slice(0, 7)}` : ''
      }. CI must run again on the new head.`,
      payload: {
        finalizationId: state.id,
        prNumber: pr.number,
        headRef: pr.headRef,
        baseRef: pr.baseRef,
        headSha: pr.headSha,
        mergeSha: merged.sha,
        syncAttempt: state.syncAttempts,
      },
      dedupeKey: `branch-synced:${pr.number}:${merged.sha || state.syncAttempts}`,
    }).catch(() => {});
    return {
      attempted: true,
      synced: true,
      reason: `PR #${pr.number} was synchronised with ${pr.baseRef}. Waiting for CI on the new head.`,
      code: null,
      failure: null,
    };
  } catch (error) {
    const failure = describeGitHubFailure(error);
    await appendEvent({
      type: 'integration.branch_sync_failed',
      level: 'warn',
      message: formatGitHubBlockReason(`Could not synchronise PR #${pr.number}`, failure),
      payload: {
        finalizationId: state.id,
        prNumber: pr.number,
        headRef: pr.headRef,
        baseRef: pr.baseRef,
        code: failure.code,
        endpoint: failure.endpoint,
        requiredPermission: failure.permission,
      },
      dedupeKey: `branch-sync-failed:${pr.number}:${failure.code}`,
    }).catch(() => {});
    return { attempted: true, synced: false, reason: failure.message, code: failure.code, failure };
  }
}

/**
 * Keep exactly one authoritative PR per task. An obsolete open PR is closed
 * only after its work is provably redundant (older attempt supersession or a
 * GitHub compare proving the authoritative head contains it). Anything
 * ambiguous blocks instead of merging or silently discarding work.
 */
async function reconcileAuthoritativePullRequests(input: {
  state: FinalizationState;
  prs: DevFinalizationPullRequest[];
  repository: string;
}): Promise<{
  authoritative: DevFinalizationPullRequest[];
  obsolete: DevFinalizationPullRequest[];
  blocked: { reason: string; code: string; failure: GitHubFailure | null } | null;
}> {
  const { state, prs, repository } = input;
  const byTask = new Map<string, DevFinalizationPullRequest[]>();
  for (const pr of prs) {
    const list = byTask.get(pr.taskId) || [];
    list.push(pr);
    byTask.set(pr.taskId, list);
  }

  const authoritative: DevFinalizationPullRequest[] = [];
  const obsolete: DevFinalizationPullRequest[] = [];

  for (const [taskId, taskPrs] of byTask) {
    const selection = selectAuthoritativePullRequest(taskPrs.map(deliveryRef));
    const chosen = selection.authoritative
      ? taskPrs.find((pr) => pr.url === selection.authoritative!.url) || null
      : null;
    if (!chosen) continue;
    authoritative.push({ ...chosen, superseded: false, supersededBy: null });

    for (const ref of selection.obsolete) {
      const pr = taskPrs.find((item) => item.url === ref.url);
      if (!pr) continue;
      let containsObsoleteHead: boolean | null = null;
      const isOpen = String(pr.state || '').toLowerCase() === 'open' && !pr.merged;
      if (isOpen && pr.headSha && chosen.headSha && pr.url !== chosen.url) {
        try {
          const range = await getCommitRange(repository, pr.headSha, chosen.headSha);
          containsObsoleteHead = range.behindBy === 0;
        } catch {
          containsObsoleteHead = null;
        }
      }
      const canRetire = canRetirePullRequest({
        obsolete: ref,
        authoritative: deliveryRef(chosen),
        containsObsoleteHead,
      });
      if (!canRetire) {
        return {
          authoritative,
          obsolete,
          blocked: {
            reason: `Task ${taskId} has more than one open PR and PR #${pr.number} cannot be proven redundant to the authoritative PR #${chosen.number}. No merge or close was attempted; an explicit review is required.`,
            code: 'AMBIGUOUS_DUPLICATE_PR',
            failure: null,
          },
        };
      }
      if (isOpen && pr.number) {
        try {
          await closePullRequest({
            repository,
            number: pr.number,
            comment: `Superseded by #${chosen.number}, which is the single authoritative PR for this task. Its work is preserved by the newer attempt; no commits were deleted.`,
          });
          await appendEvent({
            type: 'integration.superseded_pr_closed',
            message: `Obsolete PR #${pr.number} was closed after redundancy was proved; authoritative PR #${chosen.number} was kept.`,
            payload: {
              finalizationId: state.id,
              taskId,
              closedPr: pr.number,
              authoritativePr: chosen.number,
            },
            dedupeKey: `superseded-pr-closed:${taskId}:${pr.number}:${chosen.number}`,
          }).catch(() => {});
        } catch (error) {
          const failure = describeGitHubFailure(error);
          return {
            authoritative,
            obsolete,
            blocked: {
              reason: formatGitHubBlockReason(`Could not close obsolete PR #${pr.number}`, failure),
              code: failure.code,
              failure,
            },
          };
        }
      }
      obsolete.push({
        ...pr,
        superseded: true,
        supersededBy: chosen.url,
        reason: pr.merged ? 'ALREADY_MERGED' : 'SUPERSEDED_BY_AUTHORITATIVE_PR',
      });
    }
  }

  return { authoritative, obsolete, blocked: null };
}

async function advanceLocked(input: {
  trigger: string;
  force?: boolean;
}): Promise<DevFinalizationReport | null> {
  const [queue, tasks] = await Promise.all([getQueueSnapshot(), listFinalizationTasks(200)]);
  const drain = isQueueDrained(queue);
  let state = stateFromSetting(await getSetting<unknown>(STATE_KEY, null));
  const activeStages: DevFinalizationStage[] = ['collecting', 'integrating', 'verifying'];

  // A drained queue is no longer required before landing finished work. In a
  // batch, dependent tasks stay `queued` until their prerequisite is merged; if
  // landing waited for the whole queue to drain, the batch would deadlock.
  // What must be true is that no executor is actively running and the owner has
  // not paused execution. Finished PRs still need green CI for their exact head.
  const executionActive = queue.paused || queue.active > 0 || queue.activeTasks > 0;
  if (executionActive) {
    if (state && activeStages.includes(state.stage)) {
      state.stage = 'idle';
      state.blockedReason = queue.paused
        ? 'The queue is paused.'
        : `Execution is active: ${queue.activeTasks} task(s) in progress, ${queue.active} active attempt(s).`;
      state.failureStage = null;
      state.blockedCode = null;
      state.retryAt = null;
      state.lastTrigger = input.trigger;
      await saveState(state);
      await appendEvent({
        type: 'queue.refilled',
        level: 'info',
        message: 'Finalization paused because execution became active again.',
        payload: {
          reasons: drain.reasons,
          finalizationId: state.id,
          activeAttempts: queue.active,
          activeTasks: queue.activeTasks,
          paused: queue.paused,
        },
        dedupeKey: `queue-refilled:${state.id}:${Math.floor(Date.now() / 60_000)}`,
      }).catch(() => {});
    }
    return state ? reportFromState(state) : null;
  }

  const attemptsByTask = await listAttemptsForTasks(
    tasks.map((task) => task.id),
    10
  ).catch(() => new Map());
  const candidates = collectPrCandidates(tasks, attemptsByTask);
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
      type: drain.drained ? 'queue.drained' : 'queue.landing_ready',
      message: drain.drained
        ? `Queue drained: ${queue.queued} queued, ${queue.ready || 0} ready, ${queue.active} active attempt(s).`
        : `Execution idle; landing completed work while ${queue.queued} task(s) wait in the queue.`,
      payload: {
        finalizationId: state.id,
        queued: queue.queued,
        ready: queue.ready || 0,
        activeAttempts: queue.active,
        activeTasks: queue.activeTasks,
        activeBatches: queue.activeBatches || 0,
        reasons: drain.reasons,
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
      title: 'Pierrot Dev · landing started',
      lines: [
        drain.drained
          ? 'All queued work is complete. Final integration has started.'
          : 'Execution is idle. Completed work is landing in main while the queue continues.',
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
    empty.deliveryStage = null;
    empty.productionVerified = false;
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
    state.deliveryStage = 'collecting';
    const refreshedAll: DevFinalizationPullRequest[] = [];
    for (const candidate of candidates) {
      const existing = state.prs.find((pr) => pr.url === candidate.url);
      if (integrated.has(candidate.url)) {
        if (existing) {
          refreshedAll.push(existing);
          continue;
        }
        // The ledger remembers this PR but the bounded report no longer has
        // its row (for example after a restart). Re-read it from GitHub instead
        // of silently dropping the only evidence for the task.
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
        refreshedAll.push(pr);
        state.prs = refreshedAll;
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
      refreshedAll.push(pr);
    }

    const reconciled = await reconcileAuthoritativePullRequests({
      state,
      prs: refreshedAll,
      repository: candidates[0]?.task.repository || 'newlove',
    });
    state.prs = [...reconciled.authoritative, ...reconciled.obsolete];
    if (reconciled.blocked) {
      return reportFromState(
        await block(state, {
          stage: 'collecting',
          reason: reconciled.blocked.reason,
          code: reconciled.blocked.code,
          retryAt: reconciled.blocked.failure?.retryAt ?? null,
          level: reconciled.blocked.failure?.permissionDenied ? 'error' : 'warn',
        })
      );
    }

    const refreshed = reconciled.authoritative;
    for (const pr of refreshed) {
      if (!pr.integrated) continue;
      recordIntegrated(state, {
        key: pr.url,
        prNumber: pr.number,
        url: pr.url,
        sha: pr.integrationSha,
        headSha: pr.headSha,
        ciStatus: pr.ciStatus,
      });
    }
    if (refreshed.length === 0) {
      state.stage = 'completed';
      state.completedAt = nowIso();
      state.ciStatus = 'none';
      state.ciDetail = 'No pull requests needed integration.';
      state.deliveryStage = null;
      state.productionVerified = false;
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
    const unsafe = refreshed.find(
      (pr) => !pr.integrated && blockingLandingRisks(pr.risks || []).length > 0
    );
    if (unsafe) {
      return reportFromState(
        await block(state, {
          stage: 'collecting',
          reason: `PR #${unsafe.number} was stopped before landing: ${formatLandingRiskReason(
            blockingLandingRisks(unsafe.risks || [])
          )} No merge was attempted and no task was marked complete.`,
          code: 'SECURITY_SENSITIVE_CHANGE',
        })
      );
    }
    const conflict = refreshed.find(
      (pr) => !pr.integrated && pr.state === 'open' && pr.mergeable === false
    );
    if (conflict) {
      const sync = await synchronizePullRequestBranch({
        state,
        pr: conflict,
        repository: conflict.taskId
          ? candidates.find((candidate) => candidate.task.id === conflict.taskId)?.task
              .repository ||
            candidates[0]?.task.repository ||
            'newlove'
          : 'newlove',
      });
      if (sync.synced) {
        state.waitingSince = null;
        state.deliveryStage = 'checks_pending';
        await saveState(state);
        return reportFromState(state);
      }
      return reportFromState(
        await block(state, {
          stage: 'collecting',
          reason:
            sync.failure && sync.code
              ? formatGitHubBlockReason(
                  `PR #${conflict.number} could not be synchronised with ${conflict.baseRef || DEFAULT_BRANCH}`,
                  sync.failure
                )
              : `PR #${conflict.number} has a merge conflict (${conflict.mergeableState || 'dirty'}). ${sync.reason} No merge was attempted.`,
          code: sync.code || 'MERGE_CONFLICT',
          retryAt: sync.failure?.retryAt ?? null,
          level: sync.failure?.permissionDenied ? 'error' : 'warn',
        })
      );
    }

    // The PR head must actually contain the newest completed attempt. A retry
    // whose update failed (for example a branch conflict) would otherwise let
    // the finalizer merge an older PR and silently lose the retry's work.
    for (const pr of refreshed) {
      if (pr.integrated || !pr.headSha) continue;
      const latest = (attemptsByTask.get(pr.taskId) || []).find(
        (attempt: { status?: string; headSha?: string | null }) =>
          attempt.status === 'completed' && attempt.headSha
      );
      if (!latest?.headSha || latest.headSha.toLowerCase() === pr.headSha.toLowerCase()) continue;
      const repository =
        candidates.find((candidate) => candidate.task.id === pr.taskId)?.task.repository ||
        candidates[0]?.task.repository ||
        'newlove';
      let containsLatest = false;
      try {
        const range = await getCommitRange(repository, latest.headSha, pr.headSha);
        containsLatest = range.behindBy === 0;
      } catch {
        containsLatest = false;
      }
      if (!containsLatest) {
        return reportFromState(
          await block(state, {
            stage: 'collecting',
            reason: `PR #${pr.number} head ${pr.headSha.slice(
              0,
              7
            )} does not contain the newest completed attempt ${latest.headSha.slice(
              0,
              7
            )}. The retry update did not reach the authoritative PR, so no merge was attempted and the attempt work is preserved.`,
            code: 'PR_DOES_NOT_CONTAIN_LATEST_ATTEMPT',
          })
        );
      }
    }
    state.stage = 'integrating';
    state.deliveryStage = 'merge_pending';
    state.waitingSince = null;
    await saveState(state);
  }

  if (state.stage === 'integrating') {
    const open = state.prs.filter((pr) => !pr.integrated && !pr.superseded);
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
          const sync = await synchronizePullRequestBranch({
            state,
            pr: notMergeable,
            repository:
              tasks.find((task) => task.id === notMergeable.taskId)?.repository ||
              tasks[0]?.repository ||
              'newlove',
          });
          if (sync.synced) {
            state.waitingSince = null;
            state.deliveryStage = 'checks_pending';
            await saveState(state);
            return reportFromState(state);
          }
          return reportFromState(
            await block(state, {
              stage: 'integrating',
              reason:
                sync.failure && sync.code
                  ? formatGitHubBlockReason(
                      `PR #${notMergeable.number} could not be synchronised with ${
                        notMergeable.baseRef || DEFAULT_BRANCH
                      }`,
                      sync.failure
                    )
                  : `PR #${notMergeable.number} is not mergeable (${notMergeable.mergeableState || 'dirty'}). ${sync.reason} No merge was attempted.`,
              code: sync.code || 'MERGE_CONFLICT',
              retryAt: sync.failure?.retryAt ?? null,
              level: sync.failure?.permissionDenied ? 'error' : 'warn',
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
          headSha: refreshed.headSha,
          ciStatus: refreshed.ciStatus,
        });
        if (current >= 0) {
          state.prs[current] = {
            ...refreshed,
            integrated: true,
            integrationSha: refreshed.integrationSha || refreshed.headSha,
            mergeSha: refreshed.mergeSha || refreshed.integrationSha,
            state: 'merged',
            merged: true,
          };
        }
        // Do not verify yet: main CI and production are checked in the
        // verifying stage. The merge itself is recorded exactly once.
        state.deliveryStage = 'checks_pending';
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
      const blockingRisks = blockingLandingRisks(refreshed.risks || []);
      if (blockingRisks.length > 0) {
        return reportFromState(
          await block(state, {
            stage: 'integrating',
            reason: `PR #${refreshed.number} was stopped before landing: ${formatLandingRiskReason(
              blockingRisks
            )} No merge was attempted and no task was marked complete.`,
            code: 'SECURITY_SENSITIVE_CHANGE',
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
          headSha: expectedHead,
          ciStatus: refreshed.ciStatus,
        });
        if (current >= 0) {
          state.prs[current] = {
            ...refreshed,
            integrated: true,
            integrationSha: sha,
            mergeSha: sha,
            state: 'merged',
            merged: true,
            reason: 'ALREADY_MERGED',
            errorCode: null,
            errorDetail: null,
          };
        }
        const attemptId =
          state.integrated.find((item) => item.key === refreshed.url)?.attemptId || null;
        await appendEvent({
          type: 'integration.completed',
          message: `PR #${refreshed.number} integrated into ${DEFAULT_BRANCH} at ${sha.slice(0, 7)}.`,
          payload: {
            finalizationId: state.id,
            prNumber: refreshed.number,
            url: refreshed.url,
            headSha: expectedHead,
            mergeSha: sha,
            sha,
            ciStatus: refreshed.ciStatus,
            checks: refreshed.checks,
            attemptId,
            risks: refreshed.risks || [],
          },
          dedupeKey: `integration-completed:${refreshed.number}:${sha}`,
        }).catch(() => {});
        await appendEvent({
          type: 'push.completed',
          message: `Commit ${sha.slice(0, 7)} is on ${DEFAULT_BRANCH} via PR #${refreshed.number}.`,
          payload: {
            finalizationId: state.id,
            sha,
            headSha: expectedHead,
            prNumber: refreshed.number,
            attemptId,
          },
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
        state.deliveryStage = 'checks_pending';
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
    const previousCiStatus = state.ciStatus;
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
    // Main CI is settled; start one fresh bounded window for production.
    if (previousCiStatus !== 'passed') state.waitingSince = nowIso();

    // A merged PR is not delivered until the exact landed commit is observed
    // live in production. Deployment is read-only; this process never deploys.
    const landedShas = [
      mainSha,
      ...state.integrated.map((item) => item.sha),
      ...state.prs.map((pr) => pr.mergeSha || pr.integrationSha),
    ].filter((sha): sha is string => typeof sha === 'string' && sha.length > 0);
    let deployment: DevDeploymentStatus | null = null;
    try {
      deployment = await getLatestProductionDeployment(repository);
    } catch (error) {
      const failure = describeGitHubFailure(error);
      return reportFromState(
        await block(state, {
          stage: 'verifying',
          reason: `Could not read the production deployment: ${failure.message}. A merged PR is not marked verified without deployment evidence.`,
          code: 'PRODUCTION_VERIFICATION_UNAVAILABLE',
        })
      );
    }
    state.deployment = deployment;
    const production = verifyProductionDeployment({ deployment, landedShas });
    state.productionVerified = production.status === 'verified';
    if (production.status === 'pending') {
      state.deliveryStage = 'deployment_pending';
      state.waitingSince = state.waitingSince || nowIso();
      if (Date.now() - new Date(state.waitingSince).getTime() > ciTimeoutMs()) {
        return reportFromState(
          await fail(state, {
            stage: 'verifying',
            reason: `Production did not serve the landed commit within the finalization timeout. ${production.reason}`,
          })
        );
      }
      await saveState(state);
      return reportFromState(state);
    }
    if (production.status === 'failed') {
      return reportFromState(
        await fail(state, {
          stage: 'verifying',
          reason: `Production deployment failed: ${production.reason}`,
        })
      );
    }
    if (production.status !== 'verified') {
      return reportFromState(
        await block(state, {
          stage: 'verifying',
          reason: `Production verification is ${production.status}: ${production.reason} Required: read the production deployment (VERCEL_TOKEN plus VERCEL_PROJECT_ID when auto-detection fails) and confirm the exact landed commit is ready. No task was marked verified.`,
          code: 'PRODUCTION_VERIFICATION_UNAVAILABLE',
        })
      );
    }
    state.deliveryStage = 'production_verified';

    // Only now, with merged PR + green main CI + verified production, mark the
    // integrated tasks verified. Every task keeps its exact PR/head/merge SHA.
    for (const record of state.integrated) {
      const pr = state.prs.find((item) => item.url === record.key);
      const attemptId = await verifyTaskIntegrated({
        taskId: pr?.taskId || '',
        sha: record.sha,
        prUrl: record.url,
        state,
        headSha: record.headSha || pr?.headSha || null,
        ciStatus: pr?.ciStatus || 'passed',
        mergeSha: record.sha,
        checks: pr?.checks || [],
      });
      if (record && attemptId) record.attemptId = attemptId;
    }

    state.stage = 'completed';
    state.completedAt = nowIso();
    state.cost = await finalizationCost([...new Set(state.prs.map((pr) => pr.taskId))]);
    state.batchId =
      state.batchId || (await getBatchIdForTask(state.prs[0]?.taskId || '').catch(() => null));
    if (state.batchId) await maybeCompleteBatch(state.batchId).catch(() => false);
    await saveState(state);
    await appendEvent({
      type: 'production.verified',
      message: `Production is ${deployment?.state || 'unknown'} at ${
        deployment?.commitSha?.slice(0, 7) || 'unknown'
      }, matching the landed ${DEFAULT_BRANCH} commit ${mainSha.slice(0, 7)}.`,
      payload: {
        finalizationId: state.id,
        deployment,
        mainSha,
        integrated: state.integrated.length,
      },
      dedupeKey: `production-verified:${state.id}:${deployment?.commitSha || mainSha}`,
    }).catch(() => {});
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
    const report = await advanceLocked(input);
    // Only dispatch after a pass that actually landed something. This releases
    // dependents whose prerequisite is now verified; the dispatcher refuses a
    // paused queue, an active attempt and a duplicate reservation.
    if (report && report.integrated > 0) {
      await dispatchAfterLanding(`finalization:${input.trigger}`);
    }
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 800) : 'Finalization failed.';
    const state = stateFromSetting(await getSetting<unknown>(STATE_KEY, null));
    if (state) {
      return reportFromState(await fail(state, { stage: state.stage, reason: message }));
    }
    return null;
  }
}

/**
 * Kick the existing dispatcher after a landing so a dependent batch task whose
 * prerequisite just became `verified` can be claimed without waiting for the
 * next Admin poll. The dispatcher keeps its own dedupe and active-attempt guard;
 * a failure here never turns a successful merge into a failed landing.
 */
async function dispatchAfterLanding(source: string): Promise<void> {
  try {
    const { dispatchNextQueuedTask } = await import('./actions');
    await dispatchNextQueuedTask({ source });
  } catch {
    // The queue will be recovered by the next Admin poll or scheduler tick.
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
    state.syncAttempts = 0;
    state.productionVerified = false;
    state.deliveryStage = 'collecting';
    await saveState(state);
  }
  return advanceFinalization({ trigger, force: true });
}

export async function finalizationNeedsAttention(): Promise<boolean> {
  const report = await getFinalizationReport();
  return Boolean(report && (report.stage === 'blocked' || report.stage === 'failed'));
}
