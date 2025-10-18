// ===== ФАЙЛ: lib/getUserAndSupabaseForRequest.ts =====
// (ПОЛНЫЙ КОД С ИСПРАВЛЕНИЕМ FALLBACK-ЛОГИКИ)

import type { SupabaseClient } from '@supabase/supabase-js';

export type SupaRequestResult = { supabase: SupabaseClient | null; user?: any | null; isServer?: boolean };

export async function getUserAndSupabaseForRequest(req?: Request | null): Promise<SupaRequestResult> {
  try {
    const { getUserAndSupabaseFromRequestInterop } = await import('./supabaseInterop');
    const res = await getUserAndSupabaseFromRequestInterop(req as any);
    if (res && res.supabase) return { supabase: res.supabase, user: res.user || null, isServer: false };
  } catch (e) {
    // ignore and fallthrough to server fallback
  }

  // ----- ИСПРАВЛЕНИЕ ЗДЕСЬ -----
  try {
    // Мы импортируем ВЕСЬ 'srv', а не только 'getServerSupabaseClient'
    const srv = await import('./serverAuth');
    
    // 1. Создаем service-клиент
    const supabase = srv.getServerSupabaseClient({ useServiceRole: true });
    
    // 2. Пытаемся получить пользователя, используя getServerUser()
    //    (Который внутри себя сам попробует найти куки)
    const user = await srv.getServerUser().catch(() => null);

    // 3. Возвращаем и 'supabase', и 'user'
    return { supabase, user, isServer: true } as SupaRequestResult;
  } catch (e) {
    // ----- КОНЕЦ ИСПРАВЛЕНИЯ -----
    
    // Emergency mock fallback
    try {
      if (typeof process !== 'undefined' && process.env && process.env.EMERGENCY_SUPABASE_MOCK === 'true') {
        const { createMockSupabase } = await import('./mockSupabaseClient');
        const mock = createMockSupabase();
        return { supabase: mock as any, isServer: false };
      }
    } catch (e2) {
      // ignore
    }
    return { supabase: null, isServer: false };
  }
}

export default getUserAndSupabaseForRequest;
