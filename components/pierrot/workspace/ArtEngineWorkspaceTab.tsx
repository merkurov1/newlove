'use client';

import { supabase } from '@/lib/supabase-browser';
import ArtEngineWorkspace from '@/components/art-engine/ArtEngineWorkspace';

async function authFetch(url: string, options: RequestInit = {}) {
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

export default function ArtEngineWorkspaceTab() {
  return <ArtEngineWorkspace authFetch={authFetch} embeddedInPierrot />;
}
