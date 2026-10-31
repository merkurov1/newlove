import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type OpsEnvironment = NodeJS.ProcessEnv;

export function createOpsClient(env: OpsEnvironment = process.env): SupabaseClient | null {
  // Unit tests must not open real network connections to the operations store.
  // The memory fallbacks in guard/circuit-breaker keep the test path fast.
  if ((env.NODE_ENV || '').toLowerCase() === 'test') return null;

  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: 'no-store',
        }),
    },
  });
}

export function isMissingOpsTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const value = error as { code?: unknown; message?: unknown };
  const message = typeof value.message === 'string' ? value.message : '';

  return (
    value.code === '42P01' ||
    value.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('Could not find the table')
  );
}
