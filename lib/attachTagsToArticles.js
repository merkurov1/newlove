// lib/attachTagsToArticles.js
// Temporary safe helper: skip DB access to junction/table and return articles
// with an empty `tags` array. This avoids permission errors while we fix DB.
export async function attachTagsToArticles(_supabase, articles) {
  if (!Array.isArray(articles)) return articles;
  if (articles.length === 0) return articles;

  // Return a fully-serializable copy with empty tags to satisfy Server Components
  return JSON.parse(JSON.stringify(articles.map(a => ({ ...a, tags: [] }))));
}
