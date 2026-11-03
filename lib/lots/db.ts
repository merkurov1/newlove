import { getServerSupabaseClient } from '@/lib/serverAuth';
import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/lots/db');

export type ParseAttemptStatus =
  | 'queued'
  | 'extracting'
  | 'ready'
  | 'partial'
  | 'failed'
  | 'success';

export interface ParseLogPayload {
  url: string;
  status: ParseAttemptStatus | 'success' | 'failed';
  error_message?: string | null;
  house?: string | null;
  parsed_title?: string | null;
  execution_time_ms?: number | null;
  payload?: Record<string, unknown> | null;
}

export interface StartParseAttemptInput {
  url: string;
  house?: string | null;
  parser?: string | null;
}

function getSupabase() {
  return getServerSupabaseClient({ useServiceRole: true });
}

function isMissingPayloadColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const record = error as Record<string, unknown>;
  const code = String(record.code || '');
  const message = String(record.message || '');

  return (
    code === 'PGRST204' ||
    (/payload/i.test(message) &&
      /column|schema cache/i.test(message))
  );
}

/**
 * Inserts a queued attempt before the network request. If the serverless
 * function times out, the row remains as evidence that an attempt was made.
 */
export async function startParseAttempt(
  input: StartParseAttemptInput,
): Promise<string | null> {
  try {
    const { data, error } = await getSupabase()
      .from('parse_logs')
      .insert([
        {
          url: input.url,
          status: 'queued',
          house: input.house || null,
          parsed_title: null,
          error_message: null,
          execution_time_ms: null,
        },
      ])
      .select('id')
      .single();

    if (error || !data?.id) {
      console.warn('[Parser DB Log] Failed to start parse attempt:', error);
      return null;
    }

    return String(data.id);
  } catch (error) {
    console.warn('[Parser DB Log] Failed to start parse attempt:', error);
    return null;
  }
}

export async function finishParseAttempt(
  attemptId: string | null,
  payload: ParseLogPayload,
): Promise<void> {
  if (!attemptId) return;

  const row = {
    status: payload.status,
    error_message: payload.error_message || null,
    house: payload.house || null,
    parsed_title: payload.parsed_title || null,
    execution_time_ms: payload.execution_time_ms || null,
    payload: payload.payload || null,
  };

  try {
    const { error } = await getSupabase()
      .from('parse_logs')
      .update(row)
      .eq('id', attemptId);

    if (error && isMissingPayloadColumn(error)) {
      const { payload: _payload, ...withoutPayload } = row;
      const retry = await getSupabase()
        .from('parse_logs')
        .update(withoutPayload)
        .eq('id', attemptId);

      if (retry.error) {
        console.warn('[Parser DB Log] Failed to finish parse attempt:', retry.error);
      }

      return;
    }

    if (error) {
      console.warn('[Parser DB Log] Failed to finish parse attempt:', error);
    }
  } catch (error) {
    console.warn('[Parser DB Log] Failed to finish parse attempt:', error);
  }
}

/**
 * Backward-compatible one-shot logger used by older callers.
 */
export async function logParseResult(payload: ParseLogPayload): Promise<void> {
  const attemptId = await startParseAttempt({
    url: payload.url,
    house: payload.house,
  });

  await finishParseAttempt(attemptId, payload);
}

export async function listParseAttemptsForLot(input: {
  lotId: string;
  urls?: string[];
  attemptIds?: string[];
  limit?: number;
}): Promise<any[]> {
  const numericLimit = Number(input.limit ?? 30);
  const safeLimit = Number.isFinite(numericLimit)
    ? Math.max(1, Math.min(Math.trunc(numericLimit), 100))
    : 30;
  const urls = Array.from(new Set((input.urls || []).filter(Boolean)));
  const attemptIds = Array.from(
    new Set((input.attemptIds || []).filter(Boolean)),
  );

  const withPayload =
    'id,url,status,error_message,house,parsed_title,execution_time_ms,created_at,payload';

  try {
    const supabase = getSupabase();
    let query = supabase
      .from('parse_logs')
      .select(withPayload)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (attemptIds.length) {
      query = query.in('id', attemptIds);
    } else if (urls.length) {
      query = query.in('url', urls);
    } else {
      query = query.contains('payload', { lot_id: input.lotId });
    }

    const { data, error } = await query;

    if (!error) return data || [];

    if (isMissingPayloadColumn(error)) {
      let retry = supabase
        .from('parse_logs')
        .select(
          'id,url,status,error_message,house,parsed_title,execution_time_ms,created_at',
        )
        .order('created_at', { ascending: false })
        .limit(safeLimit);

      if (attemptIds.length) {
        retry = retry.in('id', attemptIds);
      } else if (urls.length) {
        retry = retry.in('url', urls);
      } else {
        return [];
      }

      const result = await retry;
      return result.data || [];
    }

    console.warn('[Parser DB Log] Failed to list lot attempts:', error);
    return [];
  } catch (error) {
    console.warn('[Parser DB Log] Failed to list lot attempts:', error);
    return [];
  }
}

export async function listRecentAttempts(limit = 20): Promise<any[]> {
  try {
    const numericLimit = Number(limit);
    const safeLimit = Number.isFinite(numericLimit)
      ? Math.max(1, Math.min(Math.trunc(numericLimit), 50))
      : 20;
    const { data, error } = await getSupabase()
      .from('parse_logs')
      .select('id,url,status,error_message,house,parsed_title,execution_time_ms,created_at,payload')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (error) {
      // If the payload column has not been applied yet, fall back to the
      // original columns so the Vault panel still works.
      const retry = await getSupabase()
        .from('parse_logs')
        .select('id,url,status,error_message,house,parsed_title,execution_time_ms,created_at')
        .order('created_at', { ascending: false })
        .limit(safeLimit);

      return retry.data || [];
    }

    return data || [];
  } catch (error) {
    console.warn('[Parser DB Log] Failed to list parse attempts:', error);
    return [];
  }
}
