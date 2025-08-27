// lib/supabase-server.js
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const supabase = () => {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY, // Use the SERVICE_KEY for server-side
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
      },
    },
  );
};
