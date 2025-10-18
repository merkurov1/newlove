// ===== ФАЙЛ: app/api/letters/full/[slug]/route.ts =====
// (ПОЛНЫЙ ЧИСТЫЙ КОД С НОВОЙ ЛОГИКОЙ)

// ----- НОВЫЕ ИМПОРТЫ -----
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Делаем динамическим

export async function GET(req: Request, { params }: { params: { slug: string } }) {
    const slug = params.slug;
    const url = new URL(req.url);
    const wantDebug = url.searchParams.get('_debug') === '1';

    // ----- НОВАЯ, ПРОСТАЯ ЛОГИКА АУТЕНТИФИКАЦИИ -----
    const supabase = createClient(); // Обычный клиент
    const { data: { user: viewer } } = await supabase.auth.getUser(); // Получаем user
    
    // Service-role клиент для чтения
    const supabaseService = createClient({ useServiceRole: true });

    try {
        const { data: letter, error } = await supabaseService.from('letters').select('*').eq('slug', slug).maybeSingle();
        
        if (error || !letter) {
            return NextResponse.json({ error: 'not_found' }, { status: 404 });
        }

        // Эта проверка теперь будет работать
        const isOwnerOrAdmin = viewer && (viewer.id === letter.authorId || String((viewer.user_metadata || {}).role || viewer.role || '').toUpperCase() === 'ADMIN');
        if (!letter.published && !isOwnerOrAdmin) {
            return NextResponse.json({ error: 'not_found' }, { status: 404 });
        }

        // Эта проверка теперь будет работать
        if (!viewer && !isOwnerOrAdmin) {
            return NextResponse.json({ error: 'unauthenticated', debug: wantDebug ? { viewer: null, isOwnerOrAdmin } : undefined }, { status: 401 });
        }

        // ... (остальной код без изменений) ...
        let blocks = [];
        try {
            const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
            const parsed = JSON.parse(raw || '[]');
            blocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        } catch (e) { /* ignore */ }

        const payload: any = { status: 'ok', blocks };
        if (wantDebug) payload.debug = { viewerId: viewer?.id || null, isOwnerOrAdmin };
        return NextResponse.json(payload, { status: 200 });

    } catch (e) {
        return NextResponse.json({ error: 'server_error', detail: String(e) }, { status: 500 });
    }
}
