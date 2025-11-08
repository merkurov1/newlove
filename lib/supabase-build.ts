// lib/supabase-build.js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL || '', // Серверный URL
  process.env.SUPABASE_SERVICE_ROLE_KEY || '' // Сервисный ключ
);