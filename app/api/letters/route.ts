import { createClient } from '@/lib/supabase/server';
import buildSafeDebug from '@/lib/debug';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const debugEnabled = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
  const url = new URL(request.url);
  const includeDebugForRequest = debugEnabled || url.searchParams.get('debug') === '1';

  try {
  // Use service role only for verbose debug/all requests. In normal operation
  // prefer the public anon key so the endpoint works without SUPABASE_SERVICE_ROLE_KEY.
  const includeUnpublishedSample = includeDebugForRequest && url.searchParams.get('all') === '1';
  const supabase = createClient({ useServiceRole: includeUnpublishedSample });

    let lettersQuery = supabase
      .from('letters')
      .select('id, title, slug, published, publishedAt, createdAt, authorId, User!letters_authorId_fkey(id, name, email)')
      .order('publishedAt', { ascending: false })
      .limit(100);

    if (!includeUnpublishedSample) {
      lettersQuery = lettersQuery.eq('published', true);
    }

    const { data: letters, error } = await lettersQuery;

    if (error) {
      console.error('Letters fetch error:', error);
      const outDebug = buildSafeDebug(request, { 
        errors: [error.message, error.code, error.details] 
      });
      return NextResponse.json(
        { 
          error: 'Failed to fetch letters', 
          debug: includeDebugForRequest ? outDebug : undefined 
        }, 
        { status: 500 }
      );
    }

    const transformedLetters = (letters || []).map(letter => {
      const user = Array.isArray(letter.User) ? letter.User[0] : letter.User;
      return {
        id: letter.id,
        title: letter.title,
        slug: letter.slug,
        published: letter.published,
        publishedAt: letter.publishedAt,
        createdAt: letter.createdAt,
        authorId: letter.authorId,
        author: {
          name: user?.name || user?.email?.split('@')[0] || 'Автор'
        }
      };
    });

    // If debug + all=1, also fetch counts for published/unpublished for diagnosis
    let extraDebug: any = undefined;
    if (includeUnpublishedSample) {
      try {
        const pubResp = await supabase.from('letters').select('*', { count: 'exact', head: true }).eq('published', true);
        const unpubResp = await supabase.from('letters').select('*', { count: 'exact', head: true }).eq('published', false);
        const pubCount = pubResp.count ?? 0;
        const unpubCount = unpubResp.count ?? 0;
        // sample a few unpublished rows
        const { data: sampleUnpublished } = await supabase.from('letters').select('id, title, slug, published, publishedAt, createdAt, authorId').eq('published', false).limit(10);
        extraDebug = { publishedCount: pubCount, unpublishedCount: unpubCount, sampleUnpublished };
      } catch (e) {
        extraDebug = { error: String(e) };
      }
    }

    let outDebug: any = undefined;
    if (includeDebugForRequest) {
      outDebug = buildSafeDebug(request, {
        restStatus: 200,
        restBody: { itemCount: transformedLetters.length }
      });
      if (extraDebug) outDebug.extra = extraDebug;
    }

    return NextResponse.json({ letters: transformedLetters, debug: outDebug });

  } catch (e) {
    console.error('Letters API unexpected error:', e);
    const outDebug = buildSafeDebug(request, { errors: [String(e)] });
    return NextResponse.json(
      { 
        error: String(e), 
        debug: includeDebugForRequest ? outDebug : undefined 
      }, 
      { status: 500 }
    );
  }
}