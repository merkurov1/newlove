// ===== ФАЙЛ: lib/supabase/client.ts =====
// (НОВЫЙ ЧИСТЫЙ ФАЙЛ)

"use client";

// Reuse the shared browser client singleton so auth state (persistSession)
// is consistent across components. Some components import this helper and
// expect getSession() to return the persisted session.
import { createClient as browserCreateClient } from '@/lib/supabase-browser';

export function createClient() {
  return browserCreateClient();
}
