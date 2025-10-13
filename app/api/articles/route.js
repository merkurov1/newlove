export const dynamic = 'force-dynamic';
import { getUserAndSupabaseFromRequest } from '@/lib/supabase-server';

export async function GET(request) {
  try {
    const { supabase } = await getUserAndSupabaseFromRequest(request);
    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '15', 10);

    if (limit <= 0) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (!supabase) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const { data, error } = await supabase
      .from('article')
      .select('id,title,slug,content,publishedAt')
      .eq('published', true)
      .order('publishedAt', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Supabase fetch articles error', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch articles' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(data || []), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch articles' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
