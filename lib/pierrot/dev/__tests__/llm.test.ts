/** @jest-environment node */

jest.mock('@octokit/rest', () => ({
  Octokit: class Octokit {},
}));

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: class OpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

jest.mock('../tools', () => {
  const actual = jest.requireActual('../tools');
  return {
    ...actual,
    executeDevTool: jest.fn(),
  };
});

import {
  callDevModel,
  DevPartialCompletionError,
  DevProviderError,
} from '../llm';
import { executeDevTool } from '../tools';
import type { DevToolTraceEntry } from '../types';

const mockExecute = executeDevTool as jest.Mock;

const original = {
  deepseek: process.env.DEEPSEEK_API_KEY,
  openrouter: process.env.OPENROUTER_API_KEY,
  maxToolCalls: process.env.PIERROT_DEV_MAX_TOOL_CALLS,
  toolTimeout: process.env.PIERROT_DEV_TOOL_TIMEOUT_MS,
  requestDeadline: process.env.PIERROT_DEV_REQUEST_DEADLINE_MS,
};

function trace(name = 'get_repo_info'): DevToolTraceEntry {
  return {
    name,
    repository: 'merkurov1/newlove',
    ok: true,
    durationMs: 5,
    summary: 'repo info',
    meta: {
      repository: 'merkurov1/newlove',
      branch: 'main',
      commitSha: 'a'.repeat(40),
      complete: true,
      source: 'github',
    },
  };
}

function toolCall(name = 'get_repo_info'): Record<string, unknown> {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name,
                arguments: JSON.stringify({ repository: 'newlove' }),
              },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
  };
}

function finalAnswer(text: string): Record<string, unknown> {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DEEPSEEK_API_KEY = 'deepseek-test';
  process.env.OPENROUTER_API_KEY = 'openrouter-test';
  process.env.PIERROT_DEV_MAX_TOOL_CALLS = '6';
  delete process.env.PIERROT_DEV_TOOL_TIMEOUT_MS;
  delete process.env.PIERROT_DEV_REQUEST_DEADLINE_MS;
});

afterAll(() => {
  for (const [key, value] of Object.entries({
    DEEPSEEK_API_KEY: original.deepseek,
    OPENROUTER_API_KEY: original.openrouter,
    PIERROT_DEV_MAX_TOOL_CALLS: original.maxToolCalls,
    PIERROT_DEV_TOOL_TIMEOUT_MS: original.toolTimeout,
    PIERROT_DEV_REQUEST_DEADLINE_MS: original.requestDeadline,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('LLM orchestration safety', () => {
  it('falls back to the next provider before any side effect', async () => {
    mockCreate
      .mockRejectedValueOnce(new Error('deepseek unavailable'))
      .mockResolvedValueOnce(finalAnswer('fallback answer'));

    const result = await callDevModel({
      history: [{ role: 'user', content: 'inspect repo' }],
      requestId: 'req_fallback_1',
    });

    expect(result.provider).toBe('openrouter');
    expect(result.reply).toBe('fallback answer');
    expect(result.status).toBe('completed');
  });

  it('does not replay the request after a side effect', async () => {
    mockExecute.mockResolvedValue({
      name: 'get_repo_info',
      ok: true,
      result: {
        repository: 'merkurov1/newlove',
        sideEffect: true,
        complete: true,
      },
      trace: trace(),
    });
    mockCreate
      .mockResolvedValueOnce(toolCall())
      .mockRejectedValueOnce(new Error('provider failed after tool'));

    await expect(
      callDevModel({
        history: [{ role: 'user', content: 'change something' }],
        requestId: 'req_partial_1',
      })
    ).rejects.toBeInstanceOf(DevPartialCompletionError);

    // The first provider made two calls (tool + failure). The fallback
    // provider must never be called.
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('reports a partially completed result with its trace', async () => {
    mockExecute.mockResolvedValue({
      name: 'get_repo_info',
      ok: true,
      result: {
        repository: 'merkurov1/newlove',
        sideEffect: true,
        complete: true,
      },
      trace: trace(),
    });
    mockCreate
      .mockResolvedValueOnce(toolCall())
      .mockRejectedValueOnce(new Error('provider failed after tool'));

    try {
      await callDevModel({
        history: [{ role: 'user', content: 'change something' }],
        requestId: 'req_partial_2',
      });
      throw new Error('Expected a partial completion error.');
    } catch (error) {
      expect(error).toBeInstanceOf(DevPartialCompletionError);
      const partial = (error as DevPartialCompletionError).result;
      expect(partial.status).toBe('partially_completed');
      expect(partial.sideEffects).toHaveLength(1);
      expect(partial.toolTrace).toHaveLength(1);
    }
  });

  it('allows fallback after read-only tools', async () => {
    mockExecute.mockResolvedValue({
      name: 'get_repo_info',
      ok: true,
      result: {
        repository: 'merkurov1/newlove',
        sideEffect: false,
        complete: true,
      },
      trace: trace(),
    });
    mockCreate
      .mockResolvedValueOnce(toolCall())
      .mockRejectedValueOnce(new Error('deepseek failed after read'))
      .mockResolvedValueOnce(finalAnswer('answer from openrouter'));

    const result = await callDevModel({
      history: [{ role: 'user', content: 'read the repo' }],
      requestId: 'req_read_fallback',
    });

    expect(result.provider).toBe('openrouter');
    expect(result.reply).toBe('answer from openrouter');
  });

  it('stops an infinite tool loop', async () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.PIERROT_DEV_MAX_TOOL_CALLS = '2';
    mockExecute.mockResolvedValue({
      name: 'get_repo_info',
      ok: true,
      result: { repository: 'merkurov1/newlove', complete: true },
      trace: trace(),
    });
    mockCreate.mockResolvedValue(toolCall());

    await expect(
      callDevModel({
        history: [{ role: 'user', content: 'loop' }],
        requestId: 'req_loop',
      })
    ).rejects.toMatchObject({
      name: 'DevProviderError',
      attempts: [
        expect.objectContaining({ errorCode: 'DEV_TOOL_LIMIT_EXCEEDED' }),
      ],
    });
  });

  it('bounds a hanging tool and reports a provider failure', async () => {
    process.env.PIERROT_DEV_TOOL_TIMEOUT_MS = '1';
    mockExecute.mockImplementation(() => new Promise(() => {}));
    mockCreate.mockResolvedValue(toolCall());

    await expect(
      callDevModel({
        history: [{ role: 'user', content: 'hang' }],
        requestId: 'req_timeout',
      })
    ).rejects.toBeInstanceOf(DevProviderError);
  });
});
