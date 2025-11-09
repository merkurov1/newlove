export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    // Prefer server service-role client for article retrieval
    const articleId = params.id;
    let supabase = null;
    try {
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');
      supabase = getServerSupabaseClient({ useServiceRole: true });
    } catch (e) {
      const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
      supabase = (await getUserAndSupabaseForRequest(request))?.supabase;
    }
    if (!supabase) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  const { data: article, error } = await supabase.from('articles').select('*').eq('id', articleId).maybeSingle();
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

