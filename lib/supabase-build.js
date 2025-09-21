import { createClient } from '@supabase/supabase-js'

// Клиент для статической генерации (build time)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export { supabase }