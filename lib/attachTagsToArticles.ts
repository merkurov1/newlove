// lib/attachTagsToArticles.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function attachTagsToArticles(supabase: SupabaseClient | any, articles: any[]): Promise<any[]> {
  if (!Array.isArray(articles) || articles.length === 0) return [];
  // Quick global disable for the junction table (useful for emergency testing)
  try {
    if (typeof process !== 'undefined' && process.env && process.env.DISABLE_ARTICLE_TO_TAGS === 'true') {
      console.warn('attachTagsToArticles: DISABLE_ARTICLE_TO_TAGS=true -> skipping junction reads and returning empty tags');
      return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
    }
  } catch (e) {
    // ignore and continue
  }
  try {
    if (typeof process !== 'undefined' && process.env && process.env.EMERGENCY_ATTACH_TAGS === 'true') {
      return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
    }
  } catch (e) {
    // ignore
  }

  try {
    const articleIds = articles.map((a) => a && (a.id ?? a._id ?? a.articleId)).filter(Boolean);
    if (articleIds.length === 0) {
      return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
    }

    const { data: relations, error: relErr } = await supabase.from('_ArticleToTag').select('A,B').in('A', articleIds);
    if (relErr) {
      console.error('attachTagsToArticles: failed to fetch _ArticleToTag relations', relErr);
      // Controlled service-role fallback
      try {
        if (relErr && (relErr.code === '42501' || relErr.status === 42501)) {
          const { getServerSupabaseClient } = await import('./serverAuth');
          const srv = getServerSupabaseClient();
          const { data: rels2, error: relErr2 } = await srv.from('_ArticleToTag').select('A,B').in('A', articleIds);
          if (!relErr2 && rels2) {
            (relations as any) = rels2;
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

    const tagIds = Array.from(new Set((relations || []).map((r: any) => r.B).filter(Boolean)));
    let tagsById: Record<string, any> = {};
    if (tagIds.length > 0) {
      const { data: tags, error: tagsErr } = await supabase.from('Tag').select('id,name,slug').in('id', tagIds);
      if (tagsErr) {
        console.error('attachTagsToArticles: failed to fetch tags', tagsErr);
        return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
      }
      tagsById = (tags || []).reduce((acc: any, t: any) => { acc[t.id] = t; return acc; }, {});
    }

    const tagsMap = (relations || []).reduce((acc: any, rel: any) => {
      const aid = rel.A;
      const tid = rel.B;
      if (!acc[aid]) acc[aid] = [];
      const tag = tagsById[tid];
      if (tag) acc[aid].push(tag);
      return acc;
    }, {});

    const result = articles.map((a) => {
      const aid = a && (a.id ?? a._id ?? a.articleId);
      const attached = tagsMap[aid] || [];
      return { ...a, tags: attached };
    });

    return JSON.parse(JSON.stringify(result));
  } catch (error) {
    console.error('attachTagsToArticles: unexpected error', error);
    try {
      return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
    } catch (e) {
      return [];
    }
  }
}

export default attachTagsToArticles;
