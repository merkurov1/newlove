import { NextResponse } from 'next/server';
import { createId } from '@paralleldrive/cuid2';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { z } from 'zod';

const CommentSchema = z.object({
    content: z.string()
        .min(1, 'Comment cannot be empty')
        .max(2000, 'Comment must be less than 2000 characters')
        .trim(),
});

// GET: list comments for a letter (public)
// POST: create a comment (authenticated users only)
export async function GET(req: Request, { params }: { params: { slug: string } }) {
    const slug = params.slug;
    try {
        // Require authentication for listing comments to prevent public access
        const url = new URL(req.url);
        const wantDebug = url.searchParams.get('_debug') === '1';
        
        // Use server-side Supabase client for authentication
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user?.id) return new Response(JSON.stringify({ error: 'unauthenticated', debug: wantDebug ? { viewer: null } : undefined }), { status: 401, headers: { 'Content-Type': 'application/json' } });

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
    // Rate limiting: 10 comments per 15 minutes per IP
    const clientIp = getClientIp(req);
    const rateLimitResponse = checkRateLimit(clientIp, {
        interval: 15 * 60 * 1000, // 15 minutes
        maxRequests: 10,
        keyPrefix: 'comments',
    });
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    const slug = params.slug;
    try {
        // Validate user from incoming request (cookies)
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user?.id) return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

        const body = await req.json().catch(() => ({}));
        
        // Validate input with Zod
        const validation = CommentSchema.safeParse(body);
        if (!validation.success) {
            return new Response(
                JSON.stringify({ 
                    error: 'Validation failed', 
                    details: validation.error.flatten().fieldErrors 
                }), 
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }
        
        const { content } = validation.data;

        const { getServerSupabaseClient } = await import('@/lib/serverAuth');
        const svc = getServerSupabaseClient({ useServiceRole: true });
        
        // Get user data from users table for display name
        const { data: userData } = await svc
            .from('users')
            .select('name, username')
            .eq('id', user.id)
            .maybeSingle();
        
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
                author_display: userData?.name || userData?.username || user.email || 'Аноним',
                created_at: new Date().toISOString(),
            };
            const { error } = await svc.from('letter_comments').insert(payload);
            if (error) {
                console.error('Error inserting comment:', error);
                return new Response(JSON.stringify({ error: 'insert_failed', detail: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ status: 'ok', comment: payload }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            // Table may not exist or other error
            console.error('Error creating comment:', e);
            const fallback = { id: createId(), letter_id: null, user_id: user.id, content, author_display: userData?.name || userData?.username || user.email || 'Аноним', created_at: new Date().toISOString() };
            return new Response(JSON.stringify({ error: 'server_error', detail: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: 'server_error', detail: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
