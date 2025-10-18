import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export async function GET(req: Request, { params }: { params: { slug: string } }) {
    const slug = params.slug;

    // Obtain viewer (if any) from the incoming request (cookies)
    const url = new URL(req.url);
    const wantDebug = url.searchParams.get('_debug') === '1';
    let viewer = null;
    try {
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
            return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // If letter is unpublished, only allow author/admin
        const isOwnerOrAdmin = viewer && (viewer.id === letter.authorId || String((viewer.user_metadata || {}).role || viewer.role || '').toUpperCase() === 'ADMIN');
        if (!letter.published && !isOwnerOrAdmin) {
            return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // Full content is available only to authenticated users (or owner/admin)
        if (!viewer && !isOwnerOrAdmin) {
            return new Response(JSON.stringify({ error: 'unauthenticated', debug: wantDebug ? { viewer: null, isOwnerOrAdmin } : undefined }), { status: 401, headers: { 'Content-Type': 'application/json' } });
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
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'server_error', detail: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
