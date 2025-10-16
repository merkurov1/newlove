export const dynamic = 'force-dynamic';

// Use dynamic import to avoid circular-import / ESM interop issues during build
// (some bundles may not expose named exports reliably when circular imports exist).


export async function GET(request) {
  try {
  // Use server service-role client for public article listing
  let supabase = null;
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    supabase = getServerSupabaseClient({ useServiceRole: true });
  } catch (e) {
    // Fallback to request-scoped client if service client not available
    const { getSupabaseForRequest } = await import('@/lib/getSupabaseForRequest');
    supabase = (await getSupabaseForRequest(request))?.supabase;
  }
    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '15', 10);

    if (limit <= 0) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (!supabase) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Try to exclude soft-deleted rows if the deployment has `deletedAt` column.
    let data, error;
    try {
      const resp = await supabase
        .from('articles')
        .select('id,title,slug,content,publishedAt')
        .eq('published', true)
        .is('deletedAt', null)
        .order('publishedAt', { ascending: false })
        .range(offset, offset + limit - 1);
      data = resp.data;
      error = resp.error;
      if (error) throw error;
    } catch (e) {
      // If the `deletedAt` column doesn't exist, retry without that filter
      const resp = await supabase
        .from('articles')
        .select('id,title,slug,content,publishedAt')
        .eq('published', true)
        .order('publishedAt', { ascending: false })
        .range(offset, offset + limit - 1);
      data = resp.data;
      error = resp.error;
    }

    if (error) {
      console.error('Supabase fetch articles error', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch articles' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Enrich with previewImage server-side so client infinite scroll get thumbnails
    try {
      const { getFirstImage } = await import('@/lib/contentUtils');
      const enriched = await Promise.all((data || []).map(async (a) => {
        let previewImage = null;
        try { previewImage = a.content ? await getFirstImage(a.content) : null; } catch (e) { previewImage = null; }
        return { id: a.id, title: a.title, slug: a.slug, content: a.content, publishedAt: a.publishedAt, previewImage };
      }));
      return new Response(JSON.stringify(enriched), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify(data || []), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch articles' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
