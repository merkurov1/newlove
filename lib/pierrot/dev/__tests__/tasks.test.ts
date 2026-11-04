/** @jest-environment node */

jest.mock('@octokit/rest', () => ({
  Octokit: class Octokit {},
}));

type QueryResult = { data: unknown; error: unknown };

const queue: QueryResult[] = [];
let lastInsert: Record<string, unknown> | null = null;
let lastUpdate: Record<string, unknown> | null = null;
let lastFilters: Array<[string, unknown]> = [];

function nextResult(): Promise<QueryResult> {
  return Promise.resolve(queue.shift() || { data: null, error: null });
}

function makeQuery() {
  const query: Record<string, unknown> = {};

  for (const method of ['select', 'eq', 'order', 'limit']) {
    query[method] = jest.fn((...args: unknown[]) => {
      if (method === 'eq') lastFilters.push([String(args[0]), args[1]]);
      return query;
    });
  }

  query.insert = jest.fn((value: Record<string, unknown>) => {
    lastInsert = value;
    return query;
  });
  query.update = jest.fn((value: Record<string, unknown>) => {
    lastUpdate = value;
    return query;
  });
  query.single = jest.fn(() => nextResult());
  query.maybeSingle = jest.fn(() => nextResult());
  query.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
    nextResult().then(resolve, reject);

  return query;
}

const mockStore = {
  from: jest.fn(() => makeQuery()),
};

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: () => mockStore,
}));

import {
  attachDevTaskResult,
  buildTaskPrompt,
  createDevTask,
  createTaskInput,
  listDevTasks,
  updateDevTask,
} from '../tasks';
import type { DevTask } from '../types';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';

function taskRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: TASK_ID,
    user_id: USER_ID,
    repository: 'newlove',
    base_ref: 'main',
    base_commit: 'a'.repeat(40),
    task: 'Dev Mode reliability',
    title: 'Dev Mode reliability',
    objective: 'Make Dev Mode honest',
    context: 'Owner workspace',
    current_behavior: 'Fallback replays tools',
    required_behavior: 'No replay after side effects',
    technical_plan: 'Track side effects',
    prompt_text: '# task',
    affected_files: ['lib/pierrot/dev/llm.ts'],
    backend_changes: ['llm'],
    frontend_changes: ['DevWorkspace'],
    mobile_changes: [],
    database_changes: ['requests'],
    migrations: ['2026-11-18.sql'],
    tests: ['jest'],
    acceptance_criteria: ['No replay'],
    security_constraints: ['read-only'],
    unverified: ['manual test'],
    conversation_id: 'conv_12345678',
    status: 'draft',
    verification_status: null,
    verification_notes: '',
    pull_requests: [],
    result_commit: null,
    result_notes: '',
    verified_at: null,
    created_at: '2026-11-04T10:00:00Z',
    updated_at: '2026-11-04T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  queue.length = 0;
  lastInsert = null;
  lastUpdate = null;
  lastFilters = [];
  jest.clearAllMocks();
  process.env.GITHUB_TOKEN = 'test-token';
});

describe('Task Studio prompt generation', () => {
  it('produces a complete OpenCode prompt with repository and safety constraints', () => {
    const task = taskRow() as unknown as DevTask;
    const prompt = buildTaskPrompt({
      ...task,
      id: TASK_ID,
      userId: USER_ID,
      baseRef: 'main',
      baseCommit: 'a'.repeat(40),
      affectedFiles: ['lib/pierrot/dev/llm.ts'],
      acceptanceCriteria: ['No replay after side effects'],
      tests: ['npm test'],
      unverified: ['manual browser check'],
      status: 'ready',
      verificationStatus: null,
      verificationNotes: '',
      pullRequests: [],
      resultCommit: null,
      resultNotes: '',
      verifiedAt: null,
      createdAt: '',
      updatedAt: '',
      promptText: '',
    });

    expect(prompt).toContain('# ENGINEERING TASK — Dev Mode reliability');
    expect(prompt).toContain('Repository: newlove');
    expect(prompt).toContain('## Acceptance criteria');
    expect(prompt).toContain('No replay after side effects');
    expect(prompt).toContain('Never write directly to the default branch');
    expect(prompt).toContain('Do not claim that a test, build or check passed');
  });

  it('normalizes input and rejects unknown statuses', () => {
    const input = createTaskInput({
      title: '  Task  ',
      affectedFiles: [' a ', '', 42 as unknown as string],
      status: 'unknown' as never,
    });

    expect(input.title).toBe('Task');
    expect(input.affectedFiles).toEqual(['a']);
    expect(input.status).toBe('draft');
  });
});

describe('Task Studio persistence', () => {
  it('creates a task in pierrot_dev_prompts with a generated prompt', async () => {
    queue.push({ data: taskRow(), error: null });

    const task = await createDevTask(USER_ID, {
      title: 'Dev Mode reliability',
      objective: 'Make Dev Mode honest',
      repository: 'newlove',
      baseRef: 'main',
      acceptanceCriteria: ['No replay'],
      conversationId: 'conv_12345678',
    });

    expect(task.id).toBe(TASK_ID);
    expect(mockStore.from).toHaveBeenCalledWith('pierrot_dev_prompts');
    expect(lastInsert).toMatchObject({
      task: 'Dev Mode reliability',
      status: 'draft',
      repository: 'newlove',
      conversation_id: 'conv_12345678',
    });
    expect(String(lastInsert?.prompt_text)).toContain('# ENGINEERING TASK');
  });

  it('updates a task and rebuilds its prompt', async () => {
    queue.push({ data: taskRow(), error: null });
    queue.push({
      data: taskRow({
        title: 'Updated task',
        status: 'ready',
        prompt_text: '# ENGINEERING TASK — Updated task',
      }),
      error: null,
    });

    const updated = await updateDevTask(USER_ID, TASK_ID, {
      title: 'Updated task',
      status: 'ready',
    });

    expect(updated?.title).toBe('Updated task');
    expect(lastUpdate).toMatchObject({ task: 'Updated task', status: 'ready' });
    expect(String(lastUpdate?.prompt_text)).toContain('Updated task');
  });

  it('lists tasks scoped to the owner', async () => {
    queue.push({ data: [taskRow()], error: null });

    const result = await listDevTasks(USER_ID, 20);

    expect(result.tasks).toHaveLength(1);
    expect(result.migrationRequired).toBe(false);
    expect(lastFilters).toEqual([['user_id', USER_ID]]);
  });

  it('reports a missing task table instead of returning fake tasks', async () => {
    queue.push({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    });

    const result = await listDevTasks(USER_ID, 20);
    expect(result.tasks).toEqual([]);
    expect(result.migrationRequired).toBe(true);
  });

  it('attaches a result and verification status', async () => {
    queue.push({ data: taskRow(), error: null });
    queue.push({
      data: taskRow({
        status: 'review',
        result_commit: 'b'.repeat(40),
        verification_status: 'not_verified',
      }),
      error: null,
    });

    const task = await attachDevTaskResult({
      userId: USER_ID,
      taskId: TASK_ID,
      resultCommit: 'b'.repeat(40),
      verificationStatus: 'not_verified',
      status: 'review',
    });

    expect(task?.resultCommit).toBe('b'.repeat(40));
    expect(task?.verificationStatus).toBe('not_verified');
  });
});
