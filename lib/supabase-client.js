// lib/supabase-client.js
"use client";
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Convenience wrapper to sign out from the browser Supabase client. Some
// components import this helper by name (signOut) so export it here as well.
export async function signOut() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.error('Error signing out', e);
  }
}