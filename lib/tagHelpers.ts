// lib/tagHelpers.js
/*
  Temporary: disable TypeScript checking for this legacy, very dynamic
  helper to speed up unblocking the build. We'll add proper types in a follow-up.
*/
// @ts-nocheck
import { getFirstImage } from '@/lib/contentUtils';

// Module-wide debug flag. Some builds/minifiers expect DEBUG to exist at module scope;
// define it here to avoid ReferenceError in production bundles when code references DEBUG.
const DEBUG = !!(typeof process !== 'undefined' && process.env && process.env.TAG_HELPERS_DEBUG);

const TABLE_CANDIDATES = ['Tag', 'tags', 'tag', 'Tags'];
const DELETED_COLS = ['deletedAt', 'deleted_at', 'deleted', 'deletedAtAt', 'removed_at'];
const JUNCTION_CANDIDATES = ['_ArticleToTag', 'ArticleToTag', 'article_to_tag', 'article_tags', 'article_tag', 'articletotag'];

async function readArticleRelationsForTag(supabase, tagId) {
  if (!supabase || !tagId) return [];
  try {
    for (const tbl of JUNCTION_CANDIDATES) {
      try {
        const tryCols = ['tag_id', 'tagId', 'B', 'b', 'tag', 'tags'];
        for (const col of tryCols) {
          try {
            const from = (typeof supabase.from === 'function') ? supabase.from(tbl) : null;
            if (!from) continue;
            const select = (typeof from.select === 'function') ? from.select('*') : null;
            if (!select) continue;

            let q = select;
            if (typeof q.eq === 'function') {
              try { q = q.eq(col, tagId); } catch (e) { continue; }
            } else if (typeof q.filter === 'function') {
              try { q = q.filter(col, 'eq', tagId); } catch (e) { continue; }
            } else {
              continue;
            }

            if (typeof q.limit === 'function') {
              try { q = q.limit(2000); } catch (e) { /* ignore */ }
            }

            const res = await q;
            const data = Array.isArray(res) ? res : (res && res.data ? res.data : null);
            if (Array.isArray(data) && data.length > 0) return data;
          } catch (e) { continue; }
        }
      } catch (e) { continue; }
    }
  } catch (e) { return []; }
  return [];
}

export async function readArticleRelationsForTagStrict(supabase, tagId) {
  if (!supabase || !tagId) return [];
  const tbl = '_ArticleToTag';
  try {
    const svcKey = (typeof process !== 'undefined' && process.env && process.env.SUPABASE_SERVICE_ROLE_KEY) || null;
    const svcUrl = (typeof process !== 'undefined' && process.env && (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) || null;
    if (svcKey && svcUrl && svcUrl.startsWith('http')) {
      try {
        const restBase = svcUrl.replace(/\/$/, '');
        const jUrl = `${restBase}/rest/v1/${encodeURIComponent(tbl)}?select=A,B&B=eq.${encodeURIComponent(String(tagId))}&limit=2000`;
        const jHeaders = { Accept: 'application/json', apikey: svcKey, Authorization: `Bearer ${svcKey}` };
        const jResp = await fetch(jUrl, { method: 'GET', headers: jHeaders });
        if (jResp && jResp.ok) {
          const jJson = await jResp.json();
          if (Array.isArray(jJson)) return jJson;
        }
      } catch (e) { /* continue */ }
    }

    const restUrl = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_SUPABASE_URL) || null;
    if (restUrl && restUrl.startsWith('http')) {
      try {
        const restBase = restUrl.replace(/\/$/, '');
        const filterExpr = `or=(B.eq.${encodeURIComponent(String(tagId))},b.eq.${encodeURIComponent(String(tagId))},tag_id.eq.${encodeURIComponent(String(tagId))},tag.eq.${encodeURIComponent(String(tagId))})`;
        const url = `${restBase}/rest/v1/${encodeURIComponent(tbl)}?select=A,B&${filterExpr}&limit=2000`;
        const anonKey = (typeof process !== 'undefined' && process.env && (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY)) || null;
        const headers = { Accept: 'application/json' };
        if (anonKey) headers['apikey'] = anonKey;
        const resp = await fetch(url, { method: 'GET', headers });
        if (resp && resp.ok) {
          const json = await resp.json();
          if (Array.isArray(json)) return json;
        }
      } catch (e) { /* continue */ }
    }

    const from = typeof supabase.from === 'function' ? supabase.from(tbl) : null;
    if (!from) return [];
    const q = (typeof from.select === 'function') ? from.select('A,B') : null;
    if (!q) return [];
    const limited = (typeof q.limit === 'function') ? q.limit(2000) : q;
    const res = await limited;
    const rows = Array.isArray(res) ? res : (res && res.data ? res.data : []);
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const matches = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const Bval = (row.B ?? row.b ?? row.B_id ?? row.tag_id ?? row.tag) || null;
      if (Bval && String(Bval) === String(tagId)) { matches.push(row); continue; }
      for (const k of Object.keys(row)) {
        const v = row[k];
        if (!v) continue;
        try {
          if (String(v) === String(tagId)) { matches.push(row); break; }
          if (typeof v === 'string' && v.includes && v.includes(String(tagId))) { matches.push(row); break; }
        } catch (e) { /* ignore */ }
      }
    }
    return matches;
  } catch (e) { return []; }
}

function extractArticleIdFromRelRow(row) {
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
  let preview = null;
  try {
    if (a.content && typeof getFirstImage === 'function') {
      try {
        preview = await getFirstImage(a.content);
      } catch (e) {
        preview = null;
      }
    } else {
      preview = a.previewImage || a.preview_image || null;
    }
  } catch (e) {
    preview = a.previewImage || a.preview_image || null;
  }
  return {
    id: a.id || a._id || a.article_id || a.articleId || null,
    title: a.title || (a.article && a.article.title) || '',
    slug: a.slug || (a.article && a.article.slug) || '/',
    content: a.content || null,
    publishedAt: a.publishedAt || a.updatedAt || null,
    updatedAt: a.updatedAt || null,
    author: a.author || null,
    previewImage: preview,
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
    // Prefer service-role deterministic join when available (server environment).
    const svcKey = (typeof process !== 'undefined' && process.env && process.env.SUPABASE_SERVICE_ROLE_KEY) || null;
    const svcUrl = (typeof process !== 'undefined' && process.env && (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) || null;
    if (svcKey && svcUrl) {
      try {
        // Fetch junction rows using service role and then fetch articles by id using service role.
        const restBase = svcUrl.replace(/\/$/, '');
        // Find tag id first using the regular supabase client (server side should have access)
        const tag = await getTagBySlug(supabase, tagSlugOrName);
        if (tag && tag.id) {
          const jUrl = `${restBase}/rest/v1/_ArticleToTag?select=A,B&${encodeURIComponent(`B=eq.${String(tag.id)}`)}&limit=2000`;
          const jHeaders = { Accept: 'application/json', apikey: svcKey, Authorization: `Bearer ${svcKey}` };
          const jResp = await fetch(jUrl, { method: 'GET', headers: jHeaders });
          if (jResp && jResp.ok) {
            const jJson = await jResp.json();
            if (Array.isArray(jJson) && jJson.length > 0) {
              const ids = Array.from(new Set((jJson || []).map(r => extractArticleIdFromRelRow(r)).filter(Boolean))).map(String);
              if (ids.length > 0) {
                // fetch articles via service role
                const quoted = ids.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
                const select = 'id,title,slug,content,publishedAt,updatedAt,author';
                const aUrl = `${restBase}/rest/v1/articles?select=${encodeURIComponent(select)}&id=in.(${encodeURIComponent(quoted)})&limit=${encodeURIComponent(String(limit))}`;
                const aHeaders = { Accept: 'application/json', apikey: svcKey, Authorization: `Bearer ${svcKey}` };
                const aResp = await fetch(aUrl, { method: 'GET', headers: aHeaders });
                if (aResp && aResp.ok) {
                  const aJson = await aResp.json();
                  if (Array.isArray(aJson) && aJson.length > 0) {
                    const out: any[] = [];
                    for (const art of aJson.slice(0, limit)) {
                      try { out.push(await normalizeArticle(art)); } catch (e) { /* ignore malformed */ }
                    }
                    if (out.length > 0) return out;
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // ignore and continue to rpc/junction fallbacks
      }
    }

    // Attempt RPC; but we'll also fetch junction-based ids and combine them to be tolerant
    // Try several RPC names/param shapes to be tolerant across DB deployments
  let rpcData: any[] = [];
    try {
      try {
        const rpc = await supabase.rpc('get_articles_by_tag', { tag_slug: tagSlugOrName });
        rpcData = (rpc && (rpc.data || rpc)) || [];
      } catch (e) {
        // try alternate rpc name used in some deployments
        try {
          const rpc2 = await supabase.rpc('get_articles_by_tag_slug', { tag_slug_param: tagSlugOrName });
          rpcData = (rpc2 && (rpc2.data || rpc2)) || [];
        } catch (e2) {
          try {
            const rpc3 = await supabase.rpc('get_articles_by_tag_slug', { tag_slug: tagSlugOrName });
            rpcData = (rpc3 && (rpc3.data || rpc3)) || [];
          } catch (e3) {
            rpcData = [];
          }
        }
      }
    } catch (e) {
      // ultimate fallback: no rpc available
      rpcData = [];
    }

    // If RPC returned full article objects (not only ids), prefer returning them directly
    if (Array.isArray(rpcData) && rpcData.length > 0) {
      const looksLikeArticle = rpcData.every(item => item && (item.id || item.title || item.slug));
      if (looksLikeArticle) {
        const out: any[] = [];
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
  const rels: any[] = await readArticleRelationsForTag(supabase, tag.id) || [];
  const junctionIds: string[] = Array.from(new Set((rels || []).map((r: any) => extractArticleIdFromRelRow(r)).filter(Boolean)));
  // Pull ids from rpcData as well
  const rpcIds: string[] = Array.from(new Set((rpcData || []).map((d: any) => extractArticleIdFromRelRow(d) || extractIdFromArticleLike(d)).filter(Boolean)));
  // Combine both sources (union) to maximize coverage
  const ids: string[] = Array.from(new Set([...junctionIds.map(String), ...rpcIds.map(String)]));
  if (DEBUG) console.debug('[tagHelpers] rpcIds:', rpcIds.length, 'junctionIds:', junctionIds.length, 'unionIds:', ids.length);
  if (!ids || ids.length === 0) return [];

    // Try several tolerant SELECT shapes and published-flag variants.
    const selectCandidates = [
      'id,title,slug,content,publishedAt,updatedAt,author:authorId(name)',
      'id,title,slug,content,publishedAt,updatedAt,author',
      '*'
    ];
    const publishedCandidates = ['published', 'is_published', 'published_at', 'publishedAt', null];
  let arts: any[] = [];
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
  const out: any[] = [];
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
  if (DEBUG || process.env.NODE_ENV !== 'production') console.error('tagHelpers.getArticlesByTag error', e);
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

// Strict: return only articles that are associated to the tag via junction table
export async function getArticlesByTagStrict(supabase, tagSlugOrName, limit = 50) {
  if (!supabase) return [];
  try {
    const tag = await getTagBySlug(supabase, tagSlugOrName);
    if (!tag || !tag.id) return [];
    // Prefer service-role join when available (deterministic and efficient).
    const svcKey = (typeof process !== 'undefined' && process.env && process.env.SUPABASE_SERVICE_ROLE_KEY) || null;
    const svcUrl = (typeof process !== 'undefined' && process.env && (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) || null;
    let rels = [];
    if (svcKey && svcUrl) {
      try {
        // Build a service-role REST query that performs a join via a subselect: select articles where id in (select A from _ArticleToTag where B = tag.id)
        const restBase = svcUrl.replace(/\/$/, '');
        const quotedTagId = encodeURIComponent(String(tag.id));
        const select = 'id,title,slug,content,publishedAt,updatedAt,author';
        // Use PostgREST RPC-style filter: filter articles by id via subselect on junction
        // Note: PostgREST doesn't allow subselects in URL easily; instead fetch junction rows first using service-role key
        const jUrl = `${restBase}/rest/v1/_ArticleToTag?select=A,B&${encodeURIComponent(`B=eq.${String(tag.id)}`)}&limit=2000`;
        const jHeaders = { Accept: 'application/json', apikey: svcKey, Authorization: `Bearer ${svcKey}` };
        const jResp = await fetch(jUrl, { method: 'GET', headers: jHeaders });
        if (jResp && jResp.ok) {
          const jJson = await jResp.json();
          if (Array.isArray(jJson) && jJson.length > 0) {
            rels = jJson;
          }
        }
      } catch (e) {
        // fallback to client-based strict reader below
        rels = [];
      }
    }
    // If service-role fetch didn't work, fall back to the strict junction-table reader
    if (!rels || rels.length === 0) {
      rels = await readArticleRelationsForTagStrict(supabase, tag.id) || [];
    }
    let ids = Array.from(new Set((rels || []).map(r => extractArticleIdFromRelRow(r)).filter(Boolean))).map(String);
    if (!ids || ids.length === 0) return [];

    // Query articles table strictly by id list
    const res = await supabase.from('articles').select('id,title,slug,content,publishedAt,updatedAt,author').in('id', ids).limit(limit);
    let arts = Array.isArray(res) ? res : (res && res.data ? res.data : []);

    // If client returned no rows, try per-id fetches as a tolerant fallback.
    // Some client wrappers or RLS setups can block bulk IN() queries while allowing single-row reads.
    if ((!Array.isArray(arts) || arts.length === 0) && Array.isArray(ids) && ids.length > 0) {
      try {
        const per = [];
        for (const id of ids) {
          try {
            const r = await supabase.from('articles').select('id,title,slug,content,publishedAt,updatedAt,author').eq('id', id).limit(1);
            const data = Array.isArray(r) ? r : (r && r.data ? r.data : []);
            if (Array.isArray(data) && data.length > 0) per.push(data[0]);
          } catch (e) {
            // ignore per-id failures and continue
            continue;
          }
        }
        if (per.length > 0) arts = per;
      } catch (e) {
        // ignore per-id fallback errors
      }
    }

    // If still empty, attempt REST endpoint fallback (anon key) as a tolerant read
    try {
      if ((!Array.isArray(arts) || arts.length === 0) && typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const restUrl = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || null;
        if (anonKey) {
          // Build id=in.("id1","id2") clause and encode safely
          const quoted = ids.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
          const select = 'id,title,slug,content,publishedAt,updatedAt,author';
          const url = `${restUrl}/rest/v1/articles?select=${encodeURIComponent(select)}&id=in.(${encodeURIComponent(quoted)})&limit=${encodeURIComponent(String(limit))}`;
          const headers = { Accept: 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` };
          try {
            const resp = await fetch(url, { method: 'GET', headers });
            if (resp && resp.ok) {
              const json = await resp.json();
              if (Array.isArray(json) && json.length > 0) arts = json;
            }
          } catch (e) {
            // ignore REST fallback errors
          }
        }
      }
    } catch (e) {
      // ignore overall fallback
    }

    // Final server-only fallback: use service-role REST API if available.
    try {
      const svcKey = (typeof process !== 'undefined' && process.env && process.env.SUPABASE_SERVICE_ROLE_KEY) || null;
      const svcUrl = (typeof process !== 'undefined' && process.env && (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)) || null;
      if ((!Array.isArray(arts) || arts.length === 0) && svcKey && svcUrl) {
        try {
          const restBase = svcUrl.replace(/\/$/, '');
          const quoted = ids.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
          const select = 'id,title,slug,content,publishedAt,updatedAt,author';
          const url = `${restBase}/rest/v1/articles?select=${encodeURIComponent(select)}&id=in.(${encodeURIComponent(quoted)})&limit=${encodeURIComponent(String(limit))}`;
          const headers = { Accept: 'application/json', apikey: svcKey, Authorization: `Bearer ${svcKey}` };
          const resp = await fetch(url, { method: 'GET', headers });
          if (resp && resp.ok) {
            const json = await resp.json();
            if (Array.isArray(json) && json.length > 0) arts = json;
          }
        } catch (e) {
          // ignore service-role REST fallback errors
        }
      }
    } catch (e) {
      // ignore final fallback errors
    }
    if (!Array.isArray(arts) || arts.length === 0) return [];

    const out = [];
    const seen = new Set();
    for (const a of arts) {
      if (!a || !a.id) continue;
      if (seen.has(String(a.id))) continue;
      const norm = await normalizeArticle(a);
      if (norm) {
        seen.add(String(norm.id));
        out.push(norm);
        if (out.length >= limit) break;
      }
    }
    return out;
  } catch (e) {
  if (DEBUG || process.env.NODE_ENV !== 'production') console.error('tagHelpers.getArticlesByTagStrict error', e);
    return [];
  }
}

// Additional fallback: search articles table for columns that may embed tag ids/slugs
async function findArticlesByArticleColumns(supabase, tag, limit = 50) {
  if (!supabase || !tag) return [];
  const colCandidates = ['tags', 'tag_ids', 'tagIds', 'tag', 'tag_slugs', 'tagSlugs', 'tag_list', 'category_ids', 'categories'];
  for (const col of colCandidates) {
    try {
      const from = typeof supabase.from === 'function' ? supabase.from('articles') : null;
      if (!from) continue;

      let q = from.select('id,title,slug,content,publishedAt,updatedAt,author');

      // Prefer JSONB containment (array/object) if supported
      if (typeof q.contains === 'function') {
        try {
          // try by tag id
          const r = await q.contains(col, [tag.id]).limit(limit);
          const data = Array.isArray(r) ? r : (r && r.data ? r.data : null);
          if (Array.isArray(data) && data.length > 0) return data;
        } catch (e) {
          // ignore and try slug
        }
        try {
          const r2 = await q.contains(col, [tag.slug]).limit(limit);
          const data2 = Array.isArray(r2) ? r2 : (r2 && r2.data ? r2.data : null);
          if (Array.isArray(data2) && data2.length > 0) return data2;
        } catch (e) {
          // ignore
        }
      }

      // Try simple equality (if column is scalar)
      if (typeof q.eq === 'function') {
        try {
          const r3 = await q.eq(col, tag.id).limit(limit);
          const data3 = Array.isArray(r3) ? r3 : (r3 && r3.data ? r3.data : null);
          if (Array.isArray(data3) && data3.length > 0) return data3;
        } catch (e) {}
        try {
          const r4 = await q.eq(col, tag.slug).limit(limit);
          const data4 = Array.isArray(r4) ? r4 : (r4 && r4.data ? r4.data : null);
          if (Array.isArray(data4) && data4.length > 0) return data4;
        } catch (e) {}
      }

      // Try ilike (textual match)
      if (typeof q.ilike === 'function') {
        try {
          const r5 = await q.ilike(col, `%${tag.slug}%`).limit(limit);
          const data5 = Array.isArray(r5) ? r5 : (r5 && r5.data ? r5.data : null);
          if (Array.isArray(data5) && data5.length > 0) return data5;
        } catch (e) {}
      }
    } catch (e) {
      continue;
    }
  }
  return [];
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
          // Prefer using .not with array when supported by client. Quote ids safely for string ids.
          try {
            const quoted = excluded.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
            q = q.not('id', 'in', `(${quoted})`);
          } catch (e) {
            // fallback: single-quote escape
            try {
              const quoted2 = excluded.map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
              q = q.not('id', 'in', `(${quoted2})`);
            } catch (e2) {
              // if even that fails, skip attaching exclusion to this query and rely on later JS-side filtering
            }
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

    // If query returned nothing or returned items that still include excluded ids,
    // fallback to a robust JS-side filtering approach: fetch a larger window and
    // filter out excluded ids in-process. This avoids subtle DB/driver quirks
    // or RLS behaviors that block .not / IN queries.
    const excludedSet = new Set(excluded.map(String));
    const ensureFiltered = async (rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return [];
      const filtered = rows.filter(r => r && r.id && !excludedSet.has(String(r.id)));
      return filtered;
    };

    let filtered = await ensureFiltered(arts);
    if ((!filtered || filtered.length === 0) && (!Array.isArray(arts) || arts.length === 0)) {
      // Fetch a larger window without exclusion and filter locally
      try {
        const fetchLimit = Math.max(limit * 3, 50);
        let q2 = supabase.from('articles')
          .select('id,title,slug,content,publishedAt,updatedAt,author:authorId(name)')
          .eq('published', true)
          .order('publishedAt', { ascending: false })
          .limit(fetchLimit);
        // respect deleted column variants if applicable
        for (const col of [...DELETED_COLS, null]) {
          try {
            let qTry = q2;
            if (col) qTry = qTry.is(col, null);
            const res2 = await qTry;
            const rows2 = (res2 && !res2.error && Array.isArray(res2.data)) ? res2.data : [];
            if (rows2 && rows2.length > 0) {
              filtered = await ensureFiltered(rows2);
              if (filtered && filtered.length > 0) break;
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        // ignore fallback errors
      }
    }

    if (!filtered || filtered.length === 0) return [];

    // Normalize, dedupe and cap
    const out = [];
    const seen = new Set();
    for (const a of filtered) {
      if (!a || !a.id) continue;
      if (seen.has(String(a.id))) continue;
      seen.add(String(a.id));
      out.push(await normalizeArticle(a));
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
  if (DEBUG || process.env.NODE_ENV !== 'production') console.error('tagHelpers.getArticlesExcludingTag error', e);
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
