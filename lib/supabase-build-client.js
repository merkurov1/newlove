// lib/supabase-build-client.js
import { createClient } from '@supabase/supabase-js';

// This client is specifically for static builds and does not need cookies.
export const supabaseBuildClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
