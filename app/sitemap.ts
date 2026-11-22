import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getMediaRecords } from '@/lib/mediaRecords';
import {
  buildSitemapEntries,
  type SitemapSources,
} from '@/lib/sitemap/entries';

export const revalidate = 3600;

// RSS/JSON feeds are discovery documents, not indexable pages. They are
// advertised through <link rel="alternate"> metadata and deliberately kept
// out of the sitemap.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sources: SitemapSources = {};

  try {
    const supabase = await createClient({ useServiceRole: true });

    const [articles, flowItems, letters, tags, lots, media] = await Promise.all([
      supabase
        .from('articles')
        .select('slug,updatedAt,publishedAt')
        .eq('published', true)
        .not('slug', 'is', null)
        .limit(2000),
      supabase
        .from('items')
        .select('slug,updated_at,published_at,status,visibility')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .not('slug', 'is', null)
        .limit(2000),
      supabase
        .from('letters')
        .select('slug,publishedAt,updatedAt,createdAt,kind,status,published,lang')
        .eq('published', true)
        .not('slug', 'is', null)
        .limit(1000),
      supabase.from('Tag').select('slug').not('slug', 'is', null).limit(500),
      supabase
        .from('lots')
        .select('id,created_at,status')
        .eq('status', 'published')
        .limit(1000),
      getMediaRecords().catch(() => []),
    ]);

    sources.articles = articles.data || [];
    sources.flowItems = flowItems.data || [];
    sources.letters = letters.data || [];
    sources.tags = tags.data || [];
    sources.lots = lots.data || [];
    sources.media = media;
  } catch (error) {
    // A sitemap must still be served if Supabase is unavailable. Static
    // routes remain valid; dynamic routes are omitted rather than guessed.
    console.error('[sitemap] dynamic routes unavailable:', error);
  }

  return buildSitemapEntries(sources);
}
