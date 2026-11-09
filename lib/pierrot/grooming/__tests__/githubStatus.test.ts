/** @jest-environment node */

import {
  classifyGithubReconciliation,
  extractGithubLink,
} from '../github';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';

describe('GitHub reconciliation status rules', () => {
  it('treats a duplicate issue as needing verification, not completion', () => {
    expect(
      classifyGithubReconciliation({
        issueExists: true,
        issueState: 'closed',
        duplicateOf: 42,
      })
    ).toMatchObject({ result: 'needs_verification' });
  });

  it('treats merged PR as strong but not always complete evidence', () => {
    expect(
      classifyGithubReconciliation({
        issueExists: true,
        issueState: 'closed',
        mergedPullRequest: true,
        titleSimilarity: 0.8,
      }).result
    ).toBe('confirmed_done');

    expect(
      classifyGithubReconciliation({
        issueExists: true,
        issueState: 'closed',
        mergedPullRequest: true,
        titleSimilarity: 0.2,
      }).result
    ).toBe('partially_implemented');
  });

  it('does not treat a closed unmerged issue as done', () => {
    expect(
      classifyGithubReconciliation({
        issueExists: true,
        issueState: 'closed',
        stateReason: 'completed',
      })
    ).toMatchObject({ result: 'needs_verification' });
  });

  it('distinguishes API failure, access failure and open issue', () => {
    expect(
      classifyGithubReconciliation({ issueExists: true, errorStatus: 429 }).result
    ).toBe('sync_error');
    expect(
      classifyGithubReconciliation({ issueExists: false, errorStatus: 404 }).result
    ).toBe('not_found');
    expect(
      classifyGithubReconciliation({ issueExists: true, issueState: 'open' }).result
    ).toBe('still_open');
  });

  it('treats commit-only evidence as requiring verification', () => {
    expect(
      classifyGithubReconciliation({
        issueExists: false,
        issueState: null,
        commitEvidence: true,
      })
    ).toMatchObject({ result: 'not_found' });
    expect(
      classifyGithubReconciliation({
        issueExists: true,
        issueState: 'closed',
        commitEvidence: true,
      })
    ).toMatchObject({ result: 'needs_verification' });
  });
});

function task(sourceRefs: unknown[] = [], tags: string[] = []): PierrotMemoryRecord {
  return {
    id: 'task-1',
    kind: 'task',
    title: 'Fix issue',
    content: 'Fix issue',
    rationale: null,
    status: 'current',
    project: 'Art Engine',
    tags,
    sourceRefs,
    conversationId: null,
    messageId: null,
    reviewAt: null,
    decidedAt: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    importance: 0.6,
    confidence: 0.8,
    ownerRating: null,
    ownerRatingUpdatedAt: null,
    validFrom: null,
    validUntil: null,
    lastReferencedAt: null,
    archivedReason: null,
    supersededBy: null,
  };
}

describe('GitHub task link extraction', () => {
  it('reads a repository and issue from existing source refs', () => {
    expect(
      extractGithubLink(
        task([
          {
            type: 'github',
            repository: 'merkurov1/newlove',
            issueNumber: 12,
            url: 'https://github.com/merkurov1/newlove/issues/12',
          },
        ])
      )
    ).toMatchObject({ repository: 'merkurov1/newlove', issueNumber: 12 });
  });

  it('reads a github:repo#number tag', () => {
    expect(extractGithubLink(task([], ['github:merkurov1/newlove#9']))).toMatchObject({
      repository: 'merkurov1/newlove',
      issueNumber: 9,
    });
  });

  it('returns null instead of guessing when no link exists', () => {
    expect(extractGithubLink(task())).toBeNull();
  });
});
