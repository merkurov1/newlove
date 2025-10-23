// lib/attachTagsToArticles.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function attachTagsToArticles(_supabase: SupabaseClient | any, articles: any[]): Promise<any[]> {
  // Экстренный режим: всегда возвращаем статьи без тегов, чтобы избежать permission denied
  if (!Array.isArray(articles) || articles.length === 0) return [];
  return JSON.parse(JSON.stringify(articles.map((a) => ({ ...a, tags: [] }))));
}

export default attachTagsToArticles;
