// ===== ФАЙЛ: app/api/letters/full/[slug]/route.ts =====
// (ПОЛНЫЙ КОД С ИЗМЕНЕНИЯМИ)

// import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest'; // <- УДАЛИТЬ
// import { getServerSupabaseClient } from '@/lib/serverAuth'; // <- УДАЛИТЬ
import { createServerClient } from '@/lib/supabase/server'; // <-- НОВЫЙ ИМПОРТ
import { cookies } from 'next/headers';

export async function GET(req: Request, { params }: { params: { slug: string } }) {
    const slug = params.slug;
    const url = new URL(req.url);
    const wantDebug = url.searchParams.get('_debug') === '1';

    // Новая логика
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);
    const { data: { user: viewer } } = await supabase.auth.getUser();
    
    // Service-role клиент
    const supabaseService = createServerClient(cookieStore, { useServiceRole: true });

    try {
        const { data: letter, error } = await supabaseService.from('letters').select('*').eq('slug', slug).maybeSingle();
        if (error || !letter) {
            return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // Проверка на владельца/админа
        const isOwnerOrAdmin = viewer && (viewer.id === letter.authorId || String((viewer.user_metadata || {}).role || viewer.role || '').toUpperCase() === 'ADMIN');
        if (!letter.published && !isOwnerOrAdmin) {
            return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // *** КЛЮЧЕВОЙ МОМЕНТ ***
        // 'viewer' теперь будет корректно определен, 
        // и API вернет 200 OK, а не 401
        if (!viewer && !isOwnerOrAdmin) {
            return new Response(JSON.stringify({ error: 'unauthenticated', debug: wantDebug ? { viewer: null, isOwnerOrAdmin } : undefined }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }

        // ... остальной код файла без изменений ...

        let blocks = [];
        try {
            const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
            const parsed = JSON.parse(raw || '[]');
            blocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        } catch (e) {
            // ignore parse errors
        }

        const payload: any = { status: 'ok', blocks };
        if (wantDebug) payload.debug = { viewerId: viewer?.id || null, isOwnerOrAdmin };
        return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'server_error', detail: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
