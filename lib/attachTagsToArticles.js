// lib/attachTagsToArticles.js
// Helper to attach tags to articles when the DB doesn't expose a direct foreign-key
// relationship that PostgREST can use in nested selects (e.g. `tags:tags(*)`).
export async function attachTagsToArticles(supabase, articles) {
  if (!supabase || !Array.isArray(articles) || articles.length === 0) return articles;
  const ids = articles.map(a => a.id).filter(Boolean);
  if (ids.length === 0) return articles;

  try {
    // 1) get relations from junction table - historical schema uses _ArticleToTag with columns A (article id) and B (tag id)
    let { data: rels, error: relErr } = await supabase.from('_ArticleToTag').select('A,B').in('A', ids);
    // If permission denied for the junction table, retry with a privileged server client
    if (relErr && (relErr.code === '42501' || /permission denied/i.test(String(relErr.message)))) {
      try {
        const srv = await import('@/lib/serverAuth');
        const srvSupabase = srv.getServerSupabaseClient();
        const srvResp = await srvSupabase.from('_ArticleToTag').select('A,B').in('A', ids);
        rels = srvResp.data;
        relErr = srvResp.error;
      } catch (e) {
        console.error('attachTagsToArticles: error retrying junction with service role', e);
        return articles;
      }
    }
    if (relErr) {
      console.error('attachTagsToArticles: error fetching junction relations', relErr);
      return articles;
    }
    if (!rels || rels.length === 0) return articles.map(a => ({ ...a, tags: [] }));

    const tagIds = Array.from(new Set(rels.map(r => r.B).filter(Boolean)));
    if (tagIds.length === 0) return articles.map(a => ({ ...a, tags: [] }));

    // 2) try lowercase 'tags' first, fall back to 'Tag' if necessary
    let tagsResp = await supabase.from('tags').select('*').in('id', tagIds);
    // If tags select fails due to permissions, retry with service role (if available)
    if (tagsResp && tagsResp.error && (tagsResp.error.code === '42501' || /permission denied/i.test(String(tagsResp.error.message)))) {
      try {
        const srv = await import('@/lib/serverAuth');
        const srvSupabase = srv.getServerSupabaseClient();
        tagsResp = await srvSupabase.from('tags').select('*').in('id', tagIds);
      } catch (e) {
        console.error('attachTagsToArticles: error retrying tags with service role', e);
      }
    }
    if (tagsResp && tagsResp.error) {
      // try fallback name with original client
      tagsResp = await supabase.from('Tag').select('*').in('id', tagIds);
      // if still error, try service role fallback for fallback name
      if (tagsResp && tagsResp.error && (tagsResp.error.code === '42501' || /permission denied/i.test(String(tagsResp.error.message)))) {
        try {
          const srv = await import('@/lib/serverAuth');
          const srvSupabase = srv.getServerSupabaseClient();
          tagsResp = await srvSupabase.from('Tag').select('*').in('id', tagIds);
        } catch (e) {
          console.error('attachTagsToArticles: error retrying Tag fallback with service role', e);
        }
      }
    }
    const tags = (tagsResp && tagsResp.data) || [];

    const tagMap = new Map(tags.map(t => [t.id, t]));
    const articleTags = new Map();
    rels.forEach(r => {
      if (!r || !r.A) return;
      const arr = articleTags.get(r.A) || [];
      const tag = tagMap.get(r.B);
      if (tag) arr.push(tag);
      articleTags.set(r.A, arr);
    });

    return articles.map(a => ({ ...a, tags: articleTags.get(a.id) || [] }));
  } catch (e) {
    console.error('attachTagsToArticles: unexpected error', e);
    return articles.map(a => ({ ...a, tags: [] }));
  }
}
