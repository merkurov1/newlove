// lib/supabase-build.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables for build process. Check your .env.local file or Vercel settings.');
}

export const supabaseBuildClient = createClient(supabaseUrl, supabaseKey);
