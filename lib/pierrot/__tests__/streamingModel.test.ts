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
const { streamPierrotModel, PierrotStreamInterruptedError } =
  require('../model') as typeof import('../model');

process.env.DEEPSEEK_API_KEY = 'test-deepseek';
process.env.OPENROUTER_API_KEY = 'test-openrouter';

const messages = [{ role: 'user' as const, content: 'hello' }];

function chunks(...texts: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of texts) {
        yield { choices: [{ delta: { content: text } }] };
      }
    },
  };
}

function failingChunks(text: string) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: text } }] };
      throw new Error('provider stream failed');
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  gemini.isGeminiConfigured.mockReturnValue(false);
});

describe('Pierrot streaming model routing', () => {
  it('streams Gemini tokens when Gemini is configured', async () => {
    gemini.isGeminiConfigured.mockReturnValue(true);
    gemini.streamGeminiText.mockImplementationOnce(
      async ({ onDelta }: { onDelta: (text: string) => void }) => {
        onDelta('Hel');
        onDelta('lo');
        return {
          content: 'Hello',
          model: 'gemini-3.5-flash',
          provider: 'gemini',
          latencyMs: 5,
          emitted: true,
        };
      }
    );

    const deltas: string[] = [];
    const result = await streamPierrotModel('system', messages, false, (text) => deltas.push(text));

    expect(result.provider).toBe('gemini');
    expect(result.reply).toBe('Hello');
    expect(result.fallbackUsed).toBe(false);
    expect(deltas).toEqual(['Hel', 'lo']);
  });

  it('passes the task-aware output budget and timeout to providers', async () => {
    gemini.isGeminiConfigured.mockReturnValue(true);
    gemini.streamGeminiText.mockImplementationOnce(
      async (input: { maxOutputTokens: number; timeoutMs: number; onDelta: (text: string) => void }) => {
        expect(input.maxOutputTokens).toBe(6_000);
        expect(input.timeoutMs).toBe(90_000);
        input.onDelta('Budgeted');
        return {
          content: 'Budgeted',
          model: 'gemini-3.5-flash',
          provider: 'gemini',
          latencyMs: 1,
          emitted: true,
        };
      }
    );

    await streamPierrotModel(
      'system',
      messages,
      false,
      () => undefined,
      undefined,
      { maxOutputTokens: 6_000, timeoutMs: 90_000 }
    );

    expect(gemini.streamGeminiText).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 6_000, timeoutMs: 90_000 })
    );
  });

  it('clamps an unsupported budget before calling DeepSeek', async () => {
    openaiModule.__create.mockResolvedValueOnce(chunks('Ok'));

    await streamPierrotModel(
      'system',
      messages,
      false,
      () => undefined,
      undefined,
      { maxOutputTokens: 20_000, timeoutMs: 90_000 }
    );

    expect(openaiModule.__create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 8_192 }),
      expect.anything()
    );
  });

  it('falls back before the first token when Gemini fails', async () => {
    gemini.isGeminiConfigured.mockReturnValue(true);
    gemini.streamGeminiText.mockRejectedValueOnce(new Error('gemini failed'));
    openaiModule.__create.mockResolvedValueOnce(chunks('Deep', 'Seek'));

    const deltas: string[] = [];
    const result = await streamPierrotModel('system', messages, false, (text) => deltas.push(text));

    expect(result.provider).toBe('deepseek');
    expect(result.reply).toBe('DeepSeek');
    expect(result.fallbackUsed).toBe(true);
    expect(deltas).toEqual(['Deep', 'Seek']);
  });

  it('does not fall back or append a second answer after Gemini emitted text', async () => {
    gemini.isGeminiConfigured.mockReturnValue(true);
    gemini.streamGeminiText.mockImplementationOnce(
      async ({ onDelta }: { onDelta: (text: string) => void }) => {
        onDelta('Partial');
        throw new Error('gemini stream failed');
      }
    );

    const deltas: string[] = [];

    await expect(
      streamPierrotModel('system', messages, false, (text) => deltas.push(text))
    ).rejects.toBeInstanceOf(PierrotStreamInterruptedError);

    expect(deltas).toEqual(['Partial']);
    expect(openaiModule.__create).not.toHaveBeenCalled();
  });

  it('does not fall back after DeepSeek emitted text', async () => {
    openaiModule.__create.mockResolvedValueOnce(failingChunks('Partial'));

    const deltas: string[] = [];

    await expect(
      streamPierrotModel('system', messages, false, (text) => deltas.push(text))
    ).rejects.toBeInstanceOf(PierrotStreamInterruptedError);

    expect(deltas).toEqual(['Partial']);
    expect(openaiModule.__create).toHaveBeenCalledTimes(1);
  });

  it('falls back from DeepSeek to OpenRouter before any token', async () => {
    openaiModule.__create
      .mockRejectedValueOnce(new Error('deepseek failed'))
      .mockResolvedValueOnce(chunks('OpenRouter'));

    const deltas: string[] = [];
    const result = await streamPierrotModel('system', messages, false, (text) => deltas.push(text));

    expect(result.provider).toBe('openrouter');
    expect(result.reply).toBe('OpenRouter');
    expect(result.fallbackUsed).toBe(true);
    expect(deltas).toEqual(['OpenRouter']);
  });

  it('does not start a fallback provider after client cancellation', async () => {
    const abort = new AbortController();
    abort.abort();

    await expect(
      streamPierrotModel('system', messages, false, () => undefined, abort.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(openaiModule.__create).not.toHaveBeenCalled();
  });

  it('rejects empty provider output instead of emitting a successful answer', async () => {
    openaiModule.__create.mockResolvedValueOnce(chunks()).mockResolvedValueOnce(chunks());

    await expect(streamPierrotModel('system', messages, false, () => undefined)).rejects.toThrow();
  });
});
