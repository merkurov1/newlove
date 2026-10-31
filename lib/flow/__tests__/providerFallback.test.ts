/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { resetCircuitBreakerState } from '@/lib/operations/circuitBreaker';
import { FlowAIGenerationError, generateFlowContext, type FlowAIItem } from '../ai';

const item: FlowAIItem = {
  id: 'flow-item-1',
  type: 'article',
  title: 'Network memory',
  body_md: 'Infrastructure becomes culture when memory turns into protocol.',
  source_url: null,
  metadata: {},
  lang: 'en',
  rag_allowed: false,
};

const gemini = jest.fn();
const deepseek = jest.fn();
const openrouter = jest.fn();

describe('Flow AI provider failover', () => {
  beforeEach(() => {
    gemini.mockReset();
    deepseek.mockReset();
    openrouter.mockReset();
    resetCircuitBreakerState();
    process.env.GEMINI_API_KEY = 'test-gemini';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek';
    process.env.OPENROUTER_API_KEY = 'test-openrouter';
    process.env.OPS_CIRCUIT_FAILURE_THRESHOLD = '5';
  });

  it('uses Gemini when it succeeds', async () => {
    gemini.mockResolvedValueOnce({
      content: '[EN] Gemini context.\n---\n[RU] Контекст Gemini.',
      model: 'gemini-3.5-flash',
      provider: 'gemini',
      latencyMs: 12,
    });

    const result = await generateFlowContext(item, {
      ragEnabled: false,
      providers: { gemini, deepseek, openrouter },
    });

    expect(result).toMatchObject({
      content: '[EN] Gemini context.\n---\n[RU] Контекст Gemini.',
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      fallbackUsed: false,
    });
    expect(deepseek).not.toHaveBeenCalled();
  });

  it('falls back to DeepSeek Direct when Gemini returns 429', async () => {
    gemini.mockRejectedValueOnce(new Error('gemini_http_429'));
    deepseek.mockResolvedValueOnce({
      content: '[EN] DeepSeek context.\n---\n[RU] Контекст DeepSeek.',
      model: 'deepseek-chat',
      provider: 'deepseek',
    });

    const result = await generateFlowContext(item, {
      ragEnabled: false,
      providers: { gemini, deepseek, openrouter },
    });

    expect(result).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-chat',
      fallbackUsed: true,
    });
    expect(deepseek).toHaveBeenCalledTimes(1);
  });

  it('keeps the same prompt when switching providers', async () => {
    gemini.mockRejectedValueOnce(new Error('gemini_timeout'));
    deepseek.mockResolvedValueOnce({
      content: 'ok',
      model: 'deepseek-chat',
      provider: 'deepseek',
    });

    await generateFlowContext(item, {
      ragEnabled: false,
      providers: { gemini, deepseek, openrouter },
    });

    expect(deepseek).toHaveBeenCalledWith(String(gemini.mock.calls[0][0].prompt));
  });

  it('uses Gemini again after the circuit recovers', async () => {
    gemini
      .mockRejectedValueOnce(new Error('gemini_http_503'))
      .mockResolvedValueOnce({
        content: '[EN] Gemini recovered.',
        model: 'gemini-3.5-flash',
        provider: 'gemini',
        latencyMs: 9,
      });
    deepseek.mockResolvedValueOnce({
      content: 'deepseek answer',
      model: 'deepseek-chat',
      provider: 'deepseek',
    });

    const first = await generateFlowContext(item, {
      ragEnabled: false,
      providers: { gemini, deepseek, openrouter },
    });
    expect(first?.provider).toBe('deepseek');

    resetCircuitBreakerState();
    const second = await generateFlowContext(item, {
      ragEnabled: false,
      providers: { gemini, deepseek, openrouter },
    });
    expect(second?.provider).toBe('gemini');
  });

  it('throws a controlled error when every provider fails', async () => {
    gemini.mockRejectedValueOnce(new Error('gemini down'));
    deepseek.mockRejectedValueOnce(new Error('deepseek down'));
    openrouter.mockRejectedValueOnce(new Error('openrouter down'));

    await expect(
      generateFlowContext(item, {
        ragEnabled: false,
        providers: { gemini, deepseek, openrouter },
      })
    ).rejects.toBeInstanceOf(FlowAIGenerationError);
  });
});
