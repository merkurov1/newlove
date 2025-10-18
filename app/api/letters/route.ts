import { createClient } from '@/lib/supabase/server';
import buildSafeDebug from '@/lib/debug';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const debugEnabled = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
  const url = new URL(request.url);
  const includeDebugForRequest = debugEnabled || url.searchParams.get('debug') === '1';

  try {
    const supabase = createClient({ useServiceRole: true });
    
    const { data: letters, error } = await supabase
      .from('letters')
      .select('id, title, slug, published, publishedAt, createdAt, authorId, User!letters_authorId_fkey(id, name, email)')
      .eq('published', true)
      .order('publishedAt', { ascending: false })
      .limit(100);

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

    const outDebug = includeDebugForRequest 
      ? buildSafeDebug(request, { 
        restStatus: 200, 
        restBody: { itemCount: transformedLetters.length } 
      }) 
      : undefined;

    return NextResponse.json({ 
      letters: transformedLetters, 
      debug: outDebug 
    });

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