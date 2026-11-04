/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import {
  PIERROT_STREAM_VERSION,
  PierrotStreamProtocolError,
  consumePierrotEventStream,
  encodePierrotStreamEvent,
  parsePierrotStreamEvent,
  type PierrotStreamEvent,
} from '../streamProtocol';

function responseFrom(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

describe('Pierrot stream protocol', () => {
  it('round-trips typed events through SSE framing', () => {
    const event: PierrotStreamEvent = {
      type: 'delta',
      version: PIERROT_STREAM_VERSION,
      text: 'Привет',
    };
    const encoded = new TextDecoder().decode(encodePierrotStreamEvent(event));

    expect(encoded).toContain('event: delta');
    expect(encoded).toContain(`data: ${JSON.stringify(event)}`);
    expect(parsePierrotStreamEvent(JSON.stringify(event))).toEqual(event);
  });

  it('dispatches deltas split across network chunks', async () => {
    const deltaA: PierrotStreamEvent = {
      type: 'delta',
      version: PIERROT_STREAM_VERSION,
      text: 'Hello ',
    };
    const deltaB: PierrotStreamEvent = {
      type: 'delta',
      version: PIERROT_STREAM_VERSION,
      text: 'world',
    };
    const frames = [
      new TextDecoder().decode(encodePierrotStreamEvent(deltaA)),
      new TextDecoder().decode(encodePierrotStreamEvent(deltaB)),
    ];
    const split = Math.floor(frames[0].length / 2);
    const onDelta = jest.fn();

    await consumePierrotEventStream(
      responseFrom([
        frames[0].slice(0, split),
        frames[0].slice(split) + frames[1].slice(0, 7),
        frames[1].slice(7),
      ]),
      { onDelta }
    );

    expect(onDelta.mock.calls.map(([text]) => text)).toEqual(['Hello ', 'world']);
  });

  it('dispatches sources and completed payloads without rewriting them', async () => {
    const sources: PierrotStreamEvent = {
      type: 'sources',
      version: PIERROT_STREAM_VERSION,
      payload: { rag: { outcome: 'relevant_results' } },
    };
    const completed: PierrotStreamEvent = {
      type: 'completed',
      version: PIERROT_STREAM_VERSION,
      payload: { reply: 'Final answer' },
    };
    const onSources = jest.fn();
    const onCompleted = jest.fn();

    await consumePierrotEventStream(
      responseFrom([
        new TextDecoder().decode(encodePierrotStreamEvent(sources)),
        new TextDecoder().decode(encodePierrotStreamEvent(completed)),
      ]),
      { onSources, onCompleted }
    );

    expect(onSources).toHaveBeenCalledWith(sources.payload);
    expect(onCompleted).toHaveBeenCalledWith(completed.payload);
  });

  it('rejects malformed JSON and unsupported versions', async () => {
    expect(() => parsePierrotStreamEvent('{')).toThrow(PierrotStreamProtocolError);
    expect(() =>
      parsePierrotStreamEvent(JSON.stringify({ type: 'delta', version: 99, text: 'x' }))
    ).toThrow(PierrotStreamProtocolError);
  });

  it('ignores unknown additive event types', () => {
    expect(
      parsePierrotStreamEvent(
        JSON.stringify({ type: 'future_event', version: PIERROT_STREAM_VERSION })
      )
    ).toBeNull();
  });

  it('delivers structured errors', async () => {
    const error: PierrotStreamEvent = {
      type: 'error',
      version: PIERROT_STREAM_VERSION,
      error: 'Provider interrupted.',
      code: 'stream_interrupted',
      retryable: true,
      interrupted: true,
    };
    const onError = jest.fn();

    await consumePierrotEventStream(
      responseFrom([new TextDecoder().decode(encodePierrotStreamEvent(error))]),
      { onError }
    );

    expect(onError).toHaveBeenCalledWith(error);
  });
});
