/** @jest-environment node */

import {
  canRetirePullRequest,
  parsePullRequestNumber,
  selectAuthoritativePullRequest,
  verifyProductionDeployment,
} from '../delivery';
import type { DeliveryPullRequestRef } from '../delivery';

function pr(overrides: Partial<DeliveryPullRequestRef> = {}): DeliveryPullRequestRef {
  return {
    taskId: 'task-1',
    url: 'https://github.com/merkurov1/newlove/pull/1',
    number: 1,
    state: 'open',
    merged: false,
    attemptNumber: 1,
    headSha: 'a'.repeat(40),
    headRef: 'pierrot/dev/task-1/1',
    baseRef: 'main',
    ...overrides,
  };
}

describe('authoritative pull request selection', () => {
  it('parses pull request numbers safely', () => {
    expect(parsePullRequestNumber('https://github.com/o/r/pull/105')).toBe(105);
    expect(parsePullRequestNumber('https://github.com/o/r/pull/not-a-number')).toBeNull();
    expect(parsePullRequestNumber('https://github.com/o/r/issues/105')).toBeNull();
  });

  it('selects one newest open PR per task and keeps the rest obsolete', () => {
    const attempt1 = pr({ url: 'https://github.com/o/r/pull/107', number: 107, attemptNumber: 1 });
    const attempt2 = pr({ url: 'https://github.com/o/r/pull/106', number: 106, attemptNumber: 2 });
    const selection = selectAuthoritativePullRequest([attempt1, attempt2]);

    expect(selection.authoritative?.number).toBe(106);
    expect(selection.obsolete.map((item) => item.number)).toEqual([107]);
    expect(selection.ambiguous).toEqual([]);
  });

  it('prefers an open PR over older merged history', () => {
    const merged = pr({
      url: 'https://github.com/o/r/pull/101',
      number: 101,
      state: 'closed',
      merged: true,
      attemptNumber: 1,
    });
    const open = pr({
      url: 'https://github.com/o/r/pull/105',
      number: 105,
      state: 'open',
      merged: false,
      attemptNumber: 2,
    });

    expect(selectAuthoritativePullRequest([merged, open]).authoritative?.number).toBe(105);
  });

  it('flags two open PRs from the same attempt as ambiguous until redundancy is proved', () => {
    const first = pr({ url: 'https://github.com/o/r/pull/105', number: 105, attemptNumber: 2 });
    const second = pr({ url: 'https://github.com/o/r/pull/106', number: 106, attemptNumber: 2 });
    const selection = selectAuthoritativePullRequest([first, second]);

    expect(selection.authoritative?.number).toBe(106);
    expect(selection.ambiguous.map((item) => item.number)).toEqual([105]);
    expect(canRetirePullRequest({ obsolete: first, authoritative: selection.authoritative! })).toBe(
      false
    );
    expect(
      canRetirePullRequest({
        obsolete: first,
        authoritative: selection.authoritative!,
        containsObsoleteHead: true,
      })
    ).toBe(true);
  });

  it('retires an older attempt only when supersession is proven', () => {
    const attempt1 = pr({ url: 'https://github.com/o/r/pull/107', number: 107, attemptNumber: 1 });
    const attempt2 = pr({ url: 'https://github.com/o/r/pull/106', number: 106, attemptNumber: 2 });

    expect(canRetirePullRequest({ obsolete: attempt1, authoritative: attempt2 })).toBe(true);
    expect(
      canRetirePullRequest({ obsolete: attempt1, authoritative: { ...attempt2, attemptNumber: 1 } })
    ).toBe(false);
  });
});

describe('production deployment verification', () => {
  const sha = 'a'.repeat(40);
  const deployment = (overrides: Record<string, unknown> = {}) => ({
    state: 'ready' as const,
    url: 'https://www.merkurov.love',
    target: 'production',
    commitSha: sha,
    checkedAt: new Date().toISOString(),
    reason: null,
    ...overrides,
  });

  it('verifies only when production serves the exact landed commit', () => {
    expect(
      verifyProductionDeployment({ deployment: deployment(), landedShas: [sha] })
    ).toMatchObject({ status: 'verified', matchedSha: sha });
    expect(
      verifyProductionDeployment({
        deployment: deployment({ commitSha: 'b'.repeat(40) }),
        landedShas: [sha],
      })
    ).toMatchObject({ status: 'pending', matchedSha: null });
  });

  it('waits for building deployments instead of marking them delivered', () => {
    expect(
      verifyProductionDeployment({
        deployment: deployment({ state: 'building' }),
        landedShas: [sha],
      })
    ).toMatchObject({ status: 'pending' });
  });

  it('never fabricates a verified production state when the commit is unknown', () => {
    expect(
      verifyProductionDeployment({
        deployment: deployment({
          commitSha: null,
          state: 'unknown',
          reason: 'VERCEL_TOKEN missing',
        }),
        landedShas: [sha],
      })
    ).toMatchObject({ status: 'unavailable' });
    expect(verifyProductionDeployment({ deployment: null, landedShas: [sha] })).toMatchObject({
      status: 'not_configured',
    });
  });
});
