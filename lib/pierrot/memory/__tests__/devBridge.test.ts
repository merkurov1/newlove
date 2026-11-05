/** @jest-environment node */

jest.mock('@/lib/pierrot/dev/repositories', () => ({
  getDevRepositoryConfig: jest.fn((key: string) => ({
    key: key === 'pierrot' ? 'pierrot' : 'newlove',
    fullName: key === 'pierrot' ? 'merkurov1/Pierrot' : 'merkurov1/newlove',
    defaultBranch: 'main',
    workBranch: 'main',
  })),
}));

jest.mock('@/lib/pierrot/dev/tasks', () => ({
  createDevTask: jest.fn(),
  findDevTaskByDecisionId: jest.fn(),
}));

jest.mock('../store', () => ({
  updateMemoryRecord: jest.fn(),
}));

import { createDevTask, findDevTaskByDecisionId } from '@/lib/pierrot/dev/tasks';
import { updateMemoryRecord } from '../store';
import {
  createDevTaskFromChat,
  detectDevTaskIntent,
  looksLikeEngineeringTask,
  transferMemoryRecordToDev,
} from '../devBridge';
import type { DevTask } from '@/lib/pierrot/dev/types';
import type { PierrotMemoryRecord } from '../types';

const mockCreate = createDevTask as jest.Mock;
const mockFind = findDevTaskByDecisionId as jest.Mock;
const mockUpdateMemory = updateMemoryRecord as jest.Mock;
const USER_ID = 'fffa55a9-1ed7-49ff-953d-dfffa9f00844';

const record: PierrotMemoryRecord = {
  id: '0aac6356-b6a3-418c-bf90-01f499b1cd94',
  kind: 'reminder',
  title: 'проверить логи dev mode и улучшить работу там',
  content: 'Проверить логи Dev Mode, найти ошибки и улучшить работу.',
  rationale: null,
  status: 'current',
  project: 'Pierrot',
  tags: ['dev-mode'],
  sourceRefs: [
    {
      type: 'owner_command',
      action: 'remind',
    },
  ],
  conversationId: '01ea10a0-e70a-411e-85fb-e213de4cd0a0',
  messageId: 'd78ffe00-89ae-4ec8-8940-e9bc9c2baff3',
  reviewAt: null,
  decidedAt: null,
  createdAt: '2026-11-04T20:06:48Z',
  updatedAt: '2026-11-05T07:09:39Z',
  importance: 0.6,
  confidence: 0.9,
  validFrom: '2026-11-04T20:06:48Z',
  validUntil: null,
  lastReferencedAt: null,
  archivedReason: null,
  supersededBy: null,
};

function task(overrides: Partial<DevTask> = {}): DevTask {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    userId: 'fffa55a9-1ed7-49ff-953d-dfffa9f00844',
    title: 'Проверить логи Dev Mode и улучшить работу',
    objective: 'Проверить логи',
    context: 'source',
    repository: 'newlove',
    baseRef: 'main',
    baseCommit: null,
    affectedFiles: [],
    currentBehavior: '',
    requiredBehavior: '',
    technicalPlan: '',
    backendChanges: [],
    frontendChanges: [],
    databaseChanges: [],
    mobileChanges: [],
    migrations: [],
    securityConstraints: [],
    tests: [],
    acceptanceCriteria: [],
    unverified: [],
    conversationId: null,
    decisionIds: [record.id],
    status: 'draft',
    verificationStatus: null,
    verificationNotes: '',
    pullRequests: [],
    resultCommit: null,
    resultNotes: '',
    verifiedAt: null,
    createdAt: '',
    updatedAt: '',
    promptText: '',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFind.mockResolvedValue(null);
  mockCreate.mockResolvedValue(task());
  mockUpdateMemory.mockResolvedValue(record);
});

describe('Dev task intent detection', () => {
  it('creates an explicit Dev task and removes the command from the content', () => {
    expect(detectDevTaskIntent('Создай задачу в Dev: проверь логи dev mode')).toMatchObject({
      action: 'create',
      explicit: true,
      repository: 'newlove',
      content: 'проверь логи dev mode',
    });
  });

  it('creates from “Добавь в Dev: …”', () => {
    expect(detectDevTaskIntent('Добавь в Dev: проверь логи')).toMatchObject({
      action: 'create',
      explicit: true,
      content: 'проверь логи',
    });
  });

  it('recognises an explicit statement that this is an engineering task', () => {
    expect(detectDevTaskIntent('Это задача по разработке: починить Dev Mode')).toMatchObject({
      action: 'create',
      explicit: true,
      content: 'починить Dev Mode',
    });
  });

  it('classifies an obvious engineering request in a known repository', () => {
    const intent = detectDevTaskIntent('Нужно исправить это в newlove');

    expect(intent.action).toBe('create');
    expect(intent.explicit).toBe(false);
    expect(intent.repository).toBe('newlove');
    expect(looksLikeEngineeringTask('Нужно исправить это в newlove')).toBe(true);
  });

  it('does not turn an ordinary reminder into a Dev task', () => {
    expect(detectDevTaskIntent('Напомни завтра проверить логи dev mode')).toMatchObject({
      action: 'none',
    });
  });

  it('does not turn a web search request into a Dev task', () => {
    expect(detectDevTaskIntent('Найди в интернете ошибку в новом проекте X')).toMatchObject({
      action: 'none',
    });
  });

  it('detects an explicit transfer command', () => {
    expect(detectDevTaskIntent('Перенеси в Dev задачу про логи')).toMatchObject({
      action: 'transfer',
      explicit: true,
      query: 'логи',
    });
  });
});

describe('explicit Dev task creation', () => {
  it('creates a draft task directly from an explicit chat command', async () => {
    const task = await createDevTaskFromChat({
      userId: USER_ID,
      content: 'проверь логи dev mode и улучши обработку ошибок',
      repository: 'newlove',
      conversationId: '01ea10a0-e70a-411e-85fb-e213de4cd0a0',
      originalMessage: 'Создай задачу в Dev: проверь логи dev mode',
    });

    expect(task.status).toBe('draft');
    expect(mockCreate).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        title: 'проверь логи dev mode и улучши обработку ошибок',
        objective: 'проверь логи dev mode и улучши обработку ошибок',
        repository: 'newlove',
        status: 'draft',
        conversationId: '01ea10a0-e70a-411e-85fb-e213de4cd0a0',
      })
    );
  });
});

describe('memory → Dev transfer', () => {
  it('preserves the source record and stores its ID on the task', async () => {
    const result = await transferMemoryRecordToDev({
      store: { mocked: true } as never,
      userId: USER_ID,
      record,
      repository: 'newlove',
      titleOverride: 'Проверить логи Dev Mode и улучшить работу',
      objectiveOverride:
        'Исследовать реальные логи и поведение Dev Mode, выявить ошибки и узкие места, подготовить конкретные исправления.',
      acceptanceCriteria: ['Задача проверена на актуальном commit SHA'],
    });

    expect(result.created).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        title: 'Проверить логи Dev Mode и улучшить работу',
        repository: 'newlove',
        decisionIds: [record.id],
        status: 'draft',
      })
    );
    expect(mockUpdateMemory).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      record.id,
      expect.objectContaining({
        tags: expect.arrayContaining(['dev-mode', 'dev-task']),
        sourceRefs: expect.arrayContaining([
          expect.objectContaining({ type: 'dev_task', taskId: task().id }),
        ]),
        eventReason: 'dev_task_created',
      })
    );
    expect(result.sourceRecord.status).toBe('current');
    expect(mockUpdateMemory.mock.calls[0][2]).not.toHaveProperty('status');
  });

  it('does not create a duplicate when the source is already linked', async () => {
    const existing = task({ status: 'ready' });
    mockFind.mockResolvedValue(existing);

    const result = await transferMemoryRecordToDev({
      store: { mocked: true } as never,
      userId: USER_ID,
      record,
      repository: 'newlove',
    });

    expect(result).toMatchObject({
      created: false,
      alreadyLinked: true,
      task: existing,
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdateMemory).not.toHaveBeenCalled();
  });

  it('reports a Dev API failure instead of claiming success', async () => {
    mockCreate.mockRejectedValue(new Error('DEV_TASKS_TABLE_MISSING'));

    await expect(
      transferMemoryRecordToDev({
        store: { mocked: true } as never,
        userId: USER_ID,
        record,
        repository: 'newlove',
      })
    ).rejects.toThrow('DEV_TASKS_TABLE_MISSING');

    expect(mockUpdateMemory).not.toHaveBeenCalled();
  });
});
