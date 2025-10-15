import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'No slug' }, { status: 400 });
    // Use server-side service-role client for public article lookups to avoid RLS blocking anon/request clients
    try {
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');
      const srv = getServerSupabaseClient({ useServiceRole: true });
      const { data: article, error } = await srv.from('articles').select('id,slug,title,content,publishedAt').eq('slug', slug).eq('published', true).maybeSingle();
      if (error) {
        console.error('Supabase (service) fetch article error', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
      }
      if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(article);
    } catch (e) {
      console.error('article-by-slug: failed to fetch via service client', e);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
