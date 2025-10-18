// ===== ФАЙЛ: app/api/letters/full/[slug]/route.ts =====
// (ПОЛНЫЙ КОД С ИСПРАВЛЕНИЯМИ)

// НОВЫЕ ИМПОРТЫ
import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// ----- ВОТ ИСПРАВЛЕНИЕ -----
// Эта строка заставит API-маршрут всегда рендериться динамически
export const dynamic = 'force-dynamic';
// ------------------------------

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
            return NextResponse.json({ error: 'not_found' }, { status: 404 });
        }

        // Проверка на владельца/админа
        const isOwnerOrAdmin = viewer && (viewer.id === letter.authorId || String((viewer.user_metadata || {}).role || viewer.role || '').toUpperCase() === 'ADMIN');
        if (!letter.published && !isOwnerOrAdmin) {
            return NextResponse.json({ error: 'not_found' }, { status: 404 });
        }

        // Эта проверка теперь будет работать корректно
        if (!viewer && !isOwnerOrAdmin) {
            return NextResponse.json({ error: 'unauthenticated', debug: wantDebug ? { viewer: null, isOwnerOrAdmin } : undefined }, { status: 401 });
        }

        // Parse blocks
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
        return NextResponse.json(payload, { status: 200 });

    } catch (e) {
        return NextResponse.json({ error: 'server_error', detail: String(e) }, { status: 500 });
    }
}
