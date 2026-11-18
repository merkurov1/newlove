/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/operations/circuitBreaker', () => ({
  assertCircuitClosed: jest.fn(async () => undefined),
  recordCircuitFailure: jest.fn(async () => undefined),
  recordCircuitSuccess: jest.fn(async () => undefined),
}));

const insert = jest.fn();
jest.mock('@/lib/ai/telemetry', () => ({
  ...(jest.requireActual('@/lib/ai/telemetry') as Record<string, unknown>),
  createTelemetryStore: jest.fn(() => ({
    from: () => ({ insert }),
  })),
}));

const { generateGeminiText } = require('../gemini') as typeof import('../gemini');

function response() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: 'Answer' }] }, finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 20,
        totalTokenCount: 120,
      },
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  insert.mockResolvedValue({ error: null });
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  global.fetch = jest.fn(async () => response()) as unknown as typeof fetch;
});

describe('Gemini provider-level telemetry', () => {
  it('records one row for a non-Pierrot Gemini call', async () => {
    await generateGeminiText({
      prompt: 'test prompt',
      telemetry: { surface: 'flow_issue', requestId: 'job-1' },
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      provider: 'gemini',
      surface: 'flow_issue',
      request_id: 'job-1',
      ok: true,
      input_tokens: 100,
      output_tokens: 20,
      usage_source: 'provider_reported',
    });
  });

  it('records calls without an explicit surface under the unknown surface', async () => {
    await generateGeminiText({ prompt: 'test prompt', telemetry: {} });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      provider: 'gemini',
      surface: 'unknown',
      ok: true,
    });
  });

  it('does not duplicate rows when the Pierrot route owns the attempt chain', async () => {
    await generateGeminiText({
      prompt: 'test prompt',
      telemetry: { skip: true },
    });

    expect(insert).not.toHaveBeenCalled();
  });
});
