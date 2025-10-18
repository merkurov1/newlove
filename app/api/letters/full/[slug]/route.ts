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
        let blocks: any[] = [];
        try {
            const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
            const parsed = JSON.parse(raw || '[]');
            blocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        } catch (e) { /* ignore */ }

        const payload: any = { status: 'ok', blocks };

        if (wantDebug) {
            // Provide a compact debug view: first 1-3 blocks with prototype info
            const debugBlocks = (blocks || []).slice(0, 3).map((b: any, idx: number) => {
                let snapshot: any = null;
                try {
                    snapshot = JSON.parse(JSON.stringify(b));
                } catch (e) {
                    try { snapshot = String(b); } catch (ee) { snapshot = { toStringError: String(ee) }; }
                }
                let protoName: string | null = null;
                try {
                    const p = Object.getPrototypeOf(b);
                    protoName = p && p.constructor ? String(p.constructor.name) : String(p);
                } catch (e) {
                    protoName = null;
                }
                return {
                    index: idx,
                    type: b?.type || null,
                    keys: b && typeof b === 'object' ? Object.keys(b) : null,
                    prototype: protoName,
                    snapshot,
                };
            });

            payload.debug = { viewerId: viewer?.id || null, isOwnerOrAdmin, blocksPreview: debugBlocks };
        }

        return NextResponse.json(payload, { status: 200 });

    } catch (e) {
        return NextResponse.json({ error: 'server_error', detail: String(e) }, { status: 500 });
    }
}
