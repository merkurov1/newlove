import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/personalAssistant/diagnostics');

import type { PierrotErrorCode } from '@/lib/pierrot/errorContracts';

/**
 * Safe diagnostics for the personal assistant request path.
 *
 * Every value written here is allowlisted: a correlation id, a processing
 * stage, an HTTP status, a provider error code, a duration and a stable error
 * category. Message text, prompts, memory records, Telegram identities,
 * request bodies and provider response bodies are never accepted by this
 * module and therefore can never reach the logs.
 */

export const ASSISTANT_STAGES = [
  'request',
  'provider_request',
  'response_parse',
  'generation',
  'reply_delivery',
  'completed',
] as const;

export type AssistantStage = (typeof ASSISTANT_STAGES)[number];

export type AssistantFailureCategory =
  | 'timeout'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'not_configured'
  | 'unauthorized'
  | 'unavailable'
  | 'invalid_response'
  | 'network'
  | 'provider_http'
  | 'telegram_delivery'
  | 'internal';

export type AssistantFailureDetails = {
  stage: AssistantStage;
  category: AssistantFailureCategory;
  httpStatus: number | null;
  provider: string | null;
  providerCode: string | null;
  retryable: boolean;
  retryAfterSeconds: number | null;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function safeString(value: unknown, pattern: RegExp, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || !pattern.test(trimmed)) return null;
  return trimmed;
}

/**
 * Correlation ids are generated server-side, but a caller-supplied value is
 * still validated before it is echoed into a header or a log line.
 */
export function sanitizeAssistantCorrelationId(value: unknown): string | null {
  return safeString(value, /^[A-Za-z0-9_.:-]{1,80}$/, 80);
}

export function createAssistantCorrelationId(input?: {
  updateId?: number | string | null;
  messageId?: number | string | null;
  requestId?: unknown;
}): string {
  const supplied = sanitizeAssistantCorrelationId(input?.requestId);
  if (supplied) return supplied;

  const updateId =
    input?.updateId === undefined || input?.updateId === null
      ? null
      : String(input.updateId)
          .replace(/[^A-Za-z0-9_.:-]/g, '')
          .slice(0, 24);
  const messageId =
    input?.messageId === undefined || input?.messageId === null
      ? null
      : String(input.messageId)
          .replace(/[^A-Za-z0-9_.:-]/g, '')
          .slice(0, 24);

  if (updateId) {
    return `tg_${updateId}${messageId ? `_${messageId}` : ''}`.slice(0, 80);
  }

  // randomUUID is available in the Node runtime. Keep the fallback valid even
  // if a test replaces crypto with a minimal stub.
  try {
    return `req_${globalThis.crypto.randomUUID()}`.slice(0, 80);
  } catch {
    return `req_${Date.now().toString(36)}`;
  }
}

export function sanitizeAssistantProvider(value: unknown): string | null {
  return safeString(value, /^[A-Za-z0-9_.:-]{1,32}$/, 32);
}

function readStatus(value: unknown): number | null {
  const record = asRecord(value);
  if (!record) return null;

  for (const key of ['status', 'statusCode', 'httpStatus']) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate >= 100) {
      return candidate;
    }
  }

  const response = asRecord(record.response);
  const responseStatus = response?.status;
  if (
    typeof responseStatus === 'number' &&
    Number.isInteger(responseStatus) &&
    responseStatus >= 100
  ) {
    return responseStatus;
  }

  return null;
}

function readExplicitProviderCode(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;

  return (
    safeString(record.pierrotProviderCode, /^[A-Za-z0-9_.:-]{1,80}$/, 80) ??
    safeString(record.providerCode, /^[A-Za-z0-9_.:-]{1,80}$/, 80) ??
    safeString(record.code, /^[A-Za-z0-9_.:-]{1,80}$/, 80)
  );
}

function readProvider(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;

  return (
    sanitizeAssistantProvider(record.pierrotProvider) ??
    sanitizeAssistantProvider(record.provider) ??
    null
  );
}

function errorText(value: unknown): { name: string; message: string } {
  const record = asRecord(value);
  const name = typeof record?.name === 'string' ? record.name : '';
  const message = typeof record?.message === 'string' ? record.message : '';
  return { name: name.toLowerCase(), message: message.toLowerCase() };
}

function isTimeout(value: unknown): boolean {
  const { name, message } = errorText(value);
  const code = readExplicitProviderCode(value)?.toLowerCase() ?? '';

  return (
    name.includes('timeout') ||
    name === 'aborterror' ||
    code.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('timeout')
  );
}

function categoryFromCode(code: string | null): AssistantFailureCategory | null {
  if (!code) return null;
  const normalized = code.toUpperCase();

  if (normalized === 'AI_TIMEOUT') return 'timeout';
  if (normalized === 'AI_RATE_LIMITED') return 'rate_limited';
  if (normalized === 'AI_QUOTA_EXCEEDED') return 'quota_exceeded';
  if (normalized === 'AI_NOT_CONFIGURED') return 'not_configured';
  if (normalized === 'AI_EMPTY_RESPONSE' || normalized === 'INVALID_RESPONSE') {
    return 'invalid_response';
  }
  if (normalized === 'NETWORK_ERROR') return 'network';
  if (normalized === 'CLIENT_ABORTED') return 'timeout';

  const lower = code.toLowerCase();
  if (lower.includes('malformed') || lower.includes('invalid_response')) {
    return 'invalid_response';
  }
  if (lower.includes('rate_limit') || lower.includes('too_many')) return 'rate_limited';
  if (lower.includes('quota')) return 'quota_exceeded';
  if (lower.includes('not_configured') || lower.includes('api_key')) return 'not_configured';
  if (lower.includes('timeout')) return 'timeout';
  if (lower.includes('network') || lower.startsWith('econn') || lower.includes('fetch_failed')) {
    return 'network';
  }

  return null;
}

function categoryFromStatus(status: number | null): AssistantFailureCategory | null {
  if (status === null) return null;
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 402) return 'quota_exceeded';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  if (status >= 400) return 'provider_http';
  return null;
}

function defaultRetryAfter(category: AssistantFailureCategory): number | null {
  if (category === 'rate_limited') return 30;
  if (category === 'timeout') return 15;
  if (category === 'unavailable' || category === 'network') return 20;
  return null;
}

function isRetryable(category: AssistantFailureCategory): boolean {
  return (
    category === 'timeout' ||
    category === 'rate_limited' ||
    category === 'unavailable' ||
    category === 'network' ||
    category === 'invalid_response'
  );
}

function providerCodeFor(
  error: unknown,
  details: Pick<AssistantFailureDetails, 'category' | 'httpStatus'>
): string | null {
  const explicit = readExplicitProviderCode(error);
  if (explicit) return explicit;

  const cause = asRecord(error)?.cause;
  const causeCode = readExplicitProviderCode(cause);
  if (causeCode) return causeCode;

  if (details.httpStatus !== null) return `http_${details.httpStatus}`;

  switch (details.category) {
    case 'timeout':
      return 'provider_timeout';
    case 'network':
      return 'provider_network_error';
    case 'invalid_response':
      return 'provider_malformed_response';
    case 'internal':
      return 'provider_internal_error';
    default:
      return null;
  }
}

/**
 * A gateway/route failure with explicit, pre-sanitised diagnostics. The error
 * message is fixed on purpose: this error may cross a logging boundary and must
 * never carry a provider or request body.
 */
export class AssistantRequestError extends Error {
  readonly stage: AssistantStage;
  readonly category: AssistantFailureCategory;
  readonly httpStatus: number | null;
  readonly provider: string | null;
  readonly providerCode: string | null;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(input: {
    stage: AssistantStage;
    category: AssistantFailureCategory;
    httpStatus?: number | null;
    provider?: string | null;
    providerCode?: string | null;
    retryable?: boolean;
    retryAfterSeconds?: number | null;
  }) {
    super('The personal assistant request failed.');
    this.name = 'AssistantRequestError';
    this.stage = input.stage;
    this.category = input.category;
    this.httpStatus = input.httpStatus ?? null;
    this.provider = sanitizeAssistantProvider(input.provider);
    this.providerCode = safeString(input.providerCode, /^[A-Za-z0-9_.:-]{1,80}$/, 80);
    this.retryable = input.retryable ?? isRetryable(input.category);
    this.retryAfterSeconds = input.retryAfterSeconds ?? defaultRetryAfter(input.category);
  }
}

export function classifyAssistantFailure(
  error: unknown,
  options: { stage?: AssistantStage } = {}
): AssistantFailureDetails {
  if (error instanceof AssistantRequestError) {
    return {
      stage: error.stage,
      category: error.category,
      httpStatus: error.httpStatus,
      provider: error.provider,
      providerCode: error.providerCode,
      retryable: error.retryable,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }

  const cause = asRecord(error)?.cause;
  const sources = [error, cause];
  const explicitCode = sources.map(readExplicitProviderCode).find(Boolean) ?? null;
  const httpStatus = sources.map(readStatus).find((value) => value !== null) ?? null;
  const provider = sources.map(readProvider).find(Boolean) ?? null;

  let category: AssistantFailureCategory;
  const codeCategory = categoryFromCode(explicitCode);
  const aborted = sources.some(isTimeout);

  if (aborted) {
    category = 'timeout';
  } else if (codeCategory) {
    category = codeCategory;
  } else {
    category = categoryFromStatus(httpStatus) ?? 'internal';
  }

  const details: AssistantFailureDetails = {
    stage: options.stage ?? 'provider_request',
    category,
    httpStatus,
    provider,
    providerCode: null,
    retryable: isRetryable(category),
    retryAfterSeconds: defaultRetryAfter(category),
  };

  details.providerCode = providerCodeFor(error, details);

  return details;
}

export function pierrotCodeForAssistantFailure(
  category: AssistantFailureCategory
): PierrotErrorCode {
  switch (category) {
    case 'timeout':
      return 'AI_TIMEOUT';
    case 'rate_limited':
      return 'AI_RATE_LIMITED';
    case 'quota_exceeded':
      return 'AI_QUOTA_EXCEEDED';
    case 'not_configured':
    case 'unauthorized':
      return 'AI_NOT_CONFIGURED';
    case 'invalid_response':
      return 'INVALID_RESPONSE';
    case 'network':
      return 'NETWORK_ERROR';
    case 'unavailable':
      return 'AI_UNAVAILABLE';
    case 'provider_http':
      return 'AI_FAILED';
    case 'telegram_delivery':
    case 'internal':
    default:
      return 'INTERNAL_ERROR';
  }
}

export type AssistantLogEntry = {
  correlationId: string;
  stage: AssistantStage;
  outcome: 'success' | 'failure';
  durationMs: number;
  error?: unknown;
  details?: AssistantFailureDetails;
  httpStatus?: number | null;
  provider?: string | null;
  providerCode?: string | null;
};

function safeDuration(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(3_600_000, Math.round(value)));
}

function safeStatus(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null;
}

/**
 * Emit one structured line per assistant request outcome. Failure lines carry
 * only the stage, class, status, safe provider code, duration and retry hint.
 */
export function logAssistantRequest(entry: AssistantLogEntry): void {
  const details =
    entry.details ??
    (entry.outcome === 'failure'
      ? classifyAssistantFailure(entry.error, { stage: entry.stage })
      : null);

  const payload: Record<string, unknown> = {
    event: 'pierrot_assistant_request',
    correlation_id: sanitizeAssistantCorrelationId(entry.correlationId) ?? 'invalid',
    stage: details?.stage ?? entry.stage,
    outcome: entry.outcome,
    duration_ms: safeDuration(entry.durationMs),
  };

  const httpStatus = safeStatus(entry.httpStatus ?? details?.httpStatus);
  if (httpStatus !== null) payload.http_status = httpStatus;

  const provider = sanitizeAssistantProvider(entry.provider ?? details?.provider);
  if (provider) payload.provider = provider;

  const providerCode = safeString(
    entry.providerCode ?? details?.providerCode,
    /^[A-Za-z0-9_.:-]{1,80}$/,
    80
  );
  if (providerCode) payload.provider_code = providerCode;

  if (entry.outcome === 'failure' && details) {
    payload.error_category = details.category;
    payload.retryable = details.retryable;
    if (details.retryAfterSeconds !== null) {
      payload.retry_after_seconds = details.retryAfterSeconds;
    }
  }

  const sink = entry.outcome === 'success' ? console.info : console.error;
  sink('[Pierrot Assistant]', payload);
}
