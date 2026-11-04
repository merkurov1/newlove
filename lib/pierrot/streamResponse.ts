import { assertServerOnly } from '@/lib/serverOnly';
import {
  PIERROT_STREAM_VERSION,
  encodePierrotStreamEvent,
  type PierrotStreamEvent,
} from './streamProtocol';

assertServerOnly('lib/pierrot/streamResponse');

export type PierrotStreamEmitter = (event: PierrotStreamEvent) => void;

const STREAM_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
};

/**
 * Creates an SSE response and runs the producer asynchronously.
 *
 * The producer receives an emitter and must emit its own domain events. If it
 * throws, the helper emits a generic interrupted error and closes the stream.
 * Once the client disconnects, late emissions are ignored.
 */
export function createPierrotStreamResponse(input: {
  request: Request;
  run: (emit: PierrotStreamEmitter, signal: AbortSignal) => Promise<void>;
}): Response {
  const encoder = new TextEncoder();
  const lifecycle = new AbortController();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The client may already have cancelled the stream.
        }
      };

      let emitted = false;
      const emit: PierrotStreamEmitter = (event) => {
        if (closed) return;
        if (event.type === 'delta' && event.text.length > 0) emitted = true;
        try {
          controller.enqueue(encodePierrotStreamEvent(event, encoder));
        } catch {
          closed = true;
        }
      };

      const abort = () => {
        lifecycle.abort();
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      if (input.request.signal.aborted) {
        abort();
        return;
      }

      input.request.signal.addEventListener('abort', abort, { once: true });

      try {
        await input.run(emit, lifecycle.signal);
      } catch {
        emit({
          type: 'error',
          version: PIERROT_STREAM_VERSION,
          error: 'The response stream was interrupted.',
          code: 'stream_interrupted',
          retryable: true,
          interrupted: emitted,
        });
      } finally {
        input.request.signal.removeEventListener('abort', abort);
        close();
      }
    },
    cancel() {
      lifecycle.abort();
      closed = true;
    },
  });

  return new Response(stream, { headers: STREAM_HEADERS });
}
