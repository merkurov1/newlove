/** @jest-environment node */

const mockUserId = '11111111-1111-4111-8111-111111111111';

let mockGithubConfigured = true;

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => ({ id: mockUserId })),
}));

jest.mock('@/lib/rateLimit', () => ({
  getClientIp: () => '127.0.0.1',
}));

jest.mock('@/lib/pierrot/rateLimit', () => ({
  checkPierrotRateLimit: jest.fn(async () => null),
}));

const mockBaseRepository = {
  key: 'newlove',
  label: 'newlove',
  owner: 'merkurov1',
  repo: 'newlove',
  fullName: 'merkurov1/newlove',
  defaultBranch: 'main',
  workBranch: 'main',
  description: 'Test repository.',
};

jest.mock('@/lib/pierrot/dev/repositories', () => ({
  getDevRepositoryConfigs: () => [
    { ...mockBaseRepository, configured: mockGithubConfigured },
    {
      ...mockBaseRepository,
      key: 'pierrot',
      label: 'Pierrot',
      fullName: 'merkurov1/Pierrot',
      configured: mockGithubConfigured,
    },
  ],
  resolveDevRepository: (value: unknown) => {
    if (value === 'unknown') throw new Error('Unknown repository');
    return {
      ...mockBaseRepository,
      key: value === 'pierrot' ? 'pierrot' : 'newlove',
      configured: mockGithubConfigured,
    };
  },
}));

const mockEnsureDevConversation = jest.fn(async () => ({
  id: 'conv_12345678',
  sessionId: 'sess_12345678',
  created: false,
}));
const mockAppendDevMessage = jest.fn(async () => undefined);
const mockLoadDevHistory = jest.fn(async () => []);

jest.mock('@/lib/pierrot/dev/store', () => ({
  ensureDevConversation: (...args: unknown[]) => mockEnsureDevConversation(...args),
  appendDevMessage: (...args: unknown[]) => mockAppendDevMessage(...args),
  loadDevHistory: (...args: unknown[]) => mockLoadDevHistory(...args),
}));

const mockBeginDevRequest = jest.fn(async () => ({
  available: true,
  duplicate: false,
  request: null,
}));
const mockCompleteDevRequest = jest.fn(async () => undefined);
const mockFailDevRequest = jest.fn(async () => undefined);

jest.mock('@/lib/pierrot/dev/requests', () => ({
  beginDevRequest: (...args: unknown[]) => mockBeginDevRequest(...args),
  completeDevRequest: (...args: unknown[]) => mockCompleteDevRequest(...args),
  failDevRequest: (...args: unknown[]) => mockFailDevRequest(...args),
}));

const mockCallDevModel = jest.fn();

jest.mock('@/lib/pierrot/dev/llm', () => {
  class DevPartialCompletionError extends Error {
    result: unknown;
    constructor(result: unknown) {
      super('partial');
      this.result = result;
    }
  }

  class DevProviderError extends Error {
    readonly code = 'DEV_PROVIDER_FAILED';
    toolTrace: unknown[];
    events: unknown[];
    constructor(message: string, _attempts: unknown[], toolTrace: unknown[], events: unknown[]) {
      super(message);
      this.toolTrace = toolTrace;
      this.events = events;
    }
  }

  return {
    callDevModel: (...args: unknown[]) => mockCallDevModel(...args),
    isDevModelConfigured: () => true,
    DevPartialCompletionError,
    DevProviderError,
  };
});

const mockLlm = jest.requireMock('@/lib/pierrot/dev/llm') as {
  DevProviderError: new (
    message: string,
    attempts: unknown[],
    toolTrace: unknown[],
    events: unknown[]
  ) => Error;
};

import { POST } from '../route';
import type { DevDiagnosis, DevToolTraceEntry } from '@/lib/pierrot/dev/types';

const diagnosis: DevDiagnosis = {
  taskSummary: 'Fix preview rendering',
  repository: 'newlove',
  ref: 'main',
  commitSha: 'a'.repeat(40),
  inspectedFiles: [{ path: 'components/FlowPreview.tsx', startLine: 1, endLine: 10 }],
  confirmedFindings: [],
  likelyFindings: [],
  hypotheses: [],
  recommendedFix: 'Preserve the URL.',
  risks: [],
  tests: [],
  changes: { backend: [], frontend: [], database: [], mobile: [] },
  shouldCreateTask: true,
  confidence: 'confirmed',
};

const trace: DevToolTraceEntry = {
  name: 'read_file_range',
  repository: 'merkurov1/newlove',
  ok: true,
  durationMs: 3,
  summary: 'components/FlowPreview.tsx:1-10',
  meta: {
    repository: 'merkurov1/newlove',
    branch: 'main',
    commitSha: 'a'.repeat(40),
    complete: true,
    source: 'github',
    paths: ['components/FlowPreview.tsx'],
    ranges: [{ path: 'components/FlowPreview.tsx', startLine: 1, endLine: 10 }],
  },
};

function request(message = 'Проверь Flow preview', repository = 'newlove') {
  return new Request('http://localhost/api/admin/pierrot/dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, repository }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGithubConfigured = true;
  mockBeginDevRequest.mockResolvedValue({
    available: true,
    duplicate: false,
    request: null,
  });
  mockCallDevModel.mockReset();
});

describe('Dev API route', () => {
  it('reports missing GitHub access before model execution', async () => {
    mockGithubConfigured = false;

    const response = await POST(request());
    const body = (await response.json()) as { code?: string; error?: string };

    expect(response.status).toBe(503);
    expect(body.code).toBe('DEV_GITHUB_UNAVAILABLE');
    expect(mockCallDevModel).not.toHaveBeenCalled();
    expect(mockEnsureDevConversation).not.toHaveBeenCalled();
  });

  it('rejects an unknown repository before model execution', async () => {
    const response = await POST(request('Inspect', 'unknown'));
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(400);
    expect(body.code).toBe('DEV_REPO_INVALID');
    expect(mockCallDevModel).not.toHaveBeenCalled();
  });

  it('returns the validated diagnosis and persists it with the request', async () => {
    mockCallDevModel.mockResolvedValueOnce({
      reply: 'Причина найдена.',
      provider: 'deepseek',
      model: 'deepseek-chat',
      toolTrace: [trace],
      events: [],
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      requestId: 'req_12345678',
      status: 'completed',
      latencyMs: 1200,
      sideEffects: [],
      diagnosis,
    });

    const response = await POST(request());
    const body = (await response.json()) as { diagnosis?: DevDiagnosis; status?: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe('completed');
    expect(body.diagnosis).toMatchObject({ taskSummary: 'Fix preview rendering' });
    expect(mockCompleteDevRequest).toHaveBeenCalledWith(
      expect.objectContaining({ diagnosis, toolTrace: [trace] })
    );
  });

  it('returns the partial tool trace when the provider fails', async () => {
    mockCallDevModel.mockRejectedValueOnce(
      new mockLlm.DevProviderError('Provider failed', [], [trace], [])
    );

    const response = await POST(request());
    const body = (await response.json()) as {
      code?: string;
      toolTrace?: DevToolTraceEntry[];
    };

    expect(response.status).toBe(500);
    expect(body.code).toBe('DEV_PROVIDER_FAILED');
    expect(body.toolTrace).toEqual([trace]);
    expect(mockFailDevRequest).toHaveBeenCalledWith(
      expect.objectContaining({ toolTrace: [trace] })
    );
  });
});
