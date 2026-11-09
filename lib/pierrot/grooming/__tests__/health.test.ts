/** @jest-environment node */

import { computeProjectHealth } from '../health';
import type { WorkspaceSnapshotData } from '../collect';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';

function project(id: string, name: string): PierrotProject {
  return {
    id,
    ownerUserId: 'owner',
    slug: id,
    name,
    description: '',
    objective: '',
    status: 'active',
    priority: 0,
    ownerRating: null,
    ownerRatingUpdatedAt: null,
    conversationId: null,
    projectBrief: '',
    briefRevision: 1,
    lastActivityAt: '',
    createdAt: '',
    updatedAt: '',
  };
}

function task(id: string, projectId: string): PierrotMemoryRecord {
  return {
    id,
    kind: 'task',
    title: id,
    content: id,
    rationale: null,
    status: 'current',
    project: projectId,
    tags: [],
    sourceRefs: [],
    conversationId: null,
    messageId: null,
    reviewAt: null,
    decidedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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

function snapshot(projects: PierrotProject[], tasks: PierrotMemoryRecord[]): WorkspaceSnapshotData {
  return {
    projects,
    records: tasks,
    tasks,
    decisions: [],
    memories: [],
    linkedProjectIds: new Map(tasks.map((item) => [item.id, [item.project as string]])),
    artifactsByProject: new Map(),
    knowledgeByProject: new Map(),
    existingMaterialUrls: new Set(),
    materialCandidates: [],
    conversations: [],
    summaryCandidates: [],
    devTasks: [],
    githubResults: [
      {
        taskId: tasks[0]?.id || 'none',
        taskTitle: tasks[0]?.title || '',
        repository: 'newlove',
        repositoryFullName: 'merkurov1/newlove',
        issueNumber: 4,
        issueUrl: null,
        issueState: null,
        stateReason: null,
        duplicateOf: null,
        pullRequests: [],
        result: 'sync_error',
        reason: 'API unavailable',
        titleSimilarity: 0,
        alternativeIssue: null,
        errorCode: 'GITHUB_API_ERROR',
      },
    ],
    githubErrors: ['API unavailable'],
    repositoryStatuses: [],
    warnings: [],
  };
}

describe('project health', () => {
  it('marks a project blocked on GitHub errors and stale tasks', () => {
    const p = project('p1', 'Journal');
    const health = computeProjectHealth(snapshot([p], [task('t1', 'p1')]), []);
    expect(health.blockedProjects).toBe(1);
    expect(health.projects[0].reasons).toContain('1 ошибок GitHub');
    expect(health.projects[0].reasons).toContain('1 устаревших задач');
  });
});
