/** @jest-environment node */

import { generateGroomingProposals } from '../rules';
import type { WorkspaceSnapshotData } from '../collect';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';
import type { PierrotProject } from '@/lib/pierrot/projects/types';

function project(id: string, name: string, slug: string): PierrotProject {
  return {
    id,
    ownerUserId: 'owner',
    slug,
    name,
    description: '',
    objective: '',
    status: 'active',
    priority: 0,
    ownerRating: null,
    ownerRatingUpdatedAt: null,
    conversationId: `conv-${id}`,
    projectBrief: '',
    briefRevision: 1,
    lastActivityAt: '2026-11-01T10:00:00.000Z',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  };
}

function record(input: {
  id: string;
  title: string;
  content?: string;
  kind?: PierrotMemoryRecord['kind'];
  status?: PierrotMemoryRecord['status'];
  project?: string | null;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  reviewAt?: string | null;
}): PierrotMemoryRecord {
  return {
    id: input.id,
    kind: input.kind || 'task',
    title: input.title,
    content: input.content || input.title,
    rationale: null,
    status: input.status || 'current',
    project: input.project ?? null,
    tags: input.tags || [],
    sourceRefs: [{ type: 'owner_chat', messageId: `msg-${input.id}` }],
    conversationId: null,
    messageId: null,
    reviewAt: input.reviewAt ?? null,
    decidedAt: null,
    createdAt: input.createdAt || '2026-11-01T10:00:00.000Z',
    updatedAt: input.updatedAt || '2026-11-01T10:00:00.000Z',
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

function snapshot(input: {
  projects?: PierrotProject[];
  records?: PierrotMemoryRecord[];
  linked?: Array<[string, string[]]>;
  githubResults?: WorkspaceSnapshotData['githubResults'];
  summaries?: WorkspaceSnapshotData['summaryCandidates'];
  learningExamples?: WorkspaceSnapshotData['learningExamples'];
}): WorkspaceSnapshotData {
  const records = input.records || [];
  const tasks = records.filter((item) => item.kind === 'task' || item.kind === 'reminder');
  const decisions = records.filter((item) =>
    ['decision', 'position', 'preference', 'constraint'].includes(item.kind)
  );
  const memories = records.filter((item) =>
    ['memory', 'saved', 'rejected_recommendation'].includes(item.kind)
  );
  return {
    projects: input.projects || [],
    records,
    tasks,
    decisions,
    memories,
    linkedProjectIds: new Map(input.linked || []),
    artifactsByProject: new Map(),
    knowledgeByProject: new Map(),
    existingMaterialUrls: new Set(),
    materialCandidates: input.materials || [],
    conversations: [],
    summaryCandidates: input.summaries || [],
    devTasks: [],
    githubResults: input.githubResults || [],
    githubErrors: [],
    repositoryStatuses: [],
    warnings: [],
    learningExamples: input.learningExamples,
  };
}

describe('workspace grooming rules', () => {
  it('finds duplicate tasks in one project', () => {
    const journal = project('p1', 'Journal', 'journal');
    const a = record({ id: 'a', title: 'Проверить выпуск', project: 'Journal' });
    const b = record({ id: 'b', title: 'Проверить выпуск', project: 'Journal' });
    const result = generateGroomingProposals({
      snapshot: snapshot({
        projects: [journal],
        records: [a, b],
        linked: [
          ['a', [journal.id]],
          ['b', [journal.id]],
        ],
      }),
      scope: 'tasks',
      projectId: null,
    });

    expect(result.proposals.find((item) => item.operation === 'merge_tasks')).toMatchObject({
      params: { keeperId: 'a', duplicateIds: ['b'] },
      risk: 'reversible',
    });
  });

  it('does not merge identical tasks from different projects', () => {
    const journal = project('p1', 'Journal', 'journal');
    const art = project('p2', 'Art Engine', 'art-engine');
    const result = generateGroomingProposals({
      snapshot: snapshot({
        projects: [journal, art],
        records: [
          record({ id: 'a', title: 'Проверить выпуск', project: 'Journal' }),
          record({ id: 'b', title: 'Проверить выпуск', project: 'Art Engine' }),
        ],
        linked: [
          ['a', [journal.id]],
          ['b', [art.id]],
        ],
      }),
      scope: 'tasks',
      projectId: null,
    });

    expect(result.proposals.some((item) => item.operation === 'merge_tasks')).toBe(false);
  });

  it('keeps one canonical project when a task is linked to several projects', () => {
    const journal = project('p1', 'Journal', 'journal');
    const art = project('p2', 'Art Engine', 'art-engine');
    const result = generateGroomingProposals({
      snapshot: snapshot({
        projects: [journal, art],
        records: [record({ id: 'a', title: 'Проверить выпуск', project: 'Journal' })],
        linked: [['a', [journal.id, art.id]]],
      }),
      scope: 'tasks',
      projectId: null,
    });

    expect(result.proposals.find((item) => item.operation === 'move_task')).toBeTruthy();
  });

  it('completes a task only from confirmed GitHub evidence', () => {
    const journal = project('p1', 'Journal', 'journal');
    const result = generateGroomingProposals({
      snapshot: snapshot({
        projects: [journal],
        records: [record({ id: 'a', title: 'Проверить выпуск', project: 'Journal' })],
        linked: [['a', [journal.id]]],
        githubResults: [
          {
            taskId: 'a',
            taskTitle: 'Проверить выпуск',
            repository: 'newlove',
            repositoryFullName: 'merkurov1/newlove',
            issueNumber: 10,
            issueUrl: 'https://github.com/merkurov1/newlove/issues/10',
            issueState: 'closed',
            stateReason: 'completed',
            duplicateOf: null,
            pullRequests: [
              {
                number: 11,
                url: 'https://github.com/merkurov1/newlove/pull/11',
                state: 'closed',
                merged: true,
                mergedAt: '2026-11-02T10:00:00.000Z',
                title: 'Check issue',
              },
            ],
            result: 'confirmed_done',
            reason: 'Merged PR and closed Issue.',
            titleSimilarity: 0.8,
            alternativeIssue: null,
            errorCode: null,
          },
        ],
      }),
      scope: 'github',
      projectId: null,
    });

    expect(result.proposals.find((item) => item.operation === 'complete_task')).toBeTruthy();
  });

  it.each(['needs_verification', 'partially_implemented', 'sync_error'] as const)(
    'does not complete a task on %s',
    (resultStatus) => {
      const journal = project('p1', 'Journal', 'journal');
      const result = generateGroomingProposals({
        snapshot: snapshot({
          projects: [journal],
          records: [record({ id: 'a', title: 'Проверить выпуск', project: 'Journal' })],
          linked: [['a', [journal.id]]],
          githubResults: [
            {
              taskId: 'a',
              taskTitle: 'Проверить выпуск',
              repository: 'newlove',
              repositoryFullName: 'merkurov1/newlove',
              issueNumber: 10,
              issueUrl: null,
              issueState: 'closed',
              stateReason: null,
              duplicateOf: null,
              pullRequests: [],
              result: resultStatus,
              reason: 'Not enough evidence.',
              titleSimilarity: 0.1,
              alternativeIssue: null,
              errorCode: null,
            },
          ],
        }),
        scope: 'github',
        projectId: null,
      });

      expect(result.proposals.some((item) => item.operation === 'complete_task')).toBe(false);
      expect(result.ambiguous.length).toBeGreaterThan(0);
    }
  );

  it('offers a relink when an issue is missing but an alternative is found', () => {
    const art = project('p1', 'Art Engine', 'art-engine');
    const result = generateGroomingProposals({
      snapshot: snapshot({
        projects: [art],
        records: [record({ id: 'a', title: 'Fix lot page', project: 'Art Engine' })],
        linked: [['a', [art.id]]],
        githubResults: [
          {
            taskId: 'a',
            taskTitle: 'Fix lot page',
            repository: 'newlove',
            repositoryFullName: 'merkurov1/newlove',
            issueNumber: 404,
            issueUrl: null,
            issueState: null,
            stateReason: null,
            duplicateOf: null,
            pullRequests: [],
            result: 'not_found',
            reason: 'Issue missing.',
            titleSimilarity: 0,
            alternativeIssue: {
              number: 12,
              title: 'Fix public lot page',
              url: 'https://github.com/merkurov1/newlove/issues/12',
              score: 0.8,
            },
            errorCode: null,
          },
        ],
      }),
      scope: 'github',
      projectId: null,
    });

    expect(result.proposals.find((item) => item.operation === 'link_github_issue')).toMatchObject({
      params: { issueNumber: 12 },
    });
  });

  it('does not propose archival just because GitHub returned an error', () => {
    const art = project('p1', 'Art Engine', 'art-engine');
    const result = generateGroomingProposals({
      snapshot: snapshot({
        projects: [art],
        records: [record({ id: 'a', title: 'Fix lot page', project: 'Art Engine' })],
        linked: [['a', [art.id]]],
        githubResults: [
          {
            taskId: 'a',
            taskTitle: 'Fix lot page',
            repository: 'newlove',
            repositoryFullName: 'merkurov1/newlove',
            issueNumber: 5,
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
      }),
      scope: 'github',
      projectId: null,
    });

    expect(result.proposals.some((item) => item.operation === 'archive_task')).toBe(false);
  });

  it('moves temporary facts out of permanent memory', () => {
    const result = generateGroomingProposals({
      snapshot: snapshot({
        records: [
          record({
            id: 'm1',
            kind: 'memory',
            title: 'Сегодня работаю из дома',
            content: 'Сегодня работаю из дома',
          }),
        ],
      }),
      scope: 'memory',
      projectId: null,
    });

    expect(result.proposals.find((item) => item.operation === 'reclassify_memory')).toMatchObject({
      params: { kind: 'saved' },
      risk: 'confirmation',
    });
  });

  it('moves a project constraint out of active tasks', () => {
    const journal = project('p1', 'Journal', 'journal');
    const result = generateGroomingProposals({
      snapshot: snapshot({
        projects: [journal],
        records: [
          record({
            id: 'a',
            title: 'Важно: открытка не означает, что проект становится магазином',
            project: 'Journal',
          }),
        ],
        linked: [['a', [journal.id]]],
      }),
      scope: 'tasks',
      projectId: null,
    });

    expect(result.proposals.find((item) => item.operation === 'reclassify_task')).toMatchObject({
      params: { kind: 'constraint' },
    });
  });

  it('archives an obvious command artifact only as a confirmation proposal', () => {
    const result = generateGroomingProposals({
      snapshot: snapshot({
        records: [record({ id: 'a', title: 'Просто добавь это в задачи' })],
      }),
      scope: 'tasks',
      projectId: null,
    });

    expect(result.proposals.find((item) => item.operation === 'archive_task')).toMatchObject({
      risk: 'confirmation',
      params: { reason: 'command_artifact' },
    });
  });

  it('proposes saving an unlinked project material', () => {
    const journal = project('p1', 'Journal', 'journal');
    const result = generateGroomingProposals({
      snapshot: snapshot({
        projects: [journal],
        materials: [
          {
            projectId: journal.id,
            projectName: journal.name,
            url: 'https://example.com/archive',
            title: 'Архив писем',
            artifactType: 'link',
            sourceMessageId: 'm1',
            conversationId: 'c1',
            createdAt: '2026-11-01T10:00:00.000Z',
          },
        ],
      }),
      scope: 'projects',
      projectId: null,
    });

    expect(result.proposals.find((item) => item.operation === 'create_artifact')).toMatchObject({
      params: { url: 'https://example.com/archive' },
      risk: 'reversible',
    });
  });

  it('proposes versioned context summaries without deleting messages', () => {
    const result = generateGroomingProposals({
      snapshot: snapshot({
        summaries: [
          {
            conversationId: 'conv-1',
            title: 'Long chat',
            messageCount: 80,
            charCount: 30000,
            summary: null,
            summaryGeneratedAt: null,
            stale: true,
            volumeReached: true,
          },
        ],
      }),
      scope: 'context',
      projectId: null,
    });

    expect(
      result.proposals.find((item) => item.operation === 'create_context_summary')
    ).toMatchObject({
      risk: 'safe',
      params: { conversationId: 'conv-1' },
    });
  });

  it('creates a GitHub issue only for concrete engineering work', () => {
    const art = project('p1', 'Art Engine', 'art-engine');
    const result = generateGroomingProposals({
      snapshot: snapshot({
        projects: [art],
        records: [
          record({
            id: 'a',
            title: 'Исправить публичную страницу лота',
            project: 'Art Engine',
            tags: ['interface'],
          }),
          record({
            id: 'b',
            title: 'Идея: сделать серию открыток',
            project: 'Art Engine',
            tags: ['idea'],
          }),
        ],
        linked: [
          ['a', [art.id]],
          ['b', [art.id]],
        ],
      }),
      scope: 'github',
      projectId: null,
    });

    expect(result.proposals.find((item) => item.operation === 'create_issue')).toMatchObject({
      entityId: 'a',
    });
    expect(
      result.proposals.some((item) => item.operation === 'create_issue' && item.entityId === 'b')
    ).toBe(false);
  });

  it('does not repeat a reclassification the owner already rejected', () => {
    const journal = project('p1', 'Journal', 'journal');
    const task = record({
      id: 'rule',
      title: 'Открытка не должна превращать Heart & Angel в интернет-магазин',
      project: 'Journal',
    });
    const result = generateGroomingProposals({
      snapshot: snapshot({
        projects: [journal],
        records: [task],
        linked: [['rule', [journal.id]]],
        learningExamples: [
          {
            id: 'e1',
            userId: 'owner',
            conversationId: 'conv',
            sourceMessageId: 'm1',
            sourceText: task.title,
            proposedKind: 'task',
            confirmedKind: null,
            proposedProjectId: journal.id,
            confirmedProjectId: null,
            outcome: 'false_task',
            reason: 'Owner rejected the reclassification.',
            source: 'grooming',
            analyzerVersion: 'test',
            metadata: {},
            createdAt: '2026-11-01T10:00:00.000Z',
          },
        ],
      }),
      scope: 'tasks',
      projectId: null,
    });

    expect(
      result.proposals.some(
        (item) => item.operation === 'reclassify_task' && item.entityId === 'rule'
      )
    ).toBe(false);
  });
});
