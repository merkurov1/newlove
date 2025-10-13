export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
// Use dynamic import to avoid ESM interop issues

// Эта функция будет вызываться по GET запросу на /api/articles/[id]
export async function GET(request, { params }) {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient();
    const articleId = params.id;
    if (!supabase) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  const { data: article, error } = await supabase.from('articles').select('*').eq('id', articleId).maybeSingle();
    if (error || !article) {
  if (process.env.NODE_ENV === 'development') safeLogError('Error fetching article', error);
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    return NextResponse.json(article);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
  safeLogError('Error fetching article:', error);
    }
    return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
}

