// lib/attachTagsToArticles.js
// Refactored implementation:
// - No service-role fallback attempts (do not try srvSupabase on 42501)
// - Assume RLS is configured to allow SELECT on ArticleToTag and tags
// - Always return JSON-serializable results (JSON round-trip)
// - On DB error (except permission-related attempts), log and return empty tags
// - Does not mutate input objects
export async function attachTagsToArticles(supabase: any, articles: any[]): Promise<any[]> {
  // Defensive: ensure articles is an array
  if (!Array.isArray(articles) || articles.length === 0) return [];

  // Emergency fast-path: when EMERGENCY_ATTACH_TAGS=true, skip DB reads and
  // return empty tag lists. This avoids permission or serialization issues in prod
  // while a targeted fix is prepared and deployed. Controlled by env var so
  // we can enable it immediately without a code revert later.
  try {
    // If emergency flag is set, do not immediately return empty tags anymore.
    // Instead, log and attempt to read from the normalized `article_to_tag_view`
    // as a safe fallback (this preserves tag attachment when the raw
    // `_ArticleToTag` table is inaccessible or has differing column names).
    if (
      typeof process !== 'undefined' &&
      process.env &&
      process.env.EMERGENCY_ATTACH_TAGS === 'true'
    ) {
      console.warn(
        'EMERGENCY_ATTACH_TAGS=true — will attempt read from article_to_tag_view before returning empty tag lists'
      );
    }
  } catch (e) {
    // ignore and continue normally
  }

  try {
    // Extract article IDs in a safe numeric/string form and coerce to string
    const articleIds = articles
      .map((a) => a && (a.id ?? a._id ?? a.articleId))
      .filter(Boolean)
      .map((v) => String(v));

    if (articleIds.length === 0) {
      // Nothing to attach
      return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
    }

    // Helper to run a SELECT ... IN(...) query in a defensive way across
    // different supabase-like client shapes and lightweight mocks.
    async function runSelectIn(
      client: any,
      table: string,
      selectCols: string,
      inColumn: string,
      inValues: any[]
    ) {
      if (!client || typeof client.from !== 'function') {
        return { data: null, error: new Error('supabase.from is not a function') };
      }

      const base = client.from(table);
      try {
        // Preferred: select(...).in(...)
        if (base && typeof base.select === 'function') {
          const afterSelect = base.select(selectCols);
          if (afterSelect && typeof afterSelect.in === 'function') {
            const r = await afterSelect.in(inColumn, inValues);
            return { data: (r && r.data) || null, error: (r && r.error) || null };
          }
          // Some mocks return result from select()
          if (afterSelect && (afterSelect.data !== undefined || afterSelect.error !== undefined)) {
            return { data: afterSelect.data || null, error: afterSelect.error || null };
          }
          // last resort: await afterSelect
          try {
            const awaited = await afterSelect;
            return {
              data: (awaited && awaited.data) || null,
              error: (awaited && awaited.error) || null,
            };
          } catch (eAwait) {
            return { data: null, error: eAwait };
          }
        }

        // Alternative: in(...).select(...)
        if (base && typeof base.in === 'function') {
          const r2 = await base.in(inColumn, inValues).select(selectCols);
          return { data: (r2 && r2.data) || null, error: (r2 && r2.error) || null };
        }

        // Maybe base itself is the result
        if (base && (base.data !== undefined || base.error !== undefined)) {
          return { data: base.data || null, error: base.error || null };
        }

        return { data: null, error: new Error('unexpected_supabase_shape') };
      } catch (e: any) {
        return { data: null, error: e && e.message ? new Error(String(e.message)) : e };
      }
    }

    // Query junction table and tags using canonical column names.
    // The schema uses columns "A" (article id) and "B" (tag id) in _ArticleToTag
    const relRes = await runSelectIn(supabase, '_ArticleToTag', 'A,B', 'A', articleIds);
    let relations: any[] | null = relRes.data;
    let relErr: any = relRes.error;

    if (relErr) {
      console.error('attachTagsToArticles: failed to fetch _ArticleToTag relations', relErr);

      // Try reading from the normalized view `article_to_tag_view` if present.
      try {
        const viewRes = await runSelectIn(
          supabase,
          'article_to_tag_view',
          'article_id,tag_id',
          'article_id',
          articleIds
        );
        if (!viewRes.error && Array.isArray(viewRes.data) && viewRes.data.length > 0) {
          // Normalize view rows into { A, B } shape expected downstream
          relations = (viewRes.data || []).map((r) => ({ A: r.article_id, B: r.tag_id }));
          relErr = null;
          if (relations.length > 0)
            console.debug(
              'attachTagsToArticles: used article_to_tag_view fallback, relations loaded=',
              relations.length
            );
        }
      } catch (ve) {
        console.error('attachTagsToArticles: article_to_tag_view fallback failed', ve);
      }

      // Optional controlled service-role fallback: only run if explicitly enabled
      // via env var `ALLOW_SERVICE_ROLE_ATTACH_TAGS=true`. Default behavior is
      // to NOT attempt the service-role retry to avoid unexpected privilege use.
      const allowSrvFallback =
        typeof process !== 'undefined' &&
        process.env &&
        process.env.ALLOW_SERVICE_ROLE_ATTACH_TAGS === 'true';
      if (allowSrvFallback && relErr && relErr.code === '42501') {
        try {
          console.warn(
            'attachTagsToArticles: permission denied, attempting service-role fallback (ALLOW_SERVICE_ROLE_ATTACH_TAGS=true)'
          );
          const { getServerSupabaseClient } = await import('./serverAuth');
          const srv = getServerSupabaseClient({ useServiceRole: true });
          const rr = await runSelectIn(srv, '_ArticleToTag', 'A,B', 'A', articleIds);
          if (!rr.error && rr.data) {
            relations = rr.data;
          } else {
            console.error('attachTagsToArticles: service-role retry failed', rr.error);
            return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
          }
        } catch (e) {
          console.error('attachTagsToArticles: service-role fallback encountered error', e);
          return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
        }
      }

      // If we didn't replace relations above, return safe empty tags
      if (!relations) {
        return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
      }
    }

    // Normalize relation IDs to strings (DB may store UUID or integer)
    const tagIds = Array.from(
      new Set(
        ((relations || []) as any[])
          .map((r: any) => (r && r.B ? String(r.B) : null))
          .filter(Boolean)
      )
    );

    let tagsById: Record<string, any> = {};
    if (tagIds.length > 0) {
      // Use configured tags table name (default "Tag") to fetch tag rows.
      const TAGS_TABLE =
        (typeof process !== 'undefined' && process.env && process.env.TAGS_TABLE_NAME) || 'Tag';
      try {
        const tagRes = await runSelectIn(supabase, TAGS_TABLE, 'id,name,slug', 'id', tagIds);
        if (tagRes.error) {
          console.error(
            'attachTagsToArticles: failed to fetch tags from table ' + TAGS_TABLE,
            tagRes.error
          );
          return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
        }
        const tags: any[] = tagRes.data || [];
        tagsById = (tags || []).reduce((acc: Record<string, any>, t: any) => {
          const key = t && t.id ? String(t.id) : null;
          if (key) acc[key] = t;
          return acc;
        }, {});
      } catch (e) {
        console.error(
          'attachTagsToArticles: unexpected error when fetching tags from ' + TAGS_TABLE,
          e
        );
        return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
      }
    }

    // Build tags list per article
    const tagsMap: Record<string, any[]> = ((relations || []) as any[]).reduce(
      (acc: Record<string, any[]>, rel: any) => {
        const aid = rel && rel.A ? String(rel.A) : null;
        const tid = rel && rel.B ? String(rel.B) : null;
        if (!aid || !tid) return acc;
        if (!acc[aid]) acc[aid] = [];
        const tag = tagsById[tid];
        if (tag) acc[aid].push(tag);
        return acc;
      },
      {} as Record<string, any[]>
    );

    // Attach tags, do not mutate original objects
    const result = articles.map((a: any) => {
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
