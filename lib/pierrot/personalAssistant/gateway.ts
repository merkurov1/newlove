import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/personalAssistant/gateway');

import {
  AssistantRequestError,
  sanitizeAssistantCorrelationId,
  sanitizeAssistantProvider,
  type AssistantFailureCategory,
} from './diagnostics';

/**
 * Server-to-server bridge from the Telegram webhook to /api/pierrot-web.
 *
 * The gateway deliberately turns every transport/provider failure into an
 * AssistantRequestError with a stable category, stage and safe code. It never
 * copies a provider body, prompt or user message into an error or a log.
 */

export const PERSONAL_ASSISTANT_GATEWAY_TIMEOUT_MS = 55_000;

export type PersonalAssistantGatewayInput = {
  siteUrl: string;
  internalSecret?: string;
  senderId: number;
  messageId: string;
  userMessageId: string;
  text: string;
  correlationId: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type PersonalAssistantGatewayResult = {
  reply: string;
  provider: string | null;
  model: string | null;
  requestId: string;
  httpStatus: number;
  durationMs: number;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function readSafeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(trimmed) ? trimmed : null;
}

function readSafeModel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_./:-]{1,120}$/.test(trimmed) ? trimmed : null;
}

function readReply(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function categoryFromHttpStatus(status: number, code: string | null): AssistantFailureCategory {
  const normalized = code?.toUpperCase() ?? '';

  if (normalized === 'AI_TIMEOUT' || normalized === 'CLIENT_ABORTED') return 'timeout';
  if (normalized === 'AI_RATE_LIMITED') return 'rate_limited';
  if (normalized === 'AI_QUOTA_EXCEEDED') return 'quota_exceeded';
  if (normalized === 'AI_NOT_CONFIGURED') return 'not_configured';
  if (normalized === 'AI_EMPTY_RESPONSE' || normalized === 'INVALID_RESPONSE') {
    return 'invalid_response';
  }
  if (normalized === 'NETWORK_ERROR') return 'network';

  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 402) return 'quota_exceeded';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  if (status >= 400) return 'provider_http';
  return 'invalid_response';
}

function isTimeoutError(error: unknown): boolean {
  const record = asRecord(error);
  const name = typeof record?.name === 'string' ? record.name.toLowerCase() : '';
  const message = typeof record?.message === 'string' ? record.message.toLowerCase() : '';

  return (
    name === 'aborterror' ||
    name.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('aborted')
  );
}

function retryAfterFor(category: AssistantFailureCategory): number | null {
  if (category === 'rate_limited') return 30;
  if (category === 'timeout') return 15;
  if (category === 'unavailable') return 20;
  return null;
}

export async function requestPersonalAssistantReply(
  input: PersonalAssistantGatewayInput
): Promise<PersonalAssistantGatewayResult> {
  const startedAt = Date.now();
  const correlationId =
    sanitizeAssistantCorrelationId(input.correlationId) ?? `req_${Date.now().toString(36)}`;
  const requestedTimeout = input.timeoutMs ?? PERSONAL_ASSISTANT_GATEWAY_TIMEOUT_MS;
  const timeoutMs = Math.max(1_000, Math.min(120_000, Math.trunc(requestedTimeout)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const doFetch = input.fetchImpl ?? fetch;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // These headers are trusted only together with the internal service
    // secret. The web route re-checks the sender and private-chat constraints.
    'x-telegram-user-id': String(input.senderId),
    'x-telegram-sender-id': String(input.senderId),
    'x-telegram-chat-id': String(input.senderId),
    'x-telegram-chat-type': 'private',
    'x-telegram-update-authentic': '1',
    'x-pierrot-request-id': correlationId,
  };

  if (input.internalSecret) {
    headers['x-pierrot-internal'] = input.internalSecret;
  }

  let response: Response;

  try {
    response = await doFetch(`${input.siteUrl}/api/pierrot-web`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        message: input.text,
        userMessageId: input.userMessageId,
        stream: false,
        context: { pathname: '/' },
      }),
    });
  } catch (error) {
    clearTimeout(timer);

    const timedOut = controller.signal.aborted || isTimeoutError(error);
    const category: AssistantFailureCategory = timedOut ? 'timeout' : 'network';

    throw new AssistantRequestError({
      stage: 'provider_request',
      category,
      providerCode: controller.signal.aborted
        ? 'gateway_timeout'
        : timedOut
          ? 'provider_timeout'
          : 'provider_network_error',
      retryable: true,
      retryAfterSeconds: timedOut ? 15 : 20,
    });
  }

  let bodyText = '';

  try {
    bodyText = await response.text();
  } catch {
    clearTimeout(timer);

    if (controller.signal.aborted) {
      throw new AssistantRequestError({
        stage: 'response_parse',
        category: 'timeout',
        httpStatus: response.status,
        providerCode: 'gateway_timeout',
        retryable: true,
        retryAfterSeconds: 15,
      });
    }

    if (!response.ok) {
      const category = categoryFromHttpStatus(response.status, null);
      throw new AssistantRequestError({
        stage: 'provider_request',
        category,
        httpStatus: response.status,
        retryable: category !== 'provider_http',
        retryAfterSeconds: retryAfterFor(category),
      });
    }

    throw new AssistantRequestError({
      stage: 'response_parse',
      category: 'invalid_response',
      httpStatus: response.status,
      providerCode: 'provider_malformed_response',
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown = null;
  let parseFailed = false;

  if (bodyText.trim()) {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      parseFailed = true;
    }
  }

  const record = asRecord(payload);
  const responseRequestId = sanitizeAssistantCorrelationId(record?.requestId);
  const provider = sanitizeAssistantProvider(record?.provider);
  const model = readSafeModel(record?.model);

  if (!response.ok) {
    const code = readSafeCode(record?.code);
    const providerCode = readSafeCode(record?.providerCode);
    const category = categoryFromHttpStatus(response.status, code);

    throw new AssistantRequestError({
      stage: 'provider_request',
      category,
      httpStatus: response.status,
      provider,
      providerCode: providerCode ?? code ?? `http_${response.status}`,
      retryable: category !== 'provider_http',
      retryAfterSeconds: retryAfterFor(category),
    });
  }

  if (parseFailed || !record) {
    throw new AssistantRequestError({
      stage: 'response_parse',
      category: 'invalid_response',
      httpStatus: response.status,
      provider,
      providerCode: 'provider_malformed_response',
      retryable: true,
    });
  }

  const reply = readReply(record.reply);

  if (reply === null || !reply.trim()) {
    throw new AssistantRequestError({
      stage: 'response_parse',
      category: 'invalid_response',
      httpStatus: response.status,
      provider,
      providerCode: 'provider_empty_response',
      retryable: true,
    });
  }

  return {
    reply,
    provider,
    model,
    requestId: responseRequestId ?? correlationId,
    httpStatus: response.status,
    durationMs: Date.now() - startedAt,
  };
}
