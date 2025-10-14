// lib/attachTagsToArticles.js
// Refactored implementation:
// - No service-role fallback attempts (do not try srvSupabase on 42501)
// - Assume RLS is configured to allow SELECT on ArticleToTag and tags
// - Always return JSON-serializable results (JSON round-trip)
// - On DB error (except permission-related attempts), log and return empty tags
// - Does not mutate input objects
export async function attachTagsToArticles(supabase, articles) {
  // Defensive: ensure articles is an array
  if (!Array.isArray(articles) || articles.length === 0) return [];

  try {
    // Extract article IDs in a safe numeric/string form
    const articleIds = articles.map((a) => a && (a.id ?? a._id ?? a.articleId)).filter(Boolean);

    if (articleIds.length === 0) {
      // Nothing to attach
      return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
    }

    // Query junction table and tags in a single optimized request
    // Assumes RLS allows selecting from _ArticleToTag and tags
    const { data: relations, error: relErr } = await supabase
      .from('_ArticleToTag')
      .select('articleId,tagId')
      .in('articleId', articleIds);

    if (relErr) {
      // Log and return articles with empty tags — do not attempt a service-role retry
      console.error('attachTagsToArticles: failed to fetch _ArticleToTag relations', relErr);
      return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
    }

    const tagIds = Array.from(new Set((relations || []).map((r) => r.tagId).filter(Boolean)));

    let tagsById = {};
    if (tagIds.length > 0) {
      const { data: tags, error: tagsErr } = await supabase
        .from('tags')
        .select('id,name,slug')
        .in('id', tagIds);

      if (tagsErr) {
        console.error('attachTagsToArticles: failed to fetch tags', tagsErr);
        // In case of tags fetch error, still return articles with empty tags
        return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
      }

      tagsById = (tags || []).reduce((acc, t) => {
        acc[t.id] = t;
        return acc;
      }, {});
    }

    // Build tags list per article
    const tagsMap = (relations || []).reduce((acc, rel) => {
      const aid = rel.articleId;
      const tid = rel.tagId;
      if (!acc[aid]) acc[aid] = [];
      const tag = tagsById[tid];
      if (tag) acc[aid].push(tag);
      return acc;
    }, {});

    // Attach tags, do not mutate original objects
    const result = articles.map((a) => {
      const aid = a && (a.id ?? a._id ?? a.articleId);
      const attached = tagsMap[aid] || [];
      return { ...a, tags: attached };
    });

    // Ensure serialization compatibility for RSC
    return JSON.parse(JSON.stringify(result));
  } catch (error) {
    // Catch-all: log and return empty tags to avoid crashing Server Components
    console.error('attachTagsToArticles: unexpected error', error);
    try {
      return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
    } catch (e) {
      // Worst-case fallback
      return [];
    }
  }
}
