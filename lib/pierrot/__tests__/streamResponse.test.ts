/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { createPierrotStreamResponse } from '../streamResponse';
import { PIERROT_STREAM_VERSION } from '../streamProtocol';

const accepted = {
  type: 'accepted' as const,
  version: PIERROT_STREAM_VERSION,
  conversationId: 'c',
  sessionId: 's',
  userMessageId: 'u',
  assistantMessageId: 'a',
};

describe('Pierrot SSE response helper', () => {
  it('closes the stream when the client disconnects', async () => {
    const abort = new AbortController();
    const request = new Request('http://localhost/api/pierrot-web', {
      signal: abort.signal,
    });
    let receivedSignal: AbortSignal | null = null;
    const response = createPierrotStreamResponse({
      request,
      run: async (emit, signal) => {
        receivedSignal = signal;
        emit(accepted);
        await new Promise((resolve) => setTimeout(resolve, 50));
        emit({
          type: 'delta',
          version: PIERROT_STREAM_VERSION,
          text: 'late',
        });
      },
    });

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const first = await reader!.read();
    expect(new TextDecoder().decode(first.value)).toContain('event: accepted');

    abort.abort();
    const second = await reader!.read();
    expect(second.done).toBe(true);
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('emits a sanitized interrupted error when the producer throws after output', async () => {
    const request = new Request('http://localhost/api/pierrot-web');
    const response = createPierrotStreamResponse({
      request,
      run: async (emit) => {
        emit(accepted);
        emit({
          type: 'delta',
          version: PIERROT_STREAM_VERSION,
          text: 'partial',
        });
        throw new Error('raw provider secret must not leak');
      },
    });

    const text = await response.text();
    expect(text).toContain('event: delta');
    expect(text).toContain('event: error');
    expect(text).toContain('"interrupted":true');
    expect(text).not.toContain('raw provider secret');
  });
});
