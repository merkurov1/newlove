// lib/tagHelpers.js
import { getFirstImage } from '@/lib/contentUtils';

const TABLE_CANDIDATES = ['Tag', 'tags', 'tag', 'Tags'];
const DELETED_COLS = ['deletedAt', 'deleted_at', 'deleted'];

async function normalizeArticle(a) {
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    content: a.content,
    publishedAt: a.publishedAt || a.updatedAt || null,
    updatedAt: a.updatedAt || null,
    author: a.author || null,
    previewImage: a.content ? await getFirstImage(a.content) : null,
  };
}

// Try RPC first, then fallback to junction table lookup using _ArticleToTag
export async function getArticlesByTag(supabase, tagSlugOrName, limit = 50) {
  if (!supabase) return [];
  try {
    // RPC-first
    try {
      const rpc = await supabase.rpc('get_articles_by_tag', { tag_slug: tagSlugOrName });
      const data = (rpc && (rpc.data || rpc)) || [];
      if (Array.isArray(data) && data.length > 0) {
        const normalizedAll = [];
        for (const a of data) {
          try {
            normalizedAll.push(await normalizeArticle(a));
          } catch (e) {
            // skip
          }
        }
        // dedupe and cap
        const seen = new Set();
        const out = [];
        for (const x of normalizedAll) {
          if (!x || !x.id) continue;
          if (seen.has(String(x.id))) continue;
          seen.add(String(x.id));
          out.push(x);
          if (out.length >= limit) break;
        }
        return out;
      }
    } catch (e) {
      // rpc absent or failed: continue to fallback
    }

    // Find tag row tolerant across candidate table names
    const configured = (typeof process !== 'undefined' && process.env && process.env.TAGS_TABLE_NAME) || null;
    const tables = configured ? [configured, ...TABLE_CANDIDATES] : TABLE_CANDIDATES;
    const slugVariants = Array.from(new Set([String(tagSlugOrName || '').trim(), String(tagSlugOrName || '').toLowerCase()].filter(Boolean)));
    let tag = null;
    for (const tbl of tables) {
      try {
        for (const s of slugVariants) {
          // try exact slug/name matches case-insensitive
          try {
            const res = await supabase.from(tbl).select('id,slug,name').ilike('slug', s).limit(1);
            if (res && res.data && res.data[0]) { tag = res.data[0]; break; }
          } catch (e) {}
          try {
            const res2 = await supabase.from(tbl).select('id,slug,name').ilike('name', s).limit(1);
            if (res2 && res2.data && res2.data[0]) { tag = res2.data[0]; break; }
          } catch (e) {}
        }
      } catch (e) {
        // try next table
      }
      if (tag) break;
    }
    if (!tag) return [];

    // Read relations from junction table
    const { data: rels } = await supabase.from('_ArticleToTag').select('A').eq('B', tag.id);
    const ids = Array.from(new Set((rels || []).map(r => r && r.A).filter(Boolean)));
    if (ids.length === 0) return [];

    // Try common deleted column variants when selecting articles
    let arts = [];
    for (const col of [...DELETED_COLS, null]) {
      try {
        let q = supabase.from('articles')
          .select('id,title,slug,content,publishedAt,updatedAt,author:authorId(name)')
          .in('id', ids)
          .eq('published', true)
          .order('publishedAt', { ascending: false })
          .limit(limit);
        if (col) q = q.is(col, null);
        const res = await q;
        if (res && !res.error && Array.isArray(res.data) && res.data.length > 0) {
          arts = res.data;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    if (!Array.isArray(arts) || arts.length === 0) return [];

    // Normalize, dedupe, cap
    const out = [];
    const seen = new Set();
    for (const a of arts) {
      if (!a || !a.id) continue;
      if (seen.has(String(a.id))) continue;
      seen.add(String(a.id));
      out.push(await normalizeArticle(a));
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.error('tagHelpers.getArticlesByTag error', e);
    return [];
  }
}

export async function getTagBySlug(supabase, slug) {
  if (!supabase) return null;
  const configured = (typeof process !== 'undefined' && process.env && process.env.TAGS_TABLE_NAME) || null;
  const tables = configured ? [configured, ...TABLE_CANDIDATES] : TABLE_CANDIDATES;
  const slugVariants = Array.from(new Set([String(slug || '').trim(), String(slug || '').toLowerCase()].filter(Boolean)));
  let tag = null;
  for (const tbl of tables) {
    try {
      for (const s of slugVariants) {
        try {
          const res = await supabase.from(tbl).select('*').ilike('slug', s).limit(1);
          if (res && res.data && res.data[0]) return res.data[0];
        } catch (e) {}
        try {
          const res2 = await supabase.from(tbl).select('*').ilike('name', s).limit(1);
          if (res2 && res2.data && res2.data[0]) return res2.data[0];
        } catch (e) {}
      }
    } catch (e) {
      // continue
    }
  }
  return null;
}

// Return articles that are NOT associated with the given tag (by slug or name).
// Useful for homepage main feed when we want to exclude auction-tagged articles.
export async function getArticlesExcludingTag(supabase, tagSlugOrName, limit = 15) {
  if (!supabase) return [];
  try {
    // 1) determine article IDs that belong to the tag
    let tagArticleIds = [];

    // Try RPC to fetch ids for performance if available
    try {
      const rpc = await supabase.rpc('get_articles_by_tag', { tag_slug: tagSlugOrName });
      const rpcData = (rpc && (rpc.data || rpc)) || [];
      if (Array.isArray(rpcData) && rpcData.length > 0) {
        tagArticleIds = Array.from(new Set(rpcData.map(a => a && a.id).filter(Boolean)));
      }
    } catch (e) {
      // ignore rpc failure and fallback to junction lookup
    }

    // If RPC didn't yield ids, try junction table lookup via tag row
    if (!tagArticleIds || tagArticleIds.length === 0) {
      const tag = await getTagBySlug(supabase, tagSlugOrName);
      if (tag && tag.id) {
        try {
          const rel = await supabase.from('_ArticleToTag').select('A').eq('B', tag.id);
          if (rel && !rel.error && Array.isArray(rel.data)) {
            tagArticleIds = Array.from(new Set(rel.data.map(r => r && r.A).filter(Boolean)));
          }
        } catch (e) {
          // fallback to empty list
          tagArticleIds = [];
        }
      }
    }

    // Now query articles excluding the tagArticleIds
    const excluded = Array.isArray(tagArticleIds) && tagArticleIds.length > 0 ? tagArticleIds.map(id => String(id)) : [];

    // Try common deleted column variants
    let arts = [];
    for (const col of [...DELETED_COLS, null]) {
      try {
        let q = supabase.from('articles')
          .select('id,title,slug,content,publishedAt,updatedAt,author:authorId(name)')
          .eq('published', true)
          .order('publishedAt', { ascending: false })
          .limit(limit);
        if (col) q = q.is(col, null);
        if (excluded.length > 0) {
          const quoted = excluded.map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
          q = q.not('id', 'in', `(${quoted})`);
        }
        const res = await q;
        if (res && !res.error && Array.isArray(res.data) && res.data.length > 0) {
          arts = res.data;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!Array.isArray(arts) || arts.length === 0) return [];

    // Normalize, dedupe and cap
    const out = [];
    const seen = new Set();
    for (const a of arts) {
      if (!a || !a.id) continue;
      if (seen.has(String(a.id))) continue;
      seen.add(String(a.id));
      out.push(await normalizeArticle(a));
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.error('tagHelpers.getArticlesExcludingTag error', e);
    return [];
  }
}

export default {
  getArticlesByTag,
  getTagBySlug,
};
