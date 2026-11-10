'use client';

import { supabase } from '@/lib/supabase-browser';

/**
 * Shared authenticated fetch for the existing Art Engine admin API.
 * It keeps the current Supabase access token in the Authorization header
 * without introducing a second API or generation pipeline.
 */
export async function artEngineAuthFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  return fetch(url, { ...options, headers });
}
