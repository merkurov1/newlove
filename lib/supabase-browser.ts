// lib/supabase-browser.ts
import { createBrowserClient } from '@supabase/ssr'

// Singleton browser client so all components share auth state/subscriptions.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true } }
);

export function createClient() {
  return supabase;
}

export default supabase;
