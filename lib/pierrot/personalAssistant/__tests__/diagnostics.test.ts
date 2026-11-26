/** @jest-environment node */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  AssistantRequestError,
  classifyAssistantFailure,
  createAssistantCorrelationId,
  logAssistantRequest,
  pierrotCodeForAssistantFailure,
  sanitizeAssistantCorrelationId,
} from '../diagnostics';
import { requestPersonalAssistantReply } from '../gateway';
import { personalAssistantErrorText } from '../language';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function spyLogs() {
  const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  return { info, error };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('personal assistant diagnostics', () => {
  it('classifies a provider timeout and maps it to a retryable user message', () => {
    const error = Object.assign(new Error('Request timed out while calling the provider'), {
      name: 'APIConnectionTimeoutError',
    });

    const details = classifyAssistantFailure(error, { stage: 'provider_request' });

    expect(details).toMatchObject({
      stage: 'provider_request',
      category: 'timeout',
      providerCode: 'provider_timeout',
      retryable: true,
      retryAfterSeconds: 15,
    });
    expect(personalAssistantErrorText('ru', pierrotCodeForAssistantFailure('timeout'))).toBe(
      'Пьеро не успел ответить. Попробуйте ещё раз.'
    );
  });

  it('classifies non-2xx provider responses by status and safe code', () => {
    const error = Object.assign(new Error('upstream rejected the request'), {
      status: 429,
      code: 'rate_limit_exceeded',
      pierrotProvider: 'deepseek',
    });

    const details = classifyAssistantFailure(error, { stage: 'generation' });

    expect(details).toMatchObject({
      stage: 'generation',
      category: 'rate_limited',
      httpStatus: 429,
      provider: 'deepseek',
      providerCode: 'rate_limit_exceeded',
      retryable: true,
      retryAfterSeconds: 30,
    });
  });

  it('classifies malformed provider responses separately from transport errors', () => {
    const details = classifyAssistantFailure(
      new AssistantRequestError({
        stage: 'response_parse',
        category: 'invalid_response',
        httpStatus: 200,
        providerCode: 'provider_malformed_response',
      })
    );

    expect(details).toMatchObject({
      stage: 'response_parse',
      category: 'invalid_response',
      httpStatus: 200,
      retryable: true,
    });
  });

  it('classifies an unexpected internal exception without exposing its message', () => {
    const details = classifyAssistantFailure(new TypeError('boom'));

    expect(details).toMatchObject({
      stage: 'provider_request',
      category: 'internal',
      providerCode: 'provider_internal_error',
      retryable: false,
    });
  });
});

describe('personal assistant telegram gateway', () => {
  const baseInput = {
    siteUrl: 'https://www.example.test',
    senderId: 42,
    messageId: 'tgu_aaaaaaaa',
    userMessageId: 'tgu_aaaaaaaa',
    text: 'private user text',
    correlationId: 'tg_update_1',
  };

  it('returns a successful reply and preserves the correlation id', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        reply: 'safe answer',
        provider: 'deepseek',
        model: 'deepseek-chat',
        requestId: 'tg_update_1',
      })
    ) as unknown as typeof fetch;

    const result = await requestPersonalAssistantReply({ ...baseInput, fetchImpl });

    expect(result).toMatchObject({
      reply: 'safe answer',
      provider: 'deepseek',
      model: 'deepseek-chat',
      requestId: 'tg_update_1',
      httpStatus: 200,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const [, init] = (fetchImpl as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'x-pierrot-request-id': 'tg_update_1' });
  });

  it('maps a request timeout to a retryable timeout error', async () => {
    const fetchImpl = jest.fn(async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    }) as unknown as typeof fetch;

    await expect(
      requestPersonalAssistantReply({ ...baseInput, fetchImpl, timeoutMs: 1_000 })
    ).rejects.toMatchObject({
      name: 'AssistantRequestError',
      stage: 'provider_request',
      category: 'timeout',
      providerCode: 'provider_timeout',
      retryable: true,
    });
  });

  it('maps a non-2xx response to the provider category and status', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse(
        {
          error: 'provider body that must never be logged',
          code: 'AI_UNAVAILABLE',
          provider: 'deepseek',
          providerCode: 'deepseek_http_503',
          requestId: 'tg_update_1',
        },
        503
      )
    ) as unknown as typeof fetch;

    await expect(requestPersonalAssistantReply({ ...baseInput, fetchImpl })).rejects.toMatchObject({
      name: 'AssistantRequestError',
      stage: 'provider_request',
      category: 'unavailable',
      httpStatus: 503,
      provider: 'deepseek',
      providerCode: 'deepseek_http_503',
      retryable: true,
      retryAfterSeconds: 20,
    });
  });

  it('maps a malformed provider response to invalid_response', async () => {
    const fetchImpl = jest.fn(
      async () => new Response('{not-json', { status: 200 })
    ) as unknown as typeof fetch;

    await expect(requestPersonalAssistantReply({ ...baseInput, fetchImpl })).rejects.toMatchObject({
      name: 'AssistantRequestError',
      stage: 'response_parse',
      category: 'invalid_response',
      httpStatus: 200,
      providerCode: 'provider_malformed_response',
      retryable: true,
    });
  });
});

describe('personal assistant log redaction', () => {
  it('logs stage, class, status and duration but never prompts, messages or tokens', () => {
    const { info, error } = spyLogs();
    const secretMessage = 'SECRET_PROMPT: my private diary';
    const secretToken = 'sk-live-super-secret-token';
    const providerBody = 'provider echoed the prompt and token';

    logAssistantRequest({
      correlationId: createAssistantCorrelationId({ updateId: 7, messageId: 9 }),
      stage: 'generation',
      outcome: 'failure',
      durationMs: 123,
      error: Object.assign(new Error(`${secretMessage} ${secretToken} ${providerBody}`), {
        status: 503,
        code: 'upstream_unavailable',
      }),
      details: {
        stage: 'generation',
        category: 'unavailable',
        httpStatus: 503,
        provider: 'deepseek',
        providerCode: 'upstream_unavailable',
        retryable: true,
        retryAfterSeconds: 20,
      },
    });

    expect(error).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(error.mock.calls);
    expect(serialized).toContain('pierrot_assistant_request');
    expect(serialized).toContain('tg_7_9');
    expect(serialized).toContain('generation');
    expect(serialized).toContain('unavailable');
    expect(serialized).toContain('upstream_unavailable');
    expect(serialized).toContain('duration_ms');
    expect(serialized).not.toContain(secretMessage);
    expect(serialized).not.toContain(secretToken);
    expect(serialized).not.toContain(providerBody);
    expect(serialized).not.toContain('private diary');
    expect(info).not.toHaveBeenCalled();
  });

  it('emits a success line without any reply content', () => {
    const { info } = spyLogs();

    logAssistantRequest({
      correlationId: 'tg_success_1',
      stage: 'completed',
      outcome: 'success',
      durationMs: 456,
      httpStatus: 200,
      provider: 'deepseek',
    });

    expect(info).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).toContain('completed');
    expect(serialized).toContain('success');
    expect(serialized).toContain('deepseek');
    expect(serialized).not.toContain('reply');
  });

  it('rejects unsafe correlation ids instead of echoing them', () => {
    expect(sanitizeAssistantCorrelationId('bad id with spaces')).toBeNull();
    expect(sanitizeAssistantCorrelationId('user@example.com')).toBeNull();
    expect(sanitizeAssistantCorrelationId('tg_123_456')).toBe('tg_123_456');
  });
});
