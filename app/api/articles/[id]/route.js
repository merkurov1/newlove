export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
// Use dynamic import to avoid ESM interop issues

// Эта функция будет вызываться по GET запросу на /api/articles/[id]
export async function GET(request, { params }) {
  try {
    const mod = await import('@/lib/supabase-server');
    const getUserAndSupabaseFromRequest = mod.getUserAndSupabaseFromRequest || mod.default;
    const { supabase } = await getUserAndSupabaseFromRequest(request);
    const articleId = params.id;
    if (!supabase) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

    const { data: article, error } = await supabase.from('article').select('*').eq('id', articleId).maybeSingle();
    if (error || !article) {
      if (process.env.NODE_ENV === 'development') console.error('Error fetching article', error);
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    return NextResponse.json(article);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching article:', error);
    }
    return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
}

