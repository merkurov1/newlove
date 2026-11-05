import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { diagnosisFromEvents } from './diagnosis';
import type {
  DevDiagnosis,
  DevRequestStatus,
  DevTokenUsage,
  DevToolTraceEntry,
  DevToolEvent,
} from './types';

assertServerOnly('lib/pierrot/dev/requests');

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export type DevRequestRow = {
  requestId: string;
  conversationId: string;
  status: DevRequestStatus;
  provider: string | null;
  model: string | null;
  responseText: string | null;
  latencyMs: number | null;
  usage: DevTokenUsage;
  toolTrace: DevToolTraceEntry[];
  events: DevToolEvent[];
  sideEffects: Array<{ tool: string; repository: string | null; summary: string }>;
  diagnosis: DevDiagnosis | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  responseMessageId: string | null;
};

export type BeginDevRequestResult = {
  available: boolean;
  duplicate: boolean;
  request: DevRequestRow | null;
  reason?: string;
};

function isMissingTable(error: unknown): boolean {
  const text =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /PGRST205|42P01|relation .* does not exist/i.test(text);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    String((error as { code?: unknown }).code || '') === '23505'
  );
}

function safeText(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

function mapRow(row: Record<string, unknown>): DevRequestRow {
  return {
    requestId: String(row.request_id || ''),
    conversationId: String(row.conversation_id || ''),
    status: String(row.status || 'failed') as DevRequestStatus,
    provider: typeof row.provider === 'string' ? row.provider : null,
    model: typeof row.model === 'string' ? row.model : null,
    responseText: typeof row.response_text === 'string' ? row.response_text : null,
    latencyMs: typeof row.latency_ms === 'number' ? row.latency_ms : null,
    usage: {
      promptTokens: typeof row.prompt_tokens === 'number' ? row.prompt_tokens : null,
      completionTokens: typeof row.completion_tokens === 'number' ? row.completion_tokens : null,
      totalTokens: typeof row.total_tokens === 'number' ? row.total_tokens : null,
    },
    toolTrace: Array.isArray(row.tool_trace) ? (row.tool_trace as DevToolTraceEntry[]) : [],
    events: Array.isArray(row.events) ? (row.events as DevToolEvent[]) : [],
    sideEffects: Array.isArray(row.side_effects)
      ? (row.side_effects as DevRequestRow['sideEffects'])
      : [],
    diagnosis: diagnosisFromEvents(Array.isArray(row.events) ? (row.events as DevToolEvent[]) : []),
    errorCode: typeof row.error_code === 'string' ? row.error_code : null,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
    startedAt: String(row.started_at || ''),
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    responseMessageId: typeof row.response_message_id === 'string' ? row.response_message_id : null,
  };
}

function getStore() {
  try {
    return getServerSupabaseClient({ useServiceRole: true });
  } catch {
    return null;
  }
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

export async function beginDevRequest(input: {
  requestId: string;
  conversationId: string;
  userId: string;
  idempotencyKey: string;
  message: string;
  repository?: string | null;
  baseRef?: string | null;
  commitSha?: string | null;
}): Promise<BeginDevRequestResult> {
  const requestId = sanitizeId(input.requestId);
  const idempotencyKey = sanitizeId(input.idempotencyKey);
  const conversationId = sanitizeId(input.conversationId);

  if (!ID_PATTERN.test(requestId) || !ID_PATTERN.test(idempotencyKey)) {
    return { available: false, duplicate: false, request: null, reason: 'invalid_request_id' };
  }

  const store = getStore();
  if (!store) {
    return { available: false, duplicate: false, request: null, reason: 'supabase_unavailable' };
  }

  const { error } = await store.from('pierrot_dev_requests').insert({
    request_id: requestId,
    conversation_id: conversationId,
    user_id: input.userId.slice(0, 128),
    idempotency_key: idempotencyKey,
    status: 'running',
    message_excerpt: safeText(input.message, 500),
    repository: input.repository ? input.repository.slice(0, 200) : null,
    base_ref: input.baseRef ? input.baseRef.slice(0, 200) : null,
    commit_sha: input.commitSha ? input.commitSha.slice(0, 64) : null,
    started_at: new Date().toISOString(),
  });

  if (!error) {
    return {
      available: true,
      duplicate: false,
      request: {
        requestId,
        conversationId,
        status: 'running',
        provider: null,
        model: null,
        responseText: null,
        latencyMs: null,
        usage: { promptTokens: null, completionTokens: null, totalTokens: null },
        toolTrace: [],
        events: [],
        sideEffects: [],
        diagnosis: null,
        errorCode: null,
        errorMessage: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        responseMessageId: null,
      },
    };
  }

  if (isMissingTable(error)) {
    return { available: false, duplicate: false, request: null, reason: 'migration_required' };
  }

  if (isUniqueViolation(error)) {
    const { data, error: selectError } = await store
      .from('pierrot_dev_requests')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (!selectError && data) {
      return { available: true, duplicate: true, request: mapRow(data) };
    }
  }

  console.error('[Pierrot Dev] begin request failed', {
    code: error?.code,
    message: error?.message,
  });
  return { available: false, duplicate: false, request: null, reason: 'request_store_failed' };
}

export async function completeDevRequest(input: {
  requestId: string;
  status: 'completed' | 'partially_completed';
  provider: string;
  model: string;
  reply: string;
  latencyMs: number;
  usage: DevTokenUsage;
  toolTrace: DevToolTraceEntry[];
  events: DevToolEvent[];
  sideEffects: DevRequestRow['sideEffects'];
  responseMessageId: string | null;
  diagnosis?: DevDiagnosis | null;
}): Promise<void> {
  const store = getStore();
  if (!store) return;

  // There is no dedicated diagnosis column; the existing jsonb event array is
  // the closest compatible store and requires no migration.
  const events: DevToolEvent[] = input.diagnosis
    ? [...input.events, { type: 'diagnosis', diagnosis: input.diagnosis }]
    : input.events;

  const { error } = await store
    .from('pierrot_dev_requests')
    .update({
      status: input.status,
      provider: input.provider.slice(0, 80),
      model: input.model.slice(0, 160),
      response_text: input.reply.slice(0, 16_000),
      response_message_id: input.responseMessageId,
      latency_ms: Math.max(0, Math.round(input.latencyMs)),
      prompt_tokens: input.usage.promptTokens,
      completion_tokens: input.usage.completionTokens,
      total_tokens: input.usage.totalTokens,
      tool_trace: input.toolTrace,
      events,
      side_effects: input.sideEffects,
      finished_at: new Date().toISOString(),
    })
    .eq('request_id', input.requestId);

  if (error && !isMissingTable(error)) {
    console.error('[Pierrot Dev] complete request failed', {
      code: error.code,
      message: error.message,
    });
  }
}

export async function failDevRequest(input: {
  requestId: string;
  status?: 'failed' | 'partially_completed';
  errorCode: string;
  errorMessage: string;
  latencyMs: number;
  toolTrace?: DevToolTraceEntry[];
  events?: DevToolEvent[];
  sideEffects?: DevRequestRow['sideEffects'];
}): Promise<void> {
  const store = getStore();
  if (!store) return;

  const { error } = await store
    .from('pierrot_dev_requests')
    .update({
      status: input.status || 'failed',
      error_code: input.errorCode.slice(0, 120),
      error_message: input.errorMessage.slice(0, 2000),
      latency_ms: Math.max(0, Math.round(input.latencyMs)),
      ...(input.toolTrace ? { tool_trace: input.toolTrace } : {}),
      ...(input.events ? { events: input.events } : {}),
      ...(input.sideEffects ? { side_effects: input.sideEffects } : {}),
      finished_at: new Date().toISOString(),
    })
    .eq('request_id', input.requestId);

  if (error && !isMissingTable(error)) {
    console.error('[Pierrot Dev] fail request failed', {
      code: error.code,
      message: error.message,
    });
  }
}

export async function loadDevRequest(
  conversationId: string,
  idempotencyKey: string
): Promise<DevRequestRow | null> {
  const store = getStore();
  if (!store) return null;

  const { data, error } = await store
    .from('pierrot_dev_requests')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

export async function loadDevRequestTraces(
  conversationId: string
): Promise<Map<string, DevRequestRow>> {
  const result = new Map<string, DevRequestRow>();
  const store = getStore();
  if (!store) return result;

  const { data, error } = await store
    .from('pierrot_dev_requests')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('started_at', { ascending: false })
    .limit(100);

  if (error || !Array.isArray(data)) return result;

  for (const row of data) {
    const mapped = mapRow(row);
    if (mapped.responseMessageId) result.set(mapped.responseMessageId, mapped);
  }

  return result;
}

export async function loadRecentDevRequests(
  conversationId: string,
  limit = 20
): Promise<DevRequestRow[]> {
  const store = getStore();
  if (!store) return [];

  const { data, error } = await store
    .from('pierrot_dev_requests')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('started_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error || !Array.isArray(data)) return [];
  return data.map((row) => mapRow(row));
}

export async function isDevRequestStoreAvailable(): Promise<boolean> {
  const store = getStore();
  if (!store) return false;
  const { error } = await store.from('pierrot_dev_requests').select('request_id').limit(1);
  return !error;
}
