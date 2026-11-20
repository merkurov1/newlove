/** @jest-environment node */

jest.mock('../store', () => ({
  appendEvent: jest.fn(async () => undefined),
  listAttemptsForTasks: jest.fn(async () => new Map()),
  patchTask: jest.fn(async () => ({ id: 'task' })),
}));

jest.mock('../github', () => ({
  getPullRequestStatus: jest.fn(async () => null),
}));

import * as store from '../store';
import * as github from '../github';
import {
  attemptHasStructuredEvidence,
  auditNonTerminalTasks,
  planTaskReconciliation,
  reconcileTaskStates,
} from '../reconciliation';
import type { DevWorkbenchTask } from '../types';

const asMock = (value: unknown) => value as jest.Mock;

function task(overrides: Partial<DevWorkbenchTask> = {}): DevWorkbenchTask {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Task',
    objective: '',
    repository: 'merkurov1/newlove',
    baseRef: 'main',
    status: 'review',
    priority: 0,
    queuePosition: null,
    queuedAt: null,
    attemptCount: 1,
    acceptanceCriteria: ['criterion'],
    verificationStatus: 'not_run',
    verifiedAt: null,
    blockedReason: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    resultCommit: null,
    resultNotes: '',
    pullRequests: ['https://github.com/merkurov1/newlove/pull/57'],
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const structuredAttempt = {
  id: 'attempt-1',
  status: 'completed',
  warnings: [],
  commands: [{ status: 'passed' }],
  verification: {
    criteria: [{ criterion: 'criterion', status: 'satisfied', evidence: 'CI passed' }],
  },
};

const unstructuredAttempt = {
  id: 'attempt-2',
  status: 'completed',
  warnings: ['OpenCode finished without a structured final report.'],
  commands: [{ status: 'passed' }],
  verification: { criteria: [] },
};

const mergedPr = {
  number: 57,
  url: 'https://github.com/merkurov1/newlove/pull/57',
  state: 'closed',
  merged: true,
  mergeCommitSha: 'd'.repeat(40),
  headSha: 'e'.repeat(40),
};

beforeEach(() => {
  jest.clearAllMocks();
  asMock(store.patchTask).mockResolvedValue({ id: 'task' });
  asMock(store.listAttemptsForTasks).mockResolvedValue(new Map());
});

describe('task/PR reconciliation planning', () => {
  it('marks a merged PR verified only with structured criteria and a passing command', () => {
    expect(attemptHasStructuredEvidence(structuredAttempt)).toBe(true);
    const plan = planTaskReconciliation({
      task: task(),
      pr: mergedPr,
      attempt: structuredAttempt,
      now: '2026-11-20T00:00:00.000Z',
    });
    expect(plan.action).toBe('mark_verified');
    expect(plan.patch).toMatchObject({
      status: 'verified',
      verification_status: 'passed',
      verified_at: '2026-11-20T00:00:00.000Z',
      result_commit: mergedPr.mergeCommitSha,
    });
  });

  it('keeps a merged PR in review with not_run when evidence is missing', () => {
    expect(attemptHasStructuredEvidence(unstructuredAttempt)).toBe(false);
    const plan = planTaskReconciliation({
      task: task({ verificationStatus: 'partial', verifiedAt: '2026-11-19T00:00:00.000Z' }),
      pr: mergedPr,
      attempt: unstructuredAttempt,
    });
    expect(plan.action).toBe('mark_integration_only');
    expect(plan.patch).toMatchObject({
      status: 'review',
      verification_status: 'not_run',
      verified_at: null,
      result_commit: mergedPr.mergeCommitSha,
    });
    expect(String(plan.patch?.verification_notes)).toContain('remains in review');
    expect(String(plan.patch?.verification_notes)).not.toContain('verified with warnings');
  });

  it('repairs review rows that hold a verified-like flag without a verification action', () => {
    for (const verificationStatus of ['partial', 'passed', 'integration_only']) {
      const plan = planTaskReconciliation({
        task: task({ verificationStatus, verifiedAt: '2026-11-19T00:00:00.000Z' }),
        pr: null,
        attempt: null,
      });
      expect(plan.action).toBe('repair_review_state');
      expect(plan.patch).toMatchObject({
        status: 'review',
        verification_status: 'not_run',
        verified_at: null,
      });
    }
  });

  it('does not close or archive a task when its PR was closed without merging', () => {
    const plan = planTaskReconciliation({
      task: task({ verificationStatus: 'partial' }),
      pr: { ...mergedPr, merged: false, state: 'closed', mergeCommitSha: null },
      attempt: unstructuredAttempt,
    });
    expect(plan.action).toBe('notify_closed_unmerged');
    expect(plan.patch).toBeNull();
    expect(plan.event?.level).toBe('warn');
    expect(plan.event?.message).toContain('no status was changed automatically');
  });

  it('never downgrades a verified task and never touches non-review tasks', () => {
    expect(
      planTaskReconciliation({
        task: task({ status: 'verified', verificationStatus: 'passed' }),
        pr: mergedPr,
        attempt: unstructuredAttempt,
      }).action
    ).toBe('none');
    for (const status of ['ready', 'queued', 'in_progress', 'failed', 'cancelled'] as const) {
      expect(
        planTaskReconciliation({
          task: task({ status, verificationStatus: 'partial' }),
          pr: mergedPr,
          attempt: unstructuredAttempt,
        }).action
      ).toBe('none');
    }
  });

  it('is idempotent after the merged-row state has been repaired', () => {
    const plan = planTaskReconciliation({
      task: task({
        verificationStatus: 'not_run',
        verifiedAt: null,
        resultCommit: mergedPr.mergeCommitSha,
      }),
      pr: mergedPr,
      attempt: unstructuredAttempt,
    });
    expect(plan.action).toBe('none');
  });
});

describe('non-terminal audit', () => {
  it('reports ready/failed rows with PRs without changing them', () => {
    const issues = auditNonTerminalTasks([
      task({ id: 'ready', status: 'ready' }),
      task({ id: 'failed', status: 'failed' }),
      task({ id: 'review', status: 'review', verificationStatus: 'partial' }),
      task({ id: 'queued', status: 'queued' }),
      task({ id: 'verified', status: 'verified' }),
    ]);
    expect(issues.map((issue) => issue.code).sort()).toEqual([
      'failed_with_pull_request',
      'ready_with_pull_request',
      'review_verification_flag',
    ]);
    expect(issues.every((issue) => issue.status !== 'verified')).toBe(true);
  });
});

describe('bounded reconciliation pass', () => {
  it('patches only review rows and records a deduped event', async () => {
    asMock(github.getPullRequestStatus).mockResolvedValue({
      number: 57,
      url: mergedPr.url,
      state: 'closed',
      merged: true,
      mergeable: null,
      mergeableState: null,
      headSha: mergedPr.headSha,
      mergeCommitSha: mergedPr.mergeCommitSha,
      baseBranch: 'main',
    });
    asMock(store.listAttemptsForTasks).mockResolvedValue(
      new Map([['11111111-1111-4111-8111-111111111111', [unstructuredAttempt]]])
    );

    const result = await reconcileTaskStates({
      tasks: [
        task({ id: '11111111-1111-4111-8111-111111111111' }),
        task({ id: '22222222-2222-4222-8222-222222222222', status: 'ready' }),
      ],
      force: true,
    });

    expect(result).toMatchObject({ checked: 1, repaired: 1, skipped: false });
    expect(store.patchTask).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ status: 'review', verification_status: 'not_run' }),
      ['review']
    );
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: '11111111-1111-4111-8111-111111111111',
        type: 'task.integration_reconciled',
        level: 'warn',
        dedupeKey: expect.stringContaining('integration-reconciled'),
      })
    );
  });

  it('does not fail the overview when GitHub errors for one task', async () => {
    asMock(github.getPullRequestStatus).mockRejectedValue(new Error('rate limited'));
    const result = await reconcileTaskStates({ tasks: [task()], force: true });
    expect(result).toMatchObject({ checked: 1, repaired: 0, errors: 1 });
    expect(store.patchTask).not.toHaveBeenCalled();
  });

  it('repairs a review row with a stale flag even when it has no PR link', async () => {
    const result = await reconcileTaskStates({
      tasks: [
        task({
          pullRequests: [],
          verificationStatus: 'partial',
          verifiedAt: '2026-11-19T00:00:00.000Z',
        }),
      ],
      force: true,
    });
    expect(result).toMatchObject({ checked: 1, repaired: 1 });
    expect(github.getPullRequestStatus).not.toHaveBeenCalled();
    expect(store.patchTask).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({ status: 'review', verification_status: 'not_run' }),
      ['review']
    );
  });
});
