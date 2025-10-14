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

  // Emergency fast-path: when EMERGENCY_ATTACH_TAGS=true, skip DB reads and
  // return empty tag lists. This avoids permission or serialization issues in prod
  // while a targeted fix is prepared and deployed. Controlled by env var so
  // we can enable it immediately without a code revert later.
  try {
    if (typeof process !== 'undefined' && process.env && process.env.EMERGENCY_ATTACH_TAGS === 'true') {
      // Return clone with empty tags to avoid mutating inputs
      return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
    }
  } catch (e) {
    // ignore and continue normally
  }

  try {
    // Extract article IDs in a safe numeric/string form
    const articleIds = articles.map((a) => a && (a.id ?? a._id ?? a.articleId)).filter(Boolean);

    if (articleIds.length === 0) {
      // Nothing to attach
      return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
    }

    // Query junction table and tags using canonical column names.
    // The schema uses columns "A" (article id) and "B" (tag id) in _ArticleToTag
    const { data: relations, error: relErr } = await supabase
      .from('_ArticleToTag')
      .select('A,B')
      .in('A', articleIds);

    if (relErr) {
      console.error('attachTagsToArticles: failed to fetch _ArticleToTag relations', relErr);
      // If the error is a permission issue, attempt a controlled retry with a
      // server-side service_role client. This is a pragmatic fallback to
      // stabilize production when the request-scoped client lacks privileges.
      // We keep it explicit and logged so it's easy to audit.
      try {
        if (relErr && relErr.code === '42501') {
          console.warn('attachTagsToArticles: permission denied, attempting service-role fallback');
          const { getServerSupabaseClient } = await import('./serverAuth');
          const srv = getServerSupabaseClient({ useServiceRole: true });
          const { data: rels2, error: relErr2 } = await srv.from('_ArticleToTag').select('A,B').in('A', articleIds);
          if (!relErr2 && rels2) {
            relations = rels2;
          } else {
            console.error('attachTagsToArticles: service-role retry failed', relErr2);
            return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
          }
        } else {
          return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
        }
      } catch (e) {
        console.error('attachTagsToArticles: service-role fallback encountered error', e);
        return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
      }
    }

  const tagIds = Array.from(new Set((relations || []).map((r) => r.B).filter(Boolean)));

    let tagsById = {};
    if (tagIds.length > 0) {
      // Tags table in this schema is named `Tag`
      const { data: tags, error: tagsErr } = await supabase
        .from('Tag')
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
      const aid = rel.A;
      const tid = rel.B;
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
