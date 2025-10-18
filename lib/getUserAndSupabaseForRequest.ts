// ===== ФАЙЛ: lib/getUserAndSupabaseForRequest.ts =====
// (ПОЛНЫЙ ЧИСТЫЙ КОД С ИСПРАВЛЕННЫМ FALLBACK)

import type { SupabaseClient } from '@supabase/supabase-js';

export type SupaRequestResult = { supabase: SupabaseClient | null; user?: any | null; isServer?: boolean };

export async function getUserAndSupabaseForRequest(req?: Request | null): Promise<SupaRequestResult> {
  try {
    // 1. Первая попытка (старый метод)
    const { getUserAndSupabaseFromRequestInterop } = await import('./supabaseInterop');
    const res = await getUserAndSupabaseFromRequestInterop(req as any);
    if (res && res.supabase) return { supabase: res.supabase, user: res.user || null, isServer: false };
  } catch (e) {
    // ignore and fallthrough to server fallback
  }

  // ----- ИСПРАВЛЕНИЕ ЗДЕСЬ -----
  // 2. Fallback-блок (теперь он умеет читать cookies)
  try {
    const srv = await import('./serverAuth');
    const supabase = srv.getServerSupabaseClient({ useServiceRole: true });
    
    // Пытаемся получить пользователя, используя Request (если он был передан)
    if (req) {
       try {
         const { getUserAndSupabaseFromRequestInterop } = await import('./supabaseInterop');
         const res = await getUserAndSupabaseFromRequestInterop(req as Request);
         if (res && res.user) return { supabase, user: res.user, isServer: true };
       } catch (e) { /* ignore */ }
    }

    // Если Request не помог, пытаемся собрать 'user' из next/headers
    [span_0](start_span)[span_1](start_span)// (Логика, взятая из твоего же файла serverAuth.ts [cite: 278-284])
    try {
        const { cookies } = await import('next/headers');
        const cookieHeader = cookies()
          .getAll()
          .map((c: any) => `${c.name}=${encodeURIComponent(c.value)}`)
          .join('; ');
        const reqFromCookies = new Request('http://localhost', { headers: { cookie: cookieHeader } });
        
        const { getUserAndSupabaseFromRequestInterop } = await import('./supabaseInterop');
        const res = await getUserAndSupabaseFromRequestInterop(reqFromCookies as any);
        if (res && res.user) return { supabase, user: res.user, isServer: true };
    } catch (e) {
        // ignore и используем 'null'
    }

    // Если ничего не помогло, возвращаем 'null'
    return { supabase, user: null, isServer: true } as SupaRequestResult;

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
