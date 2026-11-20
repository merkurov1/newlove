/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/ai/gemini', () => ({
  generateGeminiText: jest.fn(),
  streamGeminiText: jest.fn(),
  isGeminiConfigured: jest.fn(),
}));

jest.mock('@/lib/operations/circuitBreaker', () => ({
  assertCircuitClosed: jest.fn(async () => undefined),
  recordCircuitFailure: jest.fn(async () => undefined),
  recordCircuitSuccess: jest.fn(async () => undefined),
}));

jest.mock('openai', () => {
  const create = jest.fn();
  return {
    __esModule: true,
    __create: create,
    default: jest.fn(() => ({
      chat: { completions: { create } },
    })),
  };
});

const gemini = require('@/lib/ai/gemini') as {
  generateGeminiText: jest.Mock;
  streamGeminiText: jest.Mock;
  isGeminiConfigured: jest.Mock;
};
const openaiModule = require('openai') as { __create: jest.Mock };
const { callPierrotModel, streamPierrotModel } = require('../model') as typeof import('../model');

process.env.DEEPSEEK_API_KEY = 'test-deepseek';
process.env.OPENROUTER_API_KEY = 'test-openrouter';

const messages = [{ role: 'user' as const, content: 'hello' }];

function completion(content: string, usage?: Record<string, number>) {
  return {
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: usage ?? { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
  };
}

function streamWithUsage(text: string, usage: Record<string, number>) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: text } }] };
      // OpenAI-compatible providers send the usage frame with empty choices.
      yield { choices: [], usage };
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  gemini.isGeminiConfigured.mockReturnValue(false);
});

describe('provider routing telemetry', () => {
  it('records Gemini failure and DeepSeek success as two attempts with one retry', async () => {
    gemini.isGeminiConfigured.mockReturnValue(true);
    gemini.generateGeminiText.mockRejectedValueOnce(new Error('gemini_http_429'));
    openaiModule.__create.mockResolvedValueOnce(completion('DeepSeek answer'));

    const seen: Array<{ provider: string; attempt: number; isRetry: boolean; ok: boolean }> = [];
    const result = await callPierrotModel('system', messages, false, {
      onAttempt: (attempt) => {
        seen.push({
          provider: attempt.provider,
          attempt: attempt.attempt,
          isRetry: attempt.isRetry,
          ok: attempt.ok,
        });
      },
    });

    expect(result.provider).toBe('deepseek');
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(seen).toEqual([
      { provider: 'gemini', attempt: 1, isRetry: false, ok: false },
      // A fallback changes provider; it is not a retry of the same provider.
      { provider: 'deepseek', attempt: 2, isRetry: false, ok: true },
    ]);
    expect(result.attempts[1]?.usage.inputTokens).toBe(120);
    expect(result.attempts[1]?.usage.outputTokens).toBe(40);
  });

  it('does not count a disabled primary provider as a failed attempt', async () => {
    openaiModule.__create.mockResolvedValueOnce(completion('Only DeepSeek'));

    const result = await callPierrotModel('system', messages, false);

    expect(result.fallbackUsed).toBe(false);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      provider: 'deepseek',
      attempt: 1,
      isRetry: false,
      fallbackFrom: null,
    });
  });

  it('records all three failed attempts before surfacing the provider error', async () => {
    gemini.isGeminiConfigured.mockReturnValue(true);
    gemini.generateGeminiText.mockRejectedValueOnce(new Error('gemini_http_500'));
    openaiModule.__create
      .mockRejectedValueOnce(Object.assign(new Error('deepseek failed'), { status: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error('openrouter failed'), { status: 502 }));

    const attempts: Array<{ provider: string; ok: boolean; errorCode: string | null }> = [];

    await expect(
      callPierrotModel('system', messages, false, {
        onAttempt: (attempt) => {
          attempts.push({
            provider: attempt.provider,
            ok: attempt.ok,
            errorCode: attempt.errorCode,
          });
        },
      })
    ).rejects.toThrow();

    expect(attempts).toEqual([
      { provider: 'gemini', ok: false, errorCode: 'gemini_http_500' },
      { provider: 'deepseek', ok: false, errorCode: 'http_500' },
      { provider: 'openrouter', ok: false, errorCode: 'http_502' },
    ]);
  });

  it('keeps the system prompt and full history when falling back to DeepSeek', async () => {
    gemini.isGeminiConfigured.mockReturnValue(true);
    gemini.generateGeminiText.mockRejectedValueOnce(new Error('gemini_http_429'));
    openaiModule.__create.mockResolvedValueOnce(completion('DeepSeek answer'));

    const history = [
      { role: 'user' as const, content: 'first question' },
      { role: 'assistant' as const, content: 'first answer' },
      { role: 'user' as const, content: 'follow-up' },
    ];

    const result = await callPierrotModel('SYSTEM_PERSONA', history, false);

    expect(result.providerChain).toEqual(['gemini', 'deepseek']);
    expect(gemini.generateGeminiText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'SYSTEM_PERSONA',
        messages: history,
      })
    );

    const deepseekPayload = openaiModule.__create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(deepseekPayload.messages).toEqual([
      { role: 'system', content: 'SYSTEM_PERSONA' },
      ...history,
    ]);
  });

  it('requests streaming usage from DeepSeek instead of leaving tokens null', async () => {
    openaiModule.__create.mockResolvedValueOnce(
      streamWithUsage('streamed', {
        prompt_tokens: 90,
        completion_tokens: 30,
        total_tokens: 120,
      })
    );

    const seen: Array<{ usageSource: string; input: number | null }> = [];
    const result = await streamPierrotModel('system', messages, false, () => undefined, undefined, {
      onAttempt: (attempt) => {
        seen.push({ usageSource: attempt.usage.usageSource, input: attempt.usage.inputTokens });
      },
    });

    expect(openaiModule.__create).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: true,
        stream_options: { include_usage: true },
      }),
      expect.anything()
    );
    expect(result.usage?.promptTokens).toBe(90);
    expect(result.usage?.completionTokens).toBe(30);
    expect(seen).toEqual([{ usageSource: 'provider_reported', input: 90 }]);
  });
});
