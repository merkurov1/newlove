/** @jest-environment node */

jest.mock('../store', () => ({
  isWorkbenchSchemaReady: jest.fn(async () => true),
  listFinalizationTasks: jest.fn(async () => []),
  patchTask: jest.fn(async () => null),
  appendEvent: jest.fn(async () => undefined),
}));

jest.mock('../github', () => ({
  getPullRequestStatus: jest.fn(),
  getCommitChecks: jest.fn(),
  getPullRequestFiles: jest.fn(async () => []),
}));

import * as store from '../store';
import * as github from '../github';
import { reconcileLegacyReviewRows } from '../reconciliation';
import type { DevWorkbenchTask } from '../types';

const asMock = (value: unknown) => value as jest.Mock;
const HEAD = 'a'.repeat(40);
const MERGE = 'b'.repeat(40);

function task(overrides: Partial<DevWorkbenchTask> = {}): DevWorkbenchTask {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Brain triage PR #84',
    objective: 'Triage',
    repository: 'merkurov1/newlove',
    baseRef: 'main',
    status: 'review',
    priority: 0,
    queuePosition: null,
    queuedAt: null,
    attemptCount: 1,
    acceptanceCriteria: ['tests'],
    verificationStatus: 'integration_only',
    blockedReason: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    resultCommit: HEAD,
    resultNotes: 'Original executor report must survive.',
    pullRequests: ['https://github.com/merkurov1/newlove/pull/84'],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  } as DevWorkbenchTask;
}

function status(overrides: Record<string, unknown> = {}) {
  return {
    number: 84,
    url: 'https://github.com/merkurov1/newlove/pull/84',
    state: 'closed',
    merged: true,
    mergeable: null,
    mergeableState: 'unknown',
    headSha: HEAD,
    baseBranch: 'main',
    mergeCommitSha: MERGE,
    mergedAt: new Date().toISOString(),
    ...overrides,
  };
}

function checks(state: 'passed' | 'failed' | 'unknown') {
  return { status: state, detail: `CI ${state}`, checks: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  asMock(store.isWorkbenchSchemaReady).mockResolvedValue(true);
  asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
  asMock(store.patchTask).mockResolvedValue(null);
  asMock(github.getPullRequestStatus).mockResolvedValue(status());
  asMock(github.getCommitChecks).mockResolvedValue(checks('passed'));
  asMock(github.getPullRequestFiles).mockResolvedValue([]);
});

describe('legacy review reconciliation', () => {
  it('marks a really merged PR verified when real CI passed for its head', async () => {
    const report = await reconcileLegacyReviewRows({ apply: true });
    expect(report).toMatchObject({ scanned: 1, landed: 1, changed: 1, stillReview: 0 });
    expect(store.patchTask).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        status: 'verified',
        verification_status: 'passed',
        result_commit: MERGE,
      })
    );
    // The patch must not overwrite the executor report or cached PR link.
    const patch = asMock(store.patchTask).mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('result_notes');
    expect(patch).not.toHaveProperty('pull_requests');
    expect(asMock(store.appendEvent)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task.reconciled' })
    );
  });

  it('never marks an unmerged PR complete', async () => {
    asMock(github.getPullRequestStatus).mockResolvedValue(
      status({ state: 'open', merged: false, mergeCommitSha: null, mergedAt: null })
    );

    const report = await reconcileLegacyReviewRows({ apply: true });
    expect(report).toMatchObject({ scanned: 1, landed: 0, changed: 1, stillReview: 1 });
    expect(report.rows[0]).toMatchObject({ state: 'not_merged', toStatus: 'review' });
    expect(store.patchTask).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ status: 'review', verification_status: 'reconciled_not_landed' })
    );
    expect(store.patchTask).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'verified' })
    );
  });

  it('keeps a merged row in review when CI evidence is missing', async () => {
    asMock(github.getCommitChecks).mockResolvedValue(checks('unknown'));

    const report = await reconcileLegacyReviewRows({ apply: true });
    expect(report.rows[0]).toMatchObject({ state: 'ci_missing', toStatus: 'review' });
    expect(report.landed).toBe(0);
    expect(store.patchTask).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ status: 'review', verification_status: 'reconciled_not_landed' })
    );
  });

  it('reports rows without a PR without changing them', async () => {
    asMock(store.listFinalizationTasks).mockResolvedValue([
      task({ pullRequests: [], resultNotes: 'keep me', status: 'review' }),
    ]);

    const report = await reconcileLegacyReviewRows({ apply: true });
    expect(report).toMatchObject({ scanned: 1, missingPullRequest: 1, changed: 0 });
    expect(store.patchTask).not.toHaveBeenCalled();
  });

  it('is idempotent and supports a dry run', async () => {
    await reconcileLegacyReviewRows({ apply: true });
    expect(store.patchTask).toHaveBeenCalledTimes(1);

    // Applying again sees the already verified row and does not rewrite it.
    asMock(store.listFinalizationTasks).mockResolvedValue([
      task({ status: 'verified', verificationStatus: 'passed' }),
    ]);
    await reconcileLegacyReviewRows({ apply: true });
    expect(store.patchTask).toHaveBeenCalledTimes(1);

    asMock(store.patchTask).mockClear();
    asMock(store.listFinalizationTasks).mockResolvedValue([task()]);
    const dry = await reconcileLegacyReviewRows({ apply: false });
    expect(dry.changed).toBe(0);
    expect(store.patchTask).not.toHaveBeenCalled();
  });
});
