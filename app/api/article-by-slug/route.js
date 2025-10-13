import { NextResponse } from 'next/server';
import { safeLogError } from '@/lib/safeSerialize';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'No slug' }, { status: 400 });
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
  const { data: article, error } = await supabase.from('articles').select('id,slug,title,content,publishedAt').eq('slug', slug).eq('published', true).maybeSingle();
  if (error) {
    safeLogError('Supabase fetch article error', error);
    return NextResponse.json({ article: null });
  }
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(article);
}
