// lib/attachTagsToArticles.js
// Minimal safe stub used for emergency production stabilization.
// It returns a guaranteed-serializable array of articles with empty `tags`.
export async function attachTagsToArticles(supabase, articles) {
  if (!Array.isArray(articles)) return [];

  // Возвращаем чистый, глубоко клонированный массив с гарантированно пустыми тегами
  // Этот массив не должен содержать несериализуемых объектов.
  return JSON.parse(JSON.stringify(articles.map(a => ({ ...a, tags: [] }))));
}
