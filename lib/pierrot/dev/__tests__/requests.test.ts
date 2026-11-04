/** @jest-environment node */

type QueryResult = { data?: unknown; error?: unknown };

const queue: QueryResult[] = [];
const lastUpdates: Array<Record<string, unknown>> = [];

function nextResult(): Promise<QueryResult> {
  return Promise.resolve(queue.shift() || { data: null, error: null });
}

function makeQuery() {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    query[method] = jest.fn(() => query);
  }
  query.insert = jest.fn(() => query);
  query.update = jest.fn((value: Record<string, unknown>) => {
    lastUpdates.push(value);
    return query;
  });
  query.maybeSingle = jest.fn(() => nextResult());
  query.single = jest.fn(() => nextResult());
  query.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
    nextResult().then(resolve, reject);
  return query;
}

const mockStore = { from: jest.fn(() => makeQuery()) };

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: () => mockStore,
}));

import {
  beginDevRequest,
  completeDevRequest,
  isDevRequestStoreAvailable,
  loadDevRequestTraces,
} from '../requests';

const CONVERSATION_ID = 'conv_12345678';
const REQUEST_ID = 'req_12345678';
const USER_ID = '11111111-1111-4111-8111-111111111111';

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    request_id: REQUEST_ID,
    conversation_id: CONVERSATION_ID,
    user_id: USER_ID,
    idempotency_key: REQUEST_ID,
    status: 'running',
    provider: null,
    model: null,
    response_text: null,
    response_message_id: null,
    latency_ms: null,
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    tool_trace: [],
    events: [],
    side_effects: [],
    error_code: null,
    error_message: null,
    started_at: '2026-11-04T10:00:00Z',
    finished_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  queue.length = 0;
  lastUpdates.length = 0;
  jest.clearAllMocks();
});

describe('request idempotency', () => {
  it('starts a new request once', async () => {
    queue.push({ error: null });

    const result = await beginDevRequest({
      requestId: REQUEST_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      idempotencyKey: REQUEST_ID,
      message: 'inspect',
    });

    expect(result.available).toBe(true);
    expect(result.duplicate).toBe(false);
  });

  it('returns the existing request for a repeated idempotency key', async () => {
    queue.push({ error: { code: '23505', message: 'duplicate key' } });
    queue.push({ data: requestRow({ status: 'completed', response_text: 'done' }), error: null });

    const result = await beginDevRequest({
      requestId: REQUEST_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      idempotencyKey: REQUEST_ID,
      message: 'inspect',
    });

    expect(result.available).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(result.request?.status).toBe('completed');
    expect(result.request?.responseText).toBe('done');
  });

  it('degrades safely when the request table is missing', async () => {
    queue.push({ error: { code: '42P01', message: 'relation does not exist' } });

    const result = await beginDevRequest({
      requestId: REQUEST_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      idempotencyKey: REQUEST_ID,
      message: 'inspect',
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe('migration_required');
  });
});

describe('request traces', () => {
  it('persists tool traces, usage and status without secrets', async () => {
    queue.push({ data: null, error: null });

    await completeDevRequest({
      requestId: REQUEST_ID,
      status: 'completed',
      provider: 'deepseek',
      model: 'deepseek-chat',
      reply: 'answer',
      latencyMs: 1234,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      toolTrace: [
        {
          name: 'read_file',
          repository: 'merkurov1/newlove',
          ok: true,
          durationMs: 12,
          summary: 'README.md',
          meta: {
            repository: 'merkurov1/newlove',
            branch: 'main',
            commitSha: 'a'.repeat(40),
            complete: true,
            source: 'github',
          },
        },
      ],
      events: [{ type: 'status', phase: 'reading', label: 'Читаю файлы' }],
      sideEffects: [],
      responseMessageId: 'a_12345678',
    });

    expect(lastUpdates[0]).toMatchObject({
      status: 'completed',
      provider: 'deepseek',
      model: 'deepseek-chat',
      response_text: 'answer',
      latency_ms: 1234,
      total_tokens: 15,
      response_message_id: 'a_12345678',
    });
    expect(JSON.stringify(lastUpdates[0])).not.toContain('GITHUB_TOKEN');
    expect(JSON.stringify(lastUpdates[0])).not.toContain('Authorization');
  });

  it('loads traces and attaches them by assistant message id', async () => {
    queue.push({
      data: [requestRow({ response_message_id: 'a_12345678', tool_trace: [{ name: 'read_file' }] })],
      error: null,
    });

    const traces = await loadDevRequestTraces(CONVERSATION_ID);
    expect(traces.get('a_12345678')?.toolTrace).toEqual([{ name: 'read_file' }]);
  });

  it('reports whether the request store is available', async () => {
    queue.push({ error: null });
    expect(await isDevRequestStoreAvailable()).toBe(true);

    queue.push({ error: { code: '42P01' } });
    expect(await isDevRequestStoreAvailable()).toBe(false);
  });
});
