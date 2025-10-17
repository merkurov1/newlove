// lib/tagHelpers.js
import { getFirstImage } from '@/lib/contentUtils';

const TABLE_CANDIDATES = ['Tag', 'tags', 'tag', 'Tags'];
const DELETED_COLS = ['deletedAt', 'deleted_at', 'deleted', 'deletedAtAt', 'removed_at'];

const JUNCTION_CANDIDATES = ['_ArticleToTag', 'ArticleToTag', 'article_to_tag', 'article_tags', 'article_tag', 'articletotag'];

async function readArticleRelationsForTag(supabase, tagId) {
  // Try multiple possible junction table names and column shapes.
  for (const tbl of JUNCTION_CANDIDATES) {
    try {
      // Try common column names until one succeeds
      const tryCols = ['tag_id', 'tagId', 'B', 'b', 'tag', 'tags'];
      for (const col of tryCols) {
        try {
          const res = await supabase.from(tbl).select('*').eq(col, tagId).limit(2000);
          if (res && !res.error && Array.isArray(res.data) && res.data.length > 0) return res.data;
        } catch (e) {
          // ignore and try next col
        }
      }
    } catch (e) {
      // table doesn't exist or permission denied; try next table
      continue;
    }
  }
  return [];
}

function extractArticleIdFromRelRow(row) {
  if (!row || typeof row !== 'object') return null;
  // Candidate keys that may contain article id
  const candidates = ['A', 'a', 'article_id', 'articleId', 'article', 'A_id', 'a_id', 'articleId1', 'article_id1', 'article_ref', 'article_uuid', 'articleId0'];
  for (const k of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, k) && row[k]) {
      const v = row[k];
      if (typeof v === 'object') {
        if (v.id) return v.id;
        if (v._id) return v._id;
        // try to find nested id-like prop
        for (const nk of Object.keys(v)) {
          if (nk.toLowerCase().includes('id') && v[nk]) return v[nk];
        }
        continue;
      }
      return v;
    }
  }
  // If the row contains nested objects like { article: { id: '...' } }
  if (row.article && typeof row.article === 'object') {
    if (row.article.id) return row.article.id;
    if (row.article._id) return row.article._id;
    if (row.article.slug && row.article.id === undefined) {
      // sometimes article object has slug but id under a nested field
      for (const k of Object.keys(row.article)) {
        if (k.toLowerCase().includes('id') && row.article[k]) return row.article[k];
      }
    }
  }
  if (row.A && typeof row.A === 'object') {
    if (row.A.id) return row.A.id;
    if (row.A._id) return row.A._id;
  }
  // Fallback: find first property that looks like uuid or numeric id
  for (const key of Object.keys(row)) {
    const val = row[key];
    if (!val) continue;
    if (typeof val === 'string' && val.length >= 6) return val;
    if (typeof val === 'number') return val;
    // if nested object, try to extract primitive id
    if (typeof val === 'object') {
      if (val.id) return val.id;
      if (val._id) return val._id;
      for (const nk of Object.keys(val)) {
        const nv = val[nk];
        if (!nv) continue;
        if (typeof nv === 'string' && nv.length >= 6) return nv;
        if (typeof nv === 'number') return nv;
      }
    }
  }
  return null;
}

async function normalizeArticle(a) {
  if (!a || typeof a !== 'object') return null;
  return {
    id: a.id || a._id || a.article_id || a.articleId || null,
    title: a.title || (a.article && a.article.title) || '',
    slug: a.slug || (a.article && a.article.slug) || '/',
    content: a.content || null,
    publishedAt: a.publishedAt || a.updatedAt || null,
    updatedAt: a.updatedAt || null,
    author: a.author || null,
    previewImage: a.content ? await getFirstImage(a.content) : (a.previewImage || a.preview_image || null),
  };
}

function extractIdFromArticleLike(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.id) return obj.id;
  if (obj.article_id) return obj.article_id;
  if (obj.article && (obj.article.id || obj.article._id)) return obj.article.id || obj.article._id;
  if (obj.A && (obj.A.id || obj.A._id)) return obj.A.id || obj.A._id;
  // try typical nested shapes
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (!v) continue;
    if (typeof v === 'object') {
      if (v.id) return v.id;
      if (v._id) return v._id;
    }
    if (typeof v === 'string' && v.length >= 6) return v;
    if (typeof v === 'number') return v;
  }
  return null;
}

// Try RPC first, then fallback to junction table lookup using _ArticleToTag
export async function getArticlesByTag(supabase, tagSlugOrName, limit = 50) {
  if (!supabase) return [];
  try {
    // Attempt RPC; but we'll also fetch junction-based ids and combine them to be tolerant
    let rpcData = [];
    try {
      const rpc = await supabase.rpc('get_articles_by_tag', { tag_slug: tagSlugOrName });
      rpcData = (rpc && (rpc.data || rpc)) || [];
    } catch (e) {
      // rpc absent or failed: continue to fallback
      rpcData = [];
    }

    // If RPC returned full article objects (not only ids), prefer returning them directly
    if (Array.isArray(rpcData) && rpcData.length > 0) {
      const looksLikeArticle = rpcData.every(item => item && (item.id || item.title || item.slug));
      if (looksLikeArticle) {
        const out = [];
        for (const a of rpcData.slice(0, limit)) {
          try { out.push(await normalizeArticle(a)); } catch (e) { /* ignore malformed */ }
        }
        if (out.length > 0) return out;
      }
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

  // Read relations from junction table (try multiple shapes)
  const rels = await readArticleRelationsForTag(supabase, tag.id) || [];
  const junctionIds = Array.from(new Set((rels || []).map(r => extractArticleIdFromRelRow(r)).filter(Boolean)));
  // Pull ids from rpcData as well
  const rpcIds = Array.from(new Set((rpcData || []).map(d => extractArticleIdFromRelRow(d) || extractIdFromArticleLike(d)).filter(Boolean)));
  // Combine both sources (union) to maximize coverage
  const ids = Array.from(new Set([...junctionIds.map(String), ...rpcIds.map(String)]));
  const DEBUG = !!(process && process.env && process.env.TAG_HELPERS_DEBUG);
  if (DEBUG) console.debug('[tagHelpers] rpcIds:', rpcIds.length, 'junctionIds:', junctionIds.length, 'unionIds:', ids.length);
  if (!ids || ids.length === 0) return [];

    // Try several tolerant SELECT shapes and published-flag variants.
    const selectCandidates = [
      'id,title,slug,content,publishedAt,updatedAt,author:authorId(name)',
      'id,title,slug,content,publishedAt,updatedAt,author',
      '*'
    ];
    const publishedCandidates = ['published', 'is_published', 'published_at', 'publishedAt', null];
    let arts = [];
    for (const sel of selectCandidates) {
      for (const pubCol of publishedCandidates) {
        for (const col of [...DELETED_COLS, null]) {
          try {
            let q = supabase.from('articles')
              .select(sel)
              .in('id', ids)
              .order('publishedAt', { ascending: false })
              .limit(limit);
            if (pubCol) {
              try { q = q.eq(pubCol, true); } catch (e) { /* ignore if col absent */ }
            }
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
        if (arts.length) break;
      }
      if (arts.length) break;
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
    if (DEBUG) console.debug('[tagHelpers] returning normalized articles count=', out.length);
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
        tagArticleIds = Array.from(new Set(rpcData.map(a => a && (a.id || a.article_id)).filter(Boolean)));
      }
    } catch (e) {
      // ignore rpc failure and fallback to junction lookup
    }

    // If RPC didn't yield ids, try junction table lookup via tag row (robust)
    if (!tagArticleIds || tagArticleIds.length === 0) {
      const tag = await getTagBySlug(supabase, tagSlugOrName);
      if (tag && tag.id) {
        try {
          const rel = await readArticleRelationsForTag(supabase, tag.id);
          if (rel && Array.isArray(rel)) {
            tagArticleIds = Array.from(new Set(rel.map(r => extractArticleIdFromRelRow(r)).filter(Boolean)));
            // combine rpc if it existed earlier (double-check)
            try {
              const rpc2 = await supabase.rpc('get_articles_by_tag', { tag_slug: tagSlugOrName });
              const rpcData2 = (rpc2 && (rpc2.data || rpc2)) || [];
              const rpcIds2 = Array.from(new Set((rpcData2 || []).map(d => d && (d.id || d.article_id)).filter(Boolean)));
              tagArticleIds = Array.from(new Set([...tagArticleIds.map(String), ...rpcIds2.map(String)]));
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          // fallback to empty list
          tagArticleIds = [];
        }
      }
    }

    // Now query articles excluding the tagArticleIds
  const excluded = Array.isArray(tagArticleIds) && tagArticleIds.length > 0 ? Array.from(new Set(tagArticleIds.map(id => String(id)))) : [];

  const DEBUG = !!(process && process.env && process.env.TAG_HELPERS_DEBUG);
  if (DEBUG) console.log('[tagHelpers] excluding ids for tag', tagSlugOrName, excluded.slice(0, 20));

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
          // Prefer using .not with array when supported by client
          try {
            q = q.not('id', 'in', `(${excluded.join(',')})`);
          } catch (e) {
            // fallback: build string-quoted list
            const quoted = excluded.map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
            q = q.not('id', 'in', `(${quoted})`);
          }
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

const tagHelpers = {
  getArticlesByTag,
  getTagBySlug,
  getArticlesExcludingTag,
  readArticleRelationsForTag,
};

export default tagHelpers;
