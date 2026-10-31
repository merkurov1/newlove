import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/errors');

/**
 * Classifies a Pierrot/LLM failure into a stable, user-safe contract.
 *
 * The classifier never returns provider messages to the browser. Raw provider
 * details stay in the server log, where the message body is deliberately not
 * written because it may contain prompts or visitor content.
 */

import type { PierrotErrorCode } from '@/lib/pierrot/errorContracts';

export type PierrotFailure = {
  httpStatus: number;
  code: PierrotErrorCode;
  retryAfterSeconds?: number;
};

function readNumericStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const value = (error as { status?: unknown }).status;

  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function readName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function readMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : '';
}

export function classifyPierrotFailure(
  error: unknown,
  options: { aborted?: boolean } = {}
): PierrotFailure {
  if (options.aborted) {
    return { httpStatus: 499, code: 'CLIENT_ABORTED' };
  }

  const name = readName(error).toLowerCase();
  const message = readMessage(error);
  const status = readNumericStatus(error);

  if (message.startsWith('circuit_open:')) {
    return { httpStatus: 503, code: 'AI_TEMPORARILY_UNAVAILABLE', retryAfterSeconds: 60 };
  }

  if (
    name.includes('timeout') ||
    name === 'aborterror' ||
    message.includes('timed out') ||
    message.includes('timeout')
  ) {
    return { httpStatus: 504, code: 'AI_TIMEOUT', retryAfterSeconds: 15 };
  }

  if (message.includes('empty response') || message.includes('empty content')) {
    return { httpStatus: 502, code: 'AI_EMPTY_RESPONSE' };
  }

  if (message.includes('not configured') || message.includes('api_key')) {
    return { httpStatus: 503, code: 'AI_NOT_CONFIGURED' };
  }

  if (status === 401 || status === 403 || status === 404) {
    return { httpStatus: 503, code: 'AI_NOT_CONFIGURED' };
  }

  if (status === 402) {
    return { httpStatus: 503, code: 'AI_QUOTA_EXCEEDED' };
  }

  if (status === 429) {
    return { httpStatus: 429, code: 'AI_RATE_LIMITED', retryAfterSeconds: 30 };
  }

  if (status !== null && status >= 500) {
    return { httpStatus: 503, code: 'AI_UNAVAILABLE', retryAfterSeconds: 20 };
  }

  if (status !== null && status >= 400) {
    return { httpStatus: 502, code: 'AI_UNAVAILABLE' };
  }

  return { httpStatus: 502, code: 'AI_FAILED' };
}

export function logPierrotFailure(input: {
  operation: string;
  failure: PierrotFailure;
  latencyMs: number;
  error: unknown;
  provider?: string | null;
  dependency?: string | null;
}): void {
  const status = readNumericStatus(input.error);

  // Safe fields only: operation, status, latency, error type and our code.
  // Never log user text, prompts, RAG passages, tokens or provider bodies.
  console.error('[Pierrot]', {
    operation: input.operation,
    http_status: input.failure.httpStatus,
    latency_ms: Math.max(0, Math.round(input.latencyMs)),
    error_type: readName(input.error).slice(0, 80),
    error_code: input.failure.code,
    ...(status !== null ? { provider_status: status } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.dependency ? { dependency: input.dependency } : {}),
  });
}
