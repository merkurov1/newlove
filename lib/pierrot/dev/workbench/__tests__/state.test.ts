/** @jest-environment node */

import {
  assertAttemptTransition,
  assertTaskTransition,
  branchNameForAttempt,
  canTransitionTask,
  computeVerdict,
  evaluateCriterion,
  truncateLog,
} from '../state';

describe('workbench task state machine', () => {
  it('allows the documented happy path only', () => {
    expect(canTransitionTask('draft', 'ready')).toBe(true);
    expect(canTransitionTask('ready', 'queued')).toBe(true);
    expect(canTransitionTask('queued', 'in_progress')).toBe(true);
    expect(canTransitionTask('in_progress', 'review')).toBe(true);
    expect(canTransitionTask('review', 'verified')).toBe(true);

    expect(() => assertTaskTransition('draft', 'in_progress')).toThrow(
      'Invalid task transition'
    );
    expect(() => assertTaskTransition('queued', 'verified')).toThrow(
      'Invalid task transition'
    );
    expect(() => assertTaskTransition('verified', 'in_progress')).toThrow(
      'Invalid task transition'
    );
  });

  it('keeps attempts terminal once finished', () => {
    expect(() => assertAttemptTransition('running', 'completed')).not.toThrow();
    expect(() => assertAttemptTransition('completed', 'running')).toThrow(
      'Invalid attempt transition'
    );
    expect(() => assertAttemptTransition('timed_out', 'claimed')).toThrow(
      'Invalid attempt transition'
    );
  });
});

describe('attempt branch naming', () => {
  const taskId = '11111111-1111-4111-8111-111111111111';

  it('is predictable and isolated per attempt', () => {
    expect(branchNameForAttempt(taskId, 1)).toBe(`pierrot/dev/${taskId}/1`);
    expect(branchNameForAttempt(taskId, 2)).not.toBe(branchNameForAttempt(taskId, 1));
  });

  it('rejects invalid identifiers', () => {
    expect(() => branchNameForAttempt('not-a-uuid', 1)).toThrow();
    expect(() => branchNameForAttempt(taskId, 0)).toThrow();
  });
});

describe('acceptance evidence', () => {
  const base = {
    changedFiles: ['app/api/thing/route.ts'],
    localChecksPassed: false,
    localChecksFailed: false,
    ciPassed: false,
    ciFailed: false,
    manualConfirmed: false,
  };

  it('does not treat a changed filename as proof', () => {
    const result = evaluateCriterion({
      ...base,
      criterion: 'app/api/thing/route.ts supports cancellation',
    });
    expect(result.status).toBe('not_verified');
    expect(result.source).toBe('diff');
    expect(result.evidence).toContain('not proof');
  });

  it('requires a real passing check for test criteria', () => {
    expect(
      evaluateCriterion({ ...base, criterion: 'pnpm typecheck passes' }).status
    ).toBe('not_verified');
    expect(
      evaluateCriterion({
        ...base,
        criterion: 'pnpm typecheck passes',
        ciPassed: true,
      }).status
    ).toBe('satisfied');
  });

  it('fails closed when CI failed', () => {
    const result = evaluateCriterion({
      ...base,
      criterion: 'pnpm test passes',
      ciFailed: true,
    });
    expect(result.status).toBe('failed');
  });

  it('accepts explicit manual confirmation', () => {
    const result = evaluateCriterion({
      ...base,
      criterion: 'Owner can see the diff',
      manualConfirmed: true,
    });
    expect(result.status).toBe('satisfied');
    expect(result.source).toBe('manual');
  });
});

describe('verdicts', () => {
  const satisfied = [{ status: 'satisfied' as const }];

  it('never verifies without a passing check', () => {
    expect(
      computeVerdict({
        hasChanges: true,
        hasBlocker: false,
        hasHighFinding: true,
        localChecksPassed: false,
        localChecksFailed: false,
        ciPassed: false,
        ciFailed: false,
        criteria: satisfied,
      })
    ).toBe('not_verified');
  });

  it('verifies only when checks and all criteria pass', () => {
    expect(
      computeVerdict({
        hasChanges: true,
        hasBlocker: false,
        hasHighFinding: false,
        localChecksPassed: false,
        localChecksFailed: false,
        ciPassed: true,
        ciFailed: false,
        criteria: satisfied,
      })
    ).toBe('verified');
  });

  it('rejects a failed CI run even with manual confirmation', () => {
    expect(
      computeVerdict({
        hasChanges: true,
        hasBlocker: false,
        hasHighFinding: false,
        localChecksPassed: false,
        localChecksFailed: false,
        ciPassed: true,
        ciFailed: true,
        manualAll: true,
        criteria: satisfied,
      })
    ).toBe('rejected');
  });
});

describe('log truncation', () => {
  it('keeps head and tail and stays bounded', () => {
    const input = 'A'.repeat(1000) + 'TAIL';
    const output = truncateLog(input, 100);
    expect(output.length).toBeLessThan(300);
    expect(output).toContain('A');
    expect(output).toContain('TAIL');
    expect(output).toContain('truncated');
  });
});
