import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ParseLogPayload {
  url: string;
  status: 'success' | 'failed';
  error_message?: string;
  house?: string;
  parsed_title?: string;
  execution_time_ms?: number;
}

/**
 * Пишет результат парсинга в таблицу parse_logs
 */
export async function logParseResult(payload: ParseLogPayload): Promise<void> {
  try {
    await supabase.from('parse_logs').insert([
      {
        url: payload.url,
        status: payload.status,
        error_message: payload.error_message || null,
        house: payload.house || null,
        parsed_title: payload.parsed_title || null,
        execution_time_ms: payload.execution_time_ms || null,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (err) {
    console.warn('[Parser DB Log] Failed to insert parse log:', err);
  }
}
