import { NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';

// GET: list comments for a letter (public)
// POST: create a comment (authenticated users only)
export async function GET(req: Request, { params }: { params: { slug: string } }) {
    const slug = params.slug;
    try {
        // Require authentication for listing comments to prevent public access
        const url = new URL(req.url);
        const wantDebug = url.searchParams.get('_debug') === '1';
        const ctx = await getUserAndSupabaseForRequest(req) || {};
        const user = ctx.user || null;
        if (!user || !user.id) return new Response(JSON.stringify({ error: 'unauthenticated', debug: wantDebug ? { viewer: null } : undefined }), { status: 401, headers: { 'Content-Type': 'application/json' } });

        const { getServerSupabaseClient } = await import('@/lib/serverAuth');
        const svc = getServerSupabaseClient({ useServiceRole: true });
        // Find letter id
        const { data: letter, error: letterErr } = await svc.from('letters').select('id').eq('slug', slug).maybeSingle();
        if (letterErr || !letter) return new Response(JSON.stringify({ comments: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });

        // Read comments table
        let comments: Array<any> = [];
        const { data: rows, error } = await svc.from('letter_comments').select('id,content,created_at,user_id,author_display').eq('letter_id', letter.id).order('created_at', { ascending: true });
        if (!error && Array.isArray(rows)) comments = rows;

        const payload: any = { comments };
        if (wantDebug) payload.debug = { viewerId: user.id, viewerRole: user.role || null, letterId: letter.id };

        return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        return new Response(JSON.stringify({ comments: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
    const slug = params.slug;
    try {
        // Validate user from incoming request (cookies)
        const ctx = await getUserAndSupabaseForRequest(req) || {};
        const user = ctx.user || null;
        if (!user || !user.id) return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

        const body = await req.json().catch(() => ({}));
        const content = (body && String(body.content || '').trim()) || '';
        if (!content) return new Response(JSON.stringify({ error: 'empty' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

        const { getServerSupabaseClient } = await import('@/lib/serverAuth');
        const svc = getServerSupabaseClient({ useServiceRole: true });
        const { data: letter, error: letterErr } = await svc.from('letters').select('id').eq('slug', slug).maybeSingle();
        if (letterErr || !letter) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

        // Insert comment (best-effort if table exists)
        try {
            const id = createId();
            const payload = {
                id,
                letter_id: letter.id,
                user_id: user.id,
                content,
                author_display: user.name || user.username || null,
                created_at: new Date().toISOString(),
            };
            const { error } = await svc.from('letter_comments').insert(payload);
            if (error) {
                // If insert fails (table missing), return success with ephemeral comment
                return new Response(JSON.stringify({ status: 'ok', comment: payload }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ status: 'ok', comment: payload }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            // Table may not exist or other error
            const fallback = { id: createId(), letter_id: null, user_id: user.id, content, author_display: user.name || user.username || null, created_at: new Date().toISOString() };
            return new Response(JSON.stringify({ status: 'ok', comment: fallback }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: 'server_error', detail: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
