"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Замените на ваши переменные окружения
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  return createBrowserClient(supabaseUrl, supabaseKey);
}
