// ===== ФАЙЛ: app/api/letters/full/[slug]/route.ts =====
// (ВОЗВРАЩАЕМ ОРИГИНАЛЬНЫЙ КОД)

import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { NextResponse } from 'next/server'; // Добавим NextResponse

export const dynamic = 'force-dynamic'; // Добавим, чтобы не кешировалось

export async function GET(req: Request, { params }: { params: { slug: string } }) {
    const slug = params.slug;
    const url = new URL(req.url);
    const wantDebug = url.searchParams.get('_debug') === '1';
    
    let viewer = null;
    try {
        // Этот хелпер мы починили (Файл 1)
        const ctx = await getUserAndSupabaseForRequest(req) || {};
        viewer = ctx.user || null;
    } catch (e) {
        // ignore - viewer remains null
    }

    try {
        const { getServerSupabaseClient } = await import('@/lib/serverAuth');
        const svc = getServerSupabaseClient({ useServiceRole: true });
        const { data: letter, error } = await svc.from('letters').select('*').eq('slug', slug).maybeSingle();
        
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
