/** @jest-environment node */

jest.mock('../store', () => {
  const settings = new Map<string, unknown>();
  return {
    __settings: settings,
    isWorkbenchSchemaReady: jest.fn(async () => true),
    tryAcquireFinalizationLock: jest.fn(async () => true),
    getQueueSnapshot: jest.fn(),
    listFinalizationTasks: jest.fn(async () => []),
    getSetting: jest.fn(async (key: string, fallback: unknown) =>
      settings.has(key) ? settings.get(key) : fallback
    ),
    setSetting: jest.fn(async (key: string, value: unknown) => {
      settings.set(key, value);
    }),
    appendEvent: jest.fn(async () => undefined),
    patchTask: jest.fn(async () => null),
    getBatchIdForTask: jest.fn(async () => null),
    maybeCompleteBatch: jest.fn(async () => false),
    listAttemptsForTasks: jest.fn(async () => new Map()),
  };
});

jest.mock('../github', () => {
  class WorkbenchGitHubError extends Error {
    code: string;
    status: number | null;
    endpoint: string | null;
    requiredPermission: string | null;
    retryAt: string | null;
    retryAfterMs: number | null;
    resetAt: string | null;
    rateLimited: boolean;
    permissionDenied: boolean;
    constructor(
      code: string,
      message: string,
      status: number | null = null,
      details: {
        endpoint?: string | null;
        requiredPermission?: string | null;
        retryAt?: string | null;
        retryAfterMs?: number | null;
        resetAt?: string | null;
        rateLimited?: boolean;
        permissionDenied?: boolean;
      } = {}
    ) {
      super(message);
      this.code = code;
      this.status = status;
      this.endpoint = details.endpoint ?? null;
      this.requiredPermission = details.requiredPermission ?? null;
      this.retryAt = details.retryAt ?? null;
      this.retryAfterMs = details.retryAfterMs ?? null;
      this.resetAt = details.resetAt ?? null;
      this.rateLimited = details.rateLimited ?? code === 'GITHUB_RATE_LIMITED';
      this.permissionDenied =
        details.permissionDenied ??
        (code === 'GITHUB_PERMISSION_DENIED' || code === 'GITHUB_AUTH_FAILED');
    }
  }
  return {
    getPullRequestStatus: jest.fn(),
    getCommitChecks: jest.fn(),
    getBranchHead: jest.fn(),
    mergeVerifiedPullRequest: jest.fn(),
    commitUrl: jest.fn(
      (_repository: string, sha: string) => `https://github.com/merkurov1/newlove/commit/${sha}`
    ),
    WorkbenchGitHubError,
  };
});

jest.mock('../costs', () => ({
  readAttemptCost: jest.fn(() => null),
  summarizeCosts: jest.fn(() => ({
    modelUsd: 1,
    codespaceEstimatedUsd: 1,
    totalUsd: 2,
    inputTokens: 10,
    outputTokens: 10,
    reasoningTokens: null,
    attemptsWithCost: 1,
    attemptsMissingCost: 0,
    unknown: [],
    provenance: 'test',
  })),
}));

jest.mock('../notifications', () => ({
  notifyDevOwner: jest.fn(async () => true),
}));

import * as store from '../store';
import * as github from '../github';
import * as notifications from '../notifications';
import {
  advanceFinalization,
  chooseMergeCandidate,
  collectPrCandidates,
  isQueueDrained,
  parsePullRequestNumber,
  retryFinalization,
} from '../finalization';
import type { DevFinalizationPullRequest, DevWorkbenchTask } from '../types';

const settings = (store as unknown as { __settings: Map<string, unknown> }).__settings;

const DRAINED = {
  queued: 0,
  ready: 0,
  active: 0,
  activeTasks: 0,
  review: 1,
  activeBatches: 0,
  paused: false,
  depthByPriority: [],
};

const PR_HEAD = 'a'.repeat(40);
const MERGE_SHA = 'b'.repeat(40);
const MAIN_SHA = 'c'.repeat(40);

function task(overrides: Partial<DevWorkbenchTask> = {}): DevWorkbenchTask {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Task A',
    objective: 'Do the thing.',
    repository: 'merkurov1/newlove',
    baseRef: 'main',
    status: 'review',
    priority: 0,
    queuePosition: null,
    queuedAt: null,
    attemptCount: 1,
    acceptanceCriteria: ['tests'],
    verificationStatus: null,
    blockedReason: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    resultCommit: PR_HEAD,
    resultNotes: 'done',
    pullRequests: ['https://github.com/merkurov1/newlove/pull/1'],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  } as DevWorkbenchTask;
}

function prStatus(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    url: 'https://github.com/merkurov1/newlove/pull/1',
    state: 'open',
    merged: false,
    mergeable: true,
    mergeableState: 'clean',
    headSha: PR_HEAD,
    baseBranch: 'main',
    ...overrides,
  };
}

function checks(status: 'passed' | 'failed' | 'pending' | 'none' | 'unknown') {
  return {
    status,
    detail: `CI ${status}`,
    checks:
      status === 'none'
        ? []
        : [{ name: 'verify', status: 'completed', conclusion: 'success', url: null }],
  };
}

const asMock = (value: unknown) => value as jest.Mock;

beforeEach(() => {
  settings.clear();
  jest.clearAllMocks();
  asMock(store.isWorkbenchSchemaReady).mockResolvedValue(true);
  asMock(store.tryAcquireFinalizationLock).mockResolvedValue(true);
  asMock(store.getQueueSnapshot).mockResolvedValue(DRAINED);
  asMock(store.listFinalizationTasks).mockResolvedValue([]);
  asMock(store.listAttemptsForTasks).mockResolvedValue(new Map());
  asMock(store.patchTask).mockResolvedValue(null);
  asMock(store.getBatchIdForTask).mockResolvedValue(null);
  asMock(github.getBranchHead).mockResolvedValue(MAIN_SHA);
  asMock(github.getCommitChecks).mockResolvedValue(checks('passed'));
  asMock(github.mergeVerifiedPullRequest).mockResolvedValue({
    merged: true,
    sha: MERGE_SHA,
    message: '',
  });
  asMock(notifications.notifyDevOwner).mockResolvedValue(true);
});

describe('finalization decisions', () => {
  it('requires an empty executable queue and no active batches', () => {
    expect(isQueueDrained(DRAINED).drained).toBe(true);
    expect(isQueueDrained({ ...DRAINED, queued: 1 }).drained).toBe(false);
    expect(isQueueDrained({ ...DRAINED, ready: 1 }).drained).toBe(false);
    expect(isQueueDrained({ ...DRAINED, activeTasks: 1 }).drained).toBe(false);
    expect(isQueueDrained({ ...DRAINED, active: 1 }).drained).toBe(false);
    expect(isQueueDrained({ ...DRAINED, activeBatches: 1 }).drained).toBe(false);
    expect(isQueueDrained({ ...DRAINED, paused: true }).drained).toBe(false);
  });

  it('parses PR numbers and deduplicates candidates', () => {
    expect(parsePullRequestNumber('https://github.com/o/r/pull/42')).toBe(42);
    expect(parsePullRequestNumber('https://github.com/o/r/pull/not-a-number')).toBeNull();
    const candidates = collectPrCandidates([
      task(),
      task({ id: 'other', pullRequests: ['https://github.com/merkurov1/newlove/pull/1'] }),
    ]);
    expect(candidates).toHaveLength(1);
  });

  it('only chooses an open, mergeable PR with passing CI', () => {
    const base = {
      taskId: 't',
      taskTitle: 'T',
      number: 1,
      url: 'u',
      state: 'open',
      merged: false,
      mergeable: true,
      mergeableState: 'clean',
      headSha: PR_HEAD,
      ciStatus: 'passed' as const,
      ciDetail: '',
      checks: [],
      integrated: false,
      integrationSha: null,
      reason: null,
    } satisfies DevFinalizationPullRequest;
    expect(chooseMergeCandidate([base])).toBe(base);
    expect(chooseMergeCandidate([{ ...base, ciStatus: 'pending' }])).toBeNull();
    expect(chooseMergeCandidate([{ ...base, mergeable: false }])).toBeNull();
    expect(chooseMergeCandidate([{ ...base, integrated: true }])).toBeNull();
  });
});

describe('queue finalization', () => {
  it('integrates a green PR, verifies main, and is idempotent', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    asMock(github.getPullRequestStatus).mockResolvedValue(prStatus());
    asMock(github.getCommitChecks).mockResolvedValue(checks('passed'));

    const first = await advanceFinalization({ trigger: 'test' });
    expect(first).toMatchObject({
      stage: 'integrating',
      integrated: 1,
      pullRequests: 1,
    });
    expect(first?.prs[0]).toMatchObject({ integrated: true, ciStatus: 'passed' });
    expect(github.mergeVerifiedPullRequest).toHaveBeenCalledTimes(1);
    expect(github.mergeVerifiedPullRequest).toHaveBeenCalledWith({
      repository: 'merkurov1/newlove',
      number: 1,
      expectedHeadSha: PR_HEAD,
    });
    // Integration alone is not verification. Without a structured report the
    // task must stay in review instead of silently becoming verified.
    expect(store.patchTask).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ status: 'review', verification_status: 'integration_only' })
    );

    const second = await advanceFinalization({ trigger: 'test' });
    expect(second).toMatchObject({
      stage: 'completed',
      integrated: 1,
      commitSha: MAIN_SHA,
      ciStatus: 'passed',
    });
    expect(github.mergeVerifiedPullRequest).toHaveBeenCalledTimes(1);

    const third = await advanceFinalization({ trigger: 'test' });
    expect(third).toMatchObject({ stage: 'completed', integrated: 1 });
    expect(github.mergeVerifiedPullRequest).toHaveBeenCalledTimes(1);

    const events = asMock(store.appendEvent).mock.calls.map(([event]) => event.type);
    expect(events).toContain('queue.drained');
    expect(events).toContain('batch.finalization.started');
    expect(events).toContain('integration.completed');
    expect(events).toContain('push.completed');
    expect(events).toContain('batch.finalization.completed');
  });

  it('blocks on a merge conflict without attempting a merge', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    asMock(github.getPullRequestStatus).mockResolvedValue(
      prStatus({ mergeable: false, mergeableState: 'dirty' })
    );
    asMock(github.getCommitChecks).mockResolvedValue(checks('passed'));

    const report = await advanceFinalization({ trigger: 'test' });
    expect(report).toMatchObject({ stage: 'blocked', failureStage: 'collecting' });
    expect(report?.blockedReason).toMatch(/conflict/i);
    expect(github.mergeVerifiedPullRequest).not.toHaveBeenCalled();

    const events = asMock(store.appendEvent).mock.calls.map(([event]) => event.type);
    expect(events).toContain('integration.blocked');
    expect(events).toContain('batch.finalization.failed');
    expect(notifications.notifyDevOwner).toHaveBeenCalled();
  });

  it('waits for pending CI and does not merge early', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    asMock(github.getPullRequestStatus).mockResolvedValue(prStatus());
    asMock(github.getCommitChecks).mockResolvedValue(checks('pending'));

    const report = await advanceFinalization({ trigger: 'test' });
    expect(report?.stage).toBe('integrating');
    expect(github.mergeVerifiedPullRequest).not.toHaveBeenCalled();

    const mainChecksCalls = asMock(github.getCommitChecks).mock.calls.filter(
      ([, ref]) => ref === MAIN_SHA
    );
    expect(mainChecksCalls).toHaveLength(0);
  });

  it('stops finalization when executable work arrives', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    asMock(github.getPullRequestStatus).mockResolvedValue(prStatus());
    asMock(github.getCommitChecks).mockResolvedValue(checks('passed'));
    await advanceFinalization({ trigger: 'test' });

    asMock(store.getQueueSnapshot).mockResolvedValue({ ...DRAINED, queued: 1 });
    const report = await advanceFinalization({ trigger: 'test' });
    expect(report?.stage).toBe('idle');
    expect(report?.blockedReason).toMatch(/Queue refilled/i);
    const events = asMock(store.appendEvent).mock.calls.map(([event]) => event.type);
    expect(events).toContain('queue.refilled');
  });

  it('records a drained queue with nothing to integrate', async () => {
    const report = await advanceFinalization({ trigger: 'test' });
    expect(report).toMatchObject({
      stage: 'completed',
      pullRequests: 0,
      integrated: 0,
      ciStatus: 'none',
    });
    const events = asMock(store.appendEvent).mock.calls.map(([event]) => event.type);
    expect(events).toContain('queue.drained');
  });

  it('names the missing permission and endpoint for a 403 and does not retry automatically', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    asMock(github.getPullRequestStatus).mockRejectedValue(
      new github.WorkbenchGitHubError(
        'GITHUB_PERMISSION_DENIED',
        'GitHub denied GET /repos/{owner}/{repo}/pulls/{pull_number} (403). Required permission: pull_requests=read.',
        403,
        {
          endpoint: 'GET /repos/{owner}/{repo}/pulls/{pull_number}',
          requiredPermission: 'pull_requests=read',
        }
      )
    );

    const report = await advanceFinalization({ trigger: 'test' });
    expect(report).toMatchObject({
      stage: 'blocked',
      failureStage: 'collecting',
      blockedCode: 'GITHUB_PERMISSION_DENIED',
      retryAt: null,
    });
    expect(report?.blockedReason).toContain('GET /repos/{owner}/{repo}/pulls/{pull_number}');
    expect(report?.blockedReason).toContain('pull_requests=read');
    expect(report?.blockedReason).toMatch(/Automatic retry is disabled/i);
    expect(github.mergeVerifiedPullRequest).not.toHaveBeenCalled();

    const second = await advanceFinalization({ trigger: 'test' });
    expect(second?.stage).toBe('blocked');
    expect(github.getPullRequestStatus).toHaveBeenCalledTimes(1);
  });

  it('honours the rate-limit retry time before resuming the same finalization', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    const retryAt = new Date(Date.now() - 1_000).toISOString();
    asMock(github.getPullRequestStatus)
      .mockRejectedValueOnce(
        new github.WorkbenchGitHubError(
          'GITHUB_RATE_LIMITED',
          `GitHub rate limit reached for GET /repos/{owner}/{repo}/pulls/{pull_number} (403). Retry after ${retryAt}.`,
          403,
          {
            endpoint: 'GET /repos/{owner}/{repo}/pulls/{pull_number}',
            requiredPermission: 'Pull requests: read',
            retryAt,
            rateLimited: true,
          }
        )
      )
      .mockResolvedValue(prStatus());
    asMock(github.getCommitChecks).mockResolvedValue(checks('passed'));

    const blocked = await advanceFinalization({ trigger: 'test' });
    expect(blocked).toMatchObject({
      stage: 'blocked',
      blockedCode: 'GITHUB_RATE_LIMITED',
      retryAt,
    });
    expect(blocked?.blockedReason).toContain('Rate-limit retries are bounded');
    expect(github.mergeVerifiedPullRequest).not.toHaveBeenCalled();

    const resumed = await advanceFinalization({ trigger: 'test' });
    expect(resumed?.stage).toBe('integrating');
    expect(resumed?.integrated).toBe(1);
    expect(github.mergeVerifiedPullRequest).toHaveBeenCalledTimes(1);
  });

  it('waits until a future rate-limit reset before calling GitHub again', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    const retryAt = new Date(Date.now() + 60_000).toISOString();
    asMock(github.getPullRequestStatus).mockRejectedValue(
      new github.WorkbenchGitHubError(
        'GITHUB_RATE_LIMITED',
        'GitHub rate limit reached.',
        403,
        { retryAt, rateLimited: true }
      )
    );

    const report = await advanceFinalization({ trigger: 'test' });
    expect(report).toMatchObject({ stage: 'blocked', retryAt });
    await advanceFinalization({ trigger: 'test' });
    expect(github.getPullRequestStatus).toHaveBeenCalledTimes(1);
  });

  it('recognises an already merged PR without merging it again', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    asMock(github.getPullRequestStatus).mockResolvedValue(
      prStatus({ state: 'closed', merged: true })
    );

    const report = await advanceFinalization({ trigger: 'test' });
    expect(report).toMatchObject({
      stage: 'completed',
      integrated: 1,
      commitSha: MAIN_SHA,
    });
    expect(report?.prs[0]).toMatchObject({
      state: 'merged',
      merged: true,
      integrated: true,
      integrationSha: PR_HEAD,
      reason: 'ALREADY_MERGED',
    });
    expect(github.mergeVerifiedPullRequest).not.toHaveBeenCalled();

    const again = await advanceFinalization({ trigger: 'test' });
    expect(again?.integrated).toBe(1);
    expect(github.mergeVerifiedPullRequest).not.toHaveBeenCalled();
  });

  it('continues a permission-blocked finalization after an explicit retry and token fix', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    asMock(github.getPullRequestStatus)
      .mockRejectedValueOnce(
        new github.WorkbenchGitHubError(
          'GITHUB_PERMISSION_DENIED',
          'GitHub denied GET /repos/{owner}/{repo}/pulls/{pull_number} (403). Required permission: pull_requests=read.',
          403,
          {
            endpoint: 'GET /repos/{owner}/{repo}/pulls/{pull_number}',
            requiredPermission: 'pull_requests=read',
          }
        )
      )
      .mockResolvedValue(prStatus());
    asMock(github.getCommitChecks).mockResolvedValue(checks('passed'));

    const blocked = await advanceFinalization({ trigger: 'test' });
    expect(blocked).toMatchObject({
      stage: 'blocked',
      blockedCode: 'GITHUB_PERMISSION_DENIED',
    });

    const resumed = await retryFinalization('test:retry');
    expect(resumed).toMatchObject({ stage: 'integrating', integrated: 1 });
    expect(github.mergeVerifiedPullRequest).toHaveBeenCalledTimes(1);
  });

  it('retries a failed merge once the owner clears the block without duplicating integration', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    asMock(github.getPullRequestStatus).mockResolvedValue(prStatus());
    asMock(github.getCommitChecks).mockResolvedValue(checks('passed'));
    asMock(github.mergeVerifiedPullRequest)
      .mockRejectedValueOnce(new Error('temporary GitHub gateway failure'))
      .mockResolvedValue({ merged: true, sha: MERGE_SHA, message: '' });

    const failed = await advanceFinalization({ trigger: 'test' });
    expect(failed).toMatchObject({ stage: 'blocked', failureStage: 'integrating' });
    expect(failed?.integrated).toBe(0);

    const retried = await retryFinalization('test:retry');
    expect(retried).toMatchObject({ stage: 'integrating', integrated: 1 });
    expect(github.mergeVerifiedPullRequest).toHaveBeenCalledTimes(2);

    const settled = await advanceFinalization({ trigger: 'test' });
    expect(settled).toMatchObject({ stage: 'completed', integrated: 1 });
    expect(github.mergeVerifiedPullRequest).toHaveBeenCalledTimes(2);
  });

  it('verifies only when the attempt has a structured report and satisfied criteria', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    asMock(github.getPullRequestStatus).mockResolvedValue(prStatus());
    asMock(github.getCommitChecks).mockResolvedValue(checks('passed'));
    asMock(store.listAttemptsForTasks).mockResolvedValue(
      new Map([
        [
          '11111111-1111-4111-8111-111111111111',
          [
            {
              id: 'attempt-structured',
              status: 'completed',
              warnings: [],
              commands: [{ name: 'pnpm test', status: 'passed', detail: 'exit 0' }],
              verification: {
                criteria: [
                  { criterion: 'tests', status: 'satisfied', evidence: 'jest passed' },
                ],
              },
            },
          ],
        ],
      ])
    );

    await advanceFinalization({ trigger: 'test' });

    expect(store.patchTask).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ status: 'verified', verification_status: 'passed' })
    );
  });

  it('keeps a task in review when the attempt only warned about a missing report', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    asMock(github.getPullRequestStatus).mockResolvedValue(prStatus());
    asMock(github.getCommitChecks).mockResolvedValue(checks('passed'));
    asMock(store.listAttemptsForTasks).mockResolvedValue(
      new Map([
        [
          '11111111-1111-4111-8111-111111111111',
          [
            {
              id: 'attempt-unstructured',
              status: 'completed',
              warnings: ['OpenCode finished without a structured final report.'],
              commands: [{ name: 'pnpm test', status: 'passed', detail: 'exit 0' }],
              verification: { criteria: [] },
            },
          ],
        ],
      ])
    );

    await advanceFinalization({ trigger: 'test' });

    expect(store.patchTask).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ status: 'review', verification_status: 'integration_only' })
    );
  });
});
