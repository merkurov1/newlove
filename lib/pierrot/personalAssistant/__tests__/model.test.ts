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
  isGeminiConfigured: jest.Mock;
};
const openaiModule = require('openai') as { __create: jest.Mock };
const { callPersonalAssistantModel, PERSONAL_ASSISTANT_PROVIDER_ORDER } =
  require('../../model') as typeof import('../../model');

process.env.DEEPSEEK_API_KEY = 'test-deepseek';
process.env.OPENROUTER_API_KEY = 'test-openrouter';

const messages = [{ role: 'user' as const, content: 'hello' }];

function completion(content: string) {
  return {
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  gemini.isGeminiConfigured.mockReturnValue(false);
});

describe('personal assistant provider policy', () => {
  it('selects DeepSeek first', async () => {
    expect(PERSONAL_ASSISTANT_PROVIDER_ORDER).toEqual(['deepseek', 'openrouter', 'gemini']);
    openaiModule.__create.mockResolvedValueOnce(completion('DeepSeek answer'));

    const result = await callPersonalAssistantModel('SYSTEM_PERSONA', messages);

    expect(result.provider).toBe('deepseek');
    expect(result.fallbackUsed).toBe(false);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ provider: 'deepseek', attempt: 1 });
  });

  it('falls back to OpenRouter DeepSeek with the same persona prompt', async () => {
    openaiModule.__create
      .mockRejectedValueOnce(Object.assign(new Error('deepseek failed'), { status: 500 }))
      .mockResolvedValueOnce(completion('OpenRouter answer'));

    const result = await callPersonalAssistantModel('SYSTEM_PERSONA', messages);

    expect(result.provider).toBe('openrouter');
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts.map((attempt) => attempt.provider)).toEqual(['deepseek', 'openrouter']);
    expect(result.attempts[1]).toMatchObject({ fallbackFrom: 'deepseek' });

    const firstPayload = openaiModule.__create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const secondPayload = openaiModule.__create.mock.calls[1]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(firstPayload.messages[0]).toEqual({ role: 'system', content: 'SYSTEM_PERSONA' });
    expect(secondPayload.messages[0]).toEqual({ role: 'system', content: 'SYSTEM_PERSONA' });
  });

  it('uses Gemini only as the final fallback and keeps the neutral persona', async () => {
    gemini.isGeminiConfigured.mockReturnValue(true);
    gemini.generateGeminiText.mockResolvedValueOnce({
      content: 'Gemini fallback answer',
      model: 'gemini-3.5-flash',
      finishReason: 'stop',
      usage: null,
    });
    openaiModule.__create
      .mockRejectedValueOnce(Object.assign(new Error('deepseek failed'), { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error('openrouter failed'), { status: 502 }));

    const result = await callPersonalAssistantModel('SYSTEM_PERSONA', messages);

    expect(result.provider).toBe('gemini');
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts.map((attempt) => attempt.provider)).toEqual([
      'deepseek',
      'openrouter',
      'gemini',
    ]);
    expect(gemini.generateGeminiText).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'SYSTEM_PERSONA' })
    );
  });

  it('attributes a provider timeout to the last provider without logging secrets', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const secret = 'SECRET_PROMPT: private user text';

    openaiModule.__create
      .mockRejectedValueOnce(
        Object.assign(new Error(`Request timed out. ${secret}`), {
          name: 'APIConnectionTimeoutError',
        })
      )
      .mockRejectedValueOnce(
        Object.assign(new Error(`Request timed out. ${secret}`), {
          name: 'APIConnectionTimeoutError',
        })
      );

    await expect(callPersonalAssistantModel('SYSTEM_PERSONA', messages)).rejects.toMatchObject({
      pierrotProvider: 'openrouter',
      pierrotProviderCode: 'provider_timeout',
    });

    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Request timed out');
    warn.mockRestore();
  });
});
