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
        // fallback to slug/title if present
        if (v.slug) return v.slug;
        if (v.title) return v.title;
        continue;
      }
      return v;
    }
  }
  // If the row contains nested objects like { article: { id: '...' } }
  if (row.article && typeof row.article === 'object') {
    if (row.article.id) return row.article.id;
    if (row.article._id) return row.article._id;
    if (row.article.slug) return row.article.slug;
    // sometimes article object has slug but id under a nested field
    for (const k of Object.keys(row.article)) {
      if (k.toLowerCase().includes('id') && row.article[k]) return row.article[k];
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
  }
  return null;
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
      if (v.slug) return v.slug;
    }
    if (typeof v === 'string' && v.length >= 6) return v;
    if (typeof v === 'number') return v;
  }
  return null;
}

const samples = [
  { A: '123' },
  { a: { id: 'abc' } },
  { article_id: 42 },
  { article: { id: 'uuid-1' } },
  { random: 'something', other: 55 },
  null,
  {},
  { id: 'full-article', title: 'Title' },
  { article: { slug: 'slug-only' } },
  { nested: { inner: { id: 'deep-1' } } },
  { a: { slug: 'a-slug' } },
  { article: { title: 'Only title' } }
];

for (const s of samples) {
  console.log('sample:', JSON.stringify(s), '-> extractArticleIdFromRelRow:', extractArticleIdFromRelRow(s), 'extractIdFromArticleLike:', extractIdFromArticleLike(s));
}
