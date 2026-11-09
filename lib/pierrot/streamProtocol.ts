/**
 * Versioned event protocol for the owner-only Pierrot chat stream.
 *
 * Transport: Server-Sent Events (SSE) over a POST response.
 * Content type: text/event-stream; charset=utf-8.
 *
 * Every event has a `type` and a protocol `version`. Unknown event types are
 * ignored by the client so future additive events do not break an old bundle.
 * Malformed JSON is a protocol error.
 */

export const PIERROT_STREAM_VERSION = 1 as const;

export type PierrotStreamStage = 'retrieving' | 'generating' | 'persisting';

export type PierrotStreamEvent =
  | {
      type: 'accepted';
      version: typeof PIERROT_STREAM_VERSION;
      conversationId: string;
      sessionId: string;
      historyId?: string;
      episodeId?: string;
      userMessageId: string;
      assistantMessageId: string;
    }
  | {
      type: 'status';
      version: typeof PIERROT_STREAM_VERSION;
      stage: PierrotStreamStage;
    }
  | {
      type: 'delta';
      version: typeof PIERROT_STREAM_VERSION;
      text: string;
    }
  | {
      type: 'sources';
      version: typeof PIERROT_STREAM_VERSION;
      payload: Record<string, unknown>;
    }
  | {
      type: 'completed';
      version: typeof PIERROT_STREAM_VERSION;
      payload: Record<string, unknown>;
    }
  | {
      type: 'error';
      version: typeof PIERROT_STREAM_VERSION;
      error: string;
      code: string;
      retryAfter?: number;
      retryable?: boolean;
      interrupted?: boolean;
    };

export type PierrotStreamCallbacks = {
  onAccepted?: (event: Extract<PierrotStreamEvent, { type: 'accepted' }>) => void;
  onStatus?: (event: Extract<PierrotStreamEvent, { type: 'status' }>) => void;
  onDelta?: (text: string) => void;
  onSources?: (payload: Record<string, unknown>) => void;
  onCompleted?: (payload: Record<string, unknown>) => void;
  onError?: (event: Extract<PierrotStreamEvent, { type: 'error' }>) => void;
};

export class PierrotStreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PierrotStreamProtocolError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parsePierrotStreamEvent(raw: string): PierrotStreamEvent | null {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new PierrotStreamProtocolError('malformed_stream_event');
  }

  if (!isRecord(value)) throw new PierrotStreamProtocolError('invalid_stream_event');

  const type = value.type;
  const version = value.version;

  if (version !== PIERROT_STREAM_VERSION) {
    throw new PierrotStreamProtocolError('unsupported_stream_version');
  }

  if (type === 'delta') {
    if (typeof value.text !== 'string') throw new PierrotStreamProtocolError('invalid_delta');
    return { type, version, text: value.text };
  }

  if (type === 'status') {
    if (
      value.stage !== 'retrieving' &&
      value.stage !== 'generating' &&
      value.stage !== 'persisting'
    ) {
      throw new PierrotStreamProtocolError('invalid_status');
    }
    return { type, version, stage: value.stage };
  }

  if (type === 'accepted') {
    if (
      typeof value.conversationId !== 'string' ||
      typeof value.sessionId !== 'string' ||
      typeof value.userMessageId !== 'string' ||
      typeof value.assistantMessageId !== 'string'
    ) {
      throw new PierrotStreamProtocolError('invalid_accepted');
    }
    return {
      type,
      version,
      conversationId: value.conversationId,
      sessionId: value.sessionId,
      ...(typeof value.historyId === 'string' ? { historyId: value.historyId } : {}),
      ...(typeof value.episodeId === 'string' ? { episodeId: value.episodeId } : {}),
      userMessageId: value.userMessageId,
      assistantMessageId: value.assistantMessageId,
    };
  }

  if (type === 'sources') {
    if (!isRecord(value.payload)) throw new PierrotStreamProtocolError('invalid_sources');
    return { type, version, payload: value.payload };
  }

  if (type === 'completed') {
    if (!isRecord(value.payload)) throw new PierrotStreamProtocolError('invalid_completed');
    return { type, version, payload: value.payload };
  }

  if (type === 'error') {
    if (typeof value.error !== 'string' || typeof value.code !== 'string') {
      throw new PierrotStreamProtocolError('invalid_error');
    }
    return {
      type,
      version,
      error: value.error,
      code: value.code,
      ...(typeof value.retryAfter === 'number' ? { retryAfter: value.retryAfter } : {}),
      ...(typeof value.retryable === 'boolean' ? { retryable: value.retryable } : {}),
      ...(typeof value.interrupted === 'boolean' ? { interrupted: value.interrupted } : {}),
    };
  }

  if (typeof type === 'string') return null;

  throw new PierrotStreamProtocolError('invalid_stream_event');
}

export function encodePierrotStreamEvent(
  event: PierrotStreamEvent,
  encoder: TextEncoder = new TextEncoder()
): Uint8Array {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

function dispatchEvent(event: PierrotStreamEvent, callbacks: PierrotStreamCallbacks): void {
  switch (event.type) {
    case 'accepted':
      callbacks.onAccepted?.(event);
      break;
    case 'status':
      callbacks.onStatus?.(event);
      break;
    case 'delta':
      callbacks.onDelta?.(event.text);
      break;
    case 'sources':
      callbacks.onSources?.(event.payload);
      break;
    case 'completed':
      callbacks.onCompleted?.(event.payload);
      break;
    case 'error':
      callbacks.onError?.(event);
      break;
  }
}

function handleFrame(frame: string, callbacks: PierrotStreamCallbacks): void {
  const dataLines: string[] = [];

  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }

  if (dataLines.length === 0) return;

  const event = parsePierrotStreamEvent(dataLines.join('\n'));
  if (event) dispatchEvent(event, callbacks);
}

/**
 * Reads an SSE response and dispatches validated events. The caller owns the
 * AbortController; aborting the request rejects this promise through fetch's
 * reader, which is the expected cancellation path.
 */
export async function consumePierrotEventStream(
  response: Response,
  callbacks: PierrotStreamCallbacks
): Promise<void> {
  if (!response.body) throw new PierrotStreamProtocolError('missing_stream_body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    let done = false;

    while (!done) {
      const read = await reader.read();
      done = read.done;
      if (done) break;

      buffer += decoder.decode(read.value, { stream: true }).replace(/\r\n/g, '\n');

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (frame.trim()) handleFrame(frame, callbacks);
        boundary = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) handleFrame(buffer.replace(/\r\n/g, '\n'), callbacks);
  } finally {
    reader.releaseLock();
  }
}
