/** @jest-environment node */

jest.mock('../repository', () => ({
  compareRefs: jest.fn(),
  getCheckRuns: jest.fn(),
}));

jest.mock('../repositories', () => ({
  resolveDevRepository: jest.fn(() => ({
    key: 'newlove',
    fullName: 'merkurov1/newlove',
    defaultBranch: 'main',
    workBranch: 'main',
  })),
}));

jest.mock('../tasks', () => ({
  getDevTask: jest.fn(),
  saveDevTaskReview: jest.fn(),
}));

import { compareRefs, getCheckRuns } from '../repository';
import { getDevTask, saveDevTaskReview } from '../tasks';
import { reviewDevTask } from '../review';
import type { DevTask } from '../types';

const mockCompare = compareRefs as jest.Mock;
const mockChecks = getCheckRuns as jest.Mock;
const mockGetTask = getDevTask as jest.Mock;
const mockSave = saveDevTaskReview as jest.Mock;

const baseTask: DevTask = {
  id: '22222222-2222-4222-8222-222222222222',
  userId: '11111111-1111-4111-8111-111111111111',
  title: 'Task',
  objective: 'Goal',
  context: '',
  repository: 'newlove',
  baseRef: 'main',
  baseCommit: 'a'.repeat(40),
  affectedFiles: [],
  currentBehavior: '',
  requiredBehavior: '',
  technicalPlan: '',
  backendChanges: ['lib/pierrot/dev/llm.ts'],
  frontendChanges: [],
  databaseChanges: [],
  mobileChanges: [],
  migrations: [],
  securityConstraints: [],
  tests: ['npm test'],
  acceptanceCriteria: ['Change lib/pierrot/dev/llm.ts', 'Run npm test'],
  unverified: [],
  conversationId: null,
  status: 'review',
  verificationStatus: null,
  verificationNotes: '',
  pullRequests: [],
  resultCommit: 'b'.repeat(40),
  resultNotes: '',
  verifiedAt: null,
  createdAt: '',
  updatedAt: '',
  promptText: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTask.mockResolvedValue(baseTask);
  mockSave.mockImplementation(({ report }) =>
    Promise.resolve({ ...baseTask, verificationStatus: report.verdict })
  );
});

describe('Engineering Review', () => {
  it('does not verify a task without a diff, even if a commit is attached', async () => {
    mockCompare.mockResolvedValue({
      repository: 'merkurov1/newlove',
      base: 'main',
      head: 'main',
      commitSha: null,
      files: [],
      truncated: false,
    });
    mockChecks.mockResolvedValue({
      repository: 'merkurov1/newlove',
      commitSha: null,
      checks: [],
      complete: false,
    });

    const result = await reviewDevTask(baseTask.userId!, baseTask.id);

    expect(result?.report.verdict).toBe('not_verified');
    expect(result?.report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'high', problem: expect.stringContaining('No changed files') }),
        expect.objectContaining({ severity: 'high', problem: expect.stringContaining('No executed test') }),
      ])
    );
    expect(result?.report.checks.testsExecuted).toBe(false);
  });

  it('rejects a review whose head is the protected default branch', async () => {
    mockCompare.mockResolvedValue({
      repository: 'merkurov1/newlove',
      base: 'main',
      head: 'main',
      commitSha: 'c'.repeat(40),
      files: [
        {
          filename: 'lib/pierrot/dev/llm.ts',
          status: 'modified',
          additions: 1,
          deletions: 1,
          patch: '@@',
          patchTruncated: false,
        },
      ],
      truncated: false,
    });
    mockChecks.mockResolvedValue({
      repository: 'merkurov1/newlove',
      commitSha: 'c'.repeat(40),
      checks: [{ name: 'test', status: 'completed', conclusion: 'success', url: null, app: null }],
    });

    const result = await reviewDevTask(baseTask.userId!, baseTask.id, { head: 'main' });

    expect(result?.report.verdict).toBe('rejected');
    expect(result?.report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'blocker', problem: expect.stringContaining('default branch') }),
      ])
    );
  });

  it('verifies only when a diff and an executed check run exist', async () => {
    mockCompare.mockResolvedValue({
      repository: 'merkurov1/newlove',
      base: 'a'.repeat(40),
      head: 'b'.repeat(40),
      commitSha: 'b'.repeat(40),
      files: [
        {
          filename: 'lib/pierrot/dev/llm.ts',
          status: 'modified',
          additions: 4,
          deletions: 2,
          patch: '@@',
          patchTruncated: false,
        },
      ],
      truncated: false,
    });
    mockChecks.mockResolvedValue({
      repository: 'merkurov1/newlove',
      commitSha: 'b'.repeat(40),
      checks: [{ name: 'test', status: 'completed', conclusion: 'success', url: null, app: null }],
    });

    const result = await reviewDevTask(baseTask.userId!, baseTask.id);

    expect(result?.report.verdict).toBe('verified');
    expect(result?.report.checks.testsExecuted).toBe(true);
    expect(result?.report.acceptanceCriteria[0]).toMatchObject({
      status: 'satisfied',
    });
  });
});
