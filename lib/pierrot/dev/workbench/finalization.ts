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
  await setSetting(STATE_KEY, state);
}

function integratedKeys(state: FinalizationState | null): Set<string> {
  return new Set((state?.integrated || []).map((item) => item.key).filter(Boolean));
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
    await patchTask(task.id, {
      status: 'verified',
      verification_status: 'integrated',
      verification_notes: `Integrated into ${DEFAULT_BRANCH} by queue finalization (${input.prUrl}).`,
      verified_at: nowIso(),
      result_commit: input.sha || task.resultCommit,
    }).catch(() => null);
  }
  const batchId = await getBatchIdForTask(task.id).catch(() => null);
  if (batchId) await maybeCompleteBatch(batchId).catch(() => false);
}

async function block(
  state: FinalizationState,
  input: { stage: DevFinalizationStage; reason: string; level?: 'error' | 'warn' }
): Promise<FinalizationState> {
  state.stage = 'blocked';
  state.failureStage = input.stage;
  state.blockedReason = text(input.reason, 2000) || 'Finalization was blocked.';
  await saveState(state);

  await appendEvent({
    type: 'integration.blocked',
    level: input.level || 'warn',
    message: state.blockedReason,
    payload: {
      finalizationId: state.id,
      stage: input.stage,
      prs: state.prs.map((pr) => ({
        number: pr.number,
        url: pr.url,
        state: pr.state,
        mergeable: pr.mergeable,
        ciStatus: pr.ciStatus,
      })),
    },
    dedupeKey: `integration-blocked:${state.id}:${input.stage}`,
  }).catch(() => {});
  await appendEvent({
    type: 'batch.finalization.failed',
    level: 'error',
    message: `Finalization blocked at ${input.stage}: ${state.blockedReason}`,
    payload: { finalizationId: state.id, failureStage: input.stage },
    dedupeKey: `batch-finalization-failed:${state.id}`,
  }).catch(() => {});

  await notifyDevOwner({
    eventKey: `finalization-blocked:${state.id}`,
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
  input: { stage: DevFinalizationStage; reason: string }
): Promise<FinalizationState> {
  state.stage = 'failed';
  state.failureStage = input.stage;
  state.blockedReason = text(input.reason, 2000) || 'Finalization failed.';
  await saveState(state);
  await appendEvent({
    type: 'batch.finalization.failed',
    level: 'error',
    message: state.blockedReason,
    payload: { finalizationId: state.id, failureStage: input.stage },
    dedupeKey: `batch-finalization-failed:${state.id}`,
  }).catch(() => {});
  await notifyDevOwner({
    eventKey: `finalization-failed:${state.id}`,
    title: 'Pierrot Dev · finalization failed',
    lines: [state.blockedReason, `Stage: ${input.stage}`],
  }).catch(() => {});
  return state;
}

async function refreshPullRequest(input: {
  task: DevWorkbenchTask;
  url: string;
  number: number | null;
}): Promise<DevFinalizationPullRequest> {
  const base: DevFinalizationPullRequest = {
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
  };
  if (!input.number) {
    return {
      ...base,
      state: 'invalid',
      ciStatus: 'unknown',
      ciDetail: 'The task stores a PR URL without a pull request number.',
      reason: 'INVALID_PR_URL',
    };
  }
  const status = await getPullRequestStatus(input.task.repository, input.number);
  if (!status) {
    return {
      ...base,
      ciStatus: 'unknown',
      ciDetail: 'GitHub did not return the pull request status.',
      reason: 'PR_STATUS_UNAVAILABLE',
    };
  }
  const checks = status.merged
    ? { status: 'passed' as const, detail: 'Already merged.', checks: [] }
    : await getCommitChecks(input.task.repository, status.headSha);
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
    reason: status.merged ? null : checks.status === 'failed' ? 'CI_FAILED' : null,
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
    await saveState(state);
    return reportFromState(state);
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
      const pr = await refreshPullRequest(candidate);
      refreshed.push(pr);
      if (pr.integrated) {
        state.integrated.push({
          key: pr.url,
          prNumber: pr.number,
          url: pr.url,
          sha: pr.integrationSha,
          at: nowIso(),
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
      const refreshed = await refreshPullRequest({
        task: mergeTask,
        url: mergeable.url,
        number: mergeable.number,
      });
      const current = state.prs.findIndex((pr) => pr.url === mergeable.url);
      if (current >= 0) state.prs[current] = { ...refreshed, integrated: false };
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
        state.integrated.push({
          key: refreshed.url,
          prNumber: refreshed.number,
          url: refreshed.url,
          sha,
          at: nowIso(),
        });
        if (current >= 0) {
          state.prs[current] = {
            ...refreshed,
            integrated: true,
            integrationSha: sha,
            state: 'merged',
            merged: true,
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
        const message = error instanceof Error ? error.message : 'The GitHub merge request failed.';
        return reportFromState(
          await block(state, {
            stage: 'integrating',
            reason: `PR #${refreshed.number} could not be merged: ${text(message, 800)}. No force push or branch-protection bypass was attempted.`,
          })
        );
      }
    }
  }

  if (state.stage === 'verifying') {
    const repository = tasks[0]?.repository || 'newlove';
    const mainSha = await getBranchHead(repository, DEFAULT_BRANCH);
    state.mainSha = mainSha;
    state.commitUrl = mainSha ? commitUrl(repository, mainSha) : null;
    if (!mainSha) {
      return reportFromState(
        await fail(state, {
          stage: 'verifying',
          reason: `Could not read the ${DEFAULT_BRANCH} head after integration.`,
        })
      );
    }
    const checks = ciFromChecks(await getCommitChecks(repository, mainSha));
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
