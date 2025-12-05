import { createClient } from '@/lib/supabase/server';
import buildSafeDebug from '@/lib/debug';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const debugEnabled = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
  const url = new URL(request.url);
  const includeDebugForRequest = debugEnabled || url.searchParams.get('debug') === '1';

  try {
    const includeUnpublishedSample = includeDebugForRequest && url.searchParams.get('all') === '1';
    const supabase = createClient({ useServiceRole: includeUnpublishedSample });

    let lettersQuery = supabase
      .from('letters')
      .select('id, title, slug, published, publishedAt, createdAt, authorId, users(id, name, email)')
      .order('publishedAt', { ascending: false })
      .limit(100);

    if (!includeUnpublishedSample) {
      lettersQuery = lettersQuery.eq('published', true);
    }

    const { data: letters, error } = await lettersQuery;

    if (error) {
      console.error('Journal fetch error:', error);
      const outDebug = buildSafeDebug(request, { errors: [error.message, error.code, error.details] });
      return NextResponse.json({ error: 'Failed to fetch journal letters', debug: includeDebugForRequest ? outDebug : undefined }, { status: 500 });
    }

    const transformedLetters = (letters || []).map((letter: any) => {
      const user = Array.isArray(letter.users) ? letter.users[0] : letter.users;
      return {
        id: letter.id,
        title: letter.title,
        slug: letter.slug,
        published: letter.published,
        publishedAt: letter.publishedAt,
        createdAt: letter.createdAt,
        authorId: letter.authorId,
        author: { name: user?.name || user?.email?.split('@')[0] || 'Автор' },
      };
    });

    let outDebug: any = undefined;
    if (includeDebugForRequest) outDebug = buildSafeDebug(request, { restStatus: 200, restBody: { itemCount: transformedLetters.length } });

    return NextResponse.json({ letters: transformedLetters, debug: outDebug });
  } catch (e) {
    console.error('Journal API unexpected error:', e);
    const outDebug = buildSafeDebug(request, { errors: [String(e)] });
    return NextResponse.json({ error: String(e), debug: includeDebugForRequest ? outDebug : undefined }, { status: 500 });
  }
}
