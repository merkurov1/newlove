/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { assertCircuitClosed, resetCircuitBreakerState } from '@/lib/operations/circuitBreaker';
import { GeminiError, generateGeminiText, streamGeminiText } from '../gemini';

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response;
}

describe('Gemini provider helper', () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousThreshold = process.env.OPS_CIRCUIT_FAILURE_THRESHOLD;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    resetCircuitBreakerState();
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.OPS_CIRCUIT_FAILURE_THRESHOLD = '3';
  });

  it('returns text, pinned model, provider and latency', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: '  gemini answer  ' }] } }],
      })
    );

    const result = await generateGeminiText({
      system: 'system prompt',
      prompt: 'user prompt',
      temperature: 0.2,
      maxOutputTokens: 123,
    });

    expect(result.content).toBe('gemini answer');
    expect(result.model).toBe('gemini-3.5-flash');
    expect(result.provider).toBe('gemini');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('gemini-3.5-flash:generateContent');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe('system prompt');
    expect(body.generationConfig.maxOutputTokens).toBe(123);
  });

  it('rejects an empty response instead of returning blank content', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ candidates: [] }));

    await expect(generateGeminiText({ prompt: 'hello' })).rejects.toMatchObject({
      code: 'gemini_empty_response',
    });
  });

  it('maps HTTP 429 and opens the circuit after repeated failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'quota exceeded' } }, false, 429));

    await expect(generateGeminiText({ prompt: 'one' })).rejects.toBeInstanceOf(GeminiError);
    await expect(generateGeminiText({ prompt: 'two' })).rejects.toMatchObject({
      code: 'gemini_http_429',
    });
    await expect(generateGeminiText({ prompt: 'three' })).rejects.toMatchObject({
      code: 'gemini_http_429',
    });

    await expect(assertCircuitClosed('gemini', null)).rejects.toThrow('circuit_open:gemini');
  });

  it('closes the circuit again after a successful call', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'down' } }, false, 503))
      .mockResolvedValueOnce(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'recovered' }] } }] })
      );

    await expect(generateGeminiText({ prompt: 'one' })).rejects.toBeInstanceOf(GeminiError);
    await expect(generateGeminiText({ prompt: 'two' })).resolves.toMatchObject({
      content: 'recovered',
    });
    await expect(assertCircuitClosed('gemini', null)).resolves.toBeUndefined();
  });

  it('maps an aborted request to a timeout error', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock.mockRejectedValueOnce(abort);

    await expect(generateGeminiText({ prompt: 'slow' })).rejects.toMatchObject({
      code: 'gemini_timeout',
    });
  });

  it('streams Gemini SSE chunks and emits each text delta once', async () => {
    const encoder = new TextEncoder();
    const frames = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Готов"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"о."}]}}]}\n\n',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(frames[0].slice(0, 17)));
        controller.enqueue(encoder.encode(frames[0].slice(17) + frames[1]));
        controller.close();
      },
    });

    fetchMock.mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    const deltas: string[] = [];
    const result = await streamGeminiText({
      prompt: 'hello',
      onDelta: (text) => deltas.push(text),
    });

    expect(result).toMatchObject({
      content: 'Готово.',
      emitted: true,
      provider: 'gemini',
      model: 'gemini-3.5-flash',
    });
    expect(deltas).toEqual(['Готов', 'о.']);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('gemini-3.5-flash:streamGenerateContent?alt=sse');
  });

  it('rejects a malformed Gemini stream frame', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {not-json}\n\n'));
        controller.close();
      },
    });

    fetchMock.mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    await expect(
      streamGeminiText({ prompt: 'hello', onDelta: () => undefined })
    ).rejects.toMatchObject({ code: 'gemini_stream_malformed' });
  });

  it('rejects an empty Gemini stream', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"candidates":[]}\n\n'));
        controller.close();
      },
    });

    fetchMock.mockResolvedValueOnce(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    await expect(
      streamGeminiText({ prompt: 'hello', onDelta: () => undefined })
    ).rejects.toMatchObject({ code: 'gemini_empty_response' });
  });

  it('does not call the provider when the key is missing', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(generateGeminiText({ prompt: 'hello' })).rejects.toMatchObject({
      code: 'gemini_not_configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousThreshold === undefined) delete process.env.OPS_CIRCUIT_FAILURE_THRESHOLD;
    else process.env.OPS_CIRCUIT_FAILURE_THRESHOLD = previousThreshold;
  });
});
