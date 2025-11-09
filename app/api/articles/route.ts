export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
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
  const excludeTag = searchParams.get('excludeTag') || null;
  const includeTag = searchParams.get('includeTag') || null;

    if (limit <= 0) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (!supabase) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Prepare exclusion list if requested
    let excludedIds = [];
    if (excludeTag) {
      try {
        const { getTagBySlug, readArticleRelationsForTagStrict } = await import('@/lib/tagHelpers');
        const tag = await getTagBySlug(supabase, excludeTag);
        if (tag && tag.id) {
          const rel = await readArticleRelationsForTagStrict(supabase, tag.id);
          if (rel && Array.isArray(rel)) {
            excludedIds = Array.from(new Set(rel.map(r => r && (r.A || r.article_id || r.articleId || r.a || r.article || null)).filter(Boolean)));
          }
        }
      } catch (e) {
        console.error('Failed to compute excluded ids for tag', excludeTag, e);
      }
    }

    // If includeTag is provided, use RPC to fetch articles for that tag (server-side)
    let data, error;
    if (includeTag) {
      try {
        // Use the existing RPC function to get articles for a tag
        const resp = await supabase.rpc('get_articles_by_tag_slug', { 
          tag_slug: includeTag, 
          limit_param: limit + 5 // Запрашиваем чуть больше для фильтрации
        });
        data = resp.data;
        error = resp.error;
        
        // Применяем offset вручную, так как RPC не поддерживает .range()
        if (data && Array.isArray(data)) {
          data = data.slice(offset, offset + limit);
        }
      } catch (e) {
        data = null;
        error = e;
      }
    } else {
      // Try to exclude soft-deleted rows if the deployment has `deletedAt` column.
      for (const col of ['deletedAt', 'deleted_at', 'deleted', null]) {
        try {
          let q = supabase
            .from('articles')
            .select('id,title,slug,content,publishedAt')
            .eq('published', true)
            .order('publishedAt', { ascending: false })
            .range(offset, offset + limit - 1);
          if (col) q = q.is(col, null);
          if (excludedIds.length > 0) {
            const quoted = excludedIds.map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
            q = q.not('id', 'in', `(${quoted})`);
          }
          const resp = await q;
          data = resp.data;
          error = resp.error;
          if (error) throw error;
          // success
          break;
        } catch (e) {
          // try next deleted col variant
          data = null;
          error = e;
          continue;
        }
      }
    }

    if (error) {
      console.error('Supabase fetch articles error', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch articles' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Enrich with previewImage server-side so client infinite scroll get thumbnails
    try {
      const { getFirstImage } = await import('@/lib/contentUtils');
      const enriched = await Promise.all((data || []).map(async (a: any) => {
        let preview_image = null;
        try { preview_image = a.content ? await getFirstImage(a.content) : null; } catch (e) { preview_image = null; }
        return { id: a.id, title: a.title, slug: a.slug, content: a.content, publishedAt: a.publishedAt, preview_image };
      }));
      return new Response(JSON.stringify(enriched), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify(data || []), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch articles' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
