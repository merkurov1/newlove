import type { MetadataRoute } from 'next';
import { absoluteUrl, PUBLIC_ROUTES } from '@/lib/seo';
import { createClient } from '@/lib/supabase/server';
import { getMediaRecords } from '@/lib/mediaRecords';
import {
  SECTION_BY_PATH,
  SECTION_LANGUAGES,
  languageAlternates,
  localizedPath,
} from '@/lib/i18n/config';

export const revalidate = 3600;

// RSS/JSON feeds are discovery documents, not indexable pages. They are
// advertised through <link rel="alternate"> metadata and deliberately kept
// out of the sitemap.

function entry(
  path: string,
  lastModified: string | Date = new Date(),
  priority = 0.7,
  alternates?: Record<string, string>
): MetadataRoute.Sitemap[number] {
  const url = absoluteUrl(path);

  return {
    url,
    lastModified,
    changeFrequency: 'weekly',
    priority,
    ...(alternates
      ? {
          alternates: {
            languages: Object.fromEntries(
              Object.entries(alternates).map(([language, path]) => [language, absoluteUrl(path)])
            ),
          },
        }
      : {}),
  };
}

function cleanDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const routes: MetadataRoute.Sitemap = PUBLIC_ROUTES.filter(
    // /letters is retained as a public archive but canonicalises to /journal.
    (route) => route !== '/letters'
  ).flatMap((route) => {
    const priority = route === '/' ? 1 : route === '/lobby' || route === '/advising' ? 0.9 : 0.7;
    const section = SECTION_BY_PATH[route];

    if (!section) return [entry(route, now, priority)];

    const alternates = languageAlternates(section);
    const entries = [entry(route, now, priority, alternates)];

    for (const language of SECTION_LANGUAGES[section]) {
      if (language === 'en') continue;
      entries.push(entry(localizedPath(section, language), now, priority, alternates));
    }

    return entries;
  });

  const seen = new Set(routes.map((item) => item.url));
  const push = (path: string, date: unknown, priority = 0.6) => {
    const item = entry(path, cleanDate(date) || now, priority);
    if (seen.has(item.url)) return;
    seen.add(item.url);
    routes.push(item);
  };

  try {
    const supabase = createClient({ useServiceRole: true });

    const [articles, flowItems, letters, tags, lots, media] = await Promise.all([
      supabase
        .from('articles')
        .select('slug,updatedAt,publishedAt')
        .eq('published', true)
        .not('slug', 'is', null)
        .limit(2000),
      supabase
        .from('items')
        .select('slug,updated_at,published_at')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .not('slug', 'is', null)
        .limit(2000),
      supabase
        .from('letters')
        .select('slug,publishedAt,updatedAt,createdAt,kind,status,published')
        .eq('published', true)
        .not('slug', 'is', null)
        .limit(1000),
      supabase.from('Tag').select('slug,name').limit(500),
      supabase.from('lots').select('id,created_at').eq('status', 'published').limit(1000),
      getMediaRecords().catch(() => []),
    ]);

    for (const article of articles.data || []) {
      const slug = String(article.slug || '').trim();
      if (slug) push(`/${encodeURIComponent(slug)}`, article.updatedAt || article.publishedAt, 0.7);
    }

    for (const item of flowItems.data || []) {
      const slug = String(item.slug || '').trim();
      if (slug)
        push(`/flow/${encodeURIComponent(slug)}`, item.updated_at || item.published_at, 0.6);
    }

    for (const letter of letters.data || []) {
      const slug = String(letter.slug || '').trim();
      if (!slug) continue;
      if (letter.status && letter.status !== 'published') continue;
      push(
        `/journal/${encodeURIComponent(slug)}`,
        letter.updatedAt || letter.publishedAt || letter.createdAt,
        0.7
      );
    }

    for (const tag of tags.data || []) {
      const slug = String(tag.slug || tag.name || '').trim();
      if (slug) push(`/tags/${encodeURIComponent(slug)}`, now, 0.4);
    }

    for (const lot of lots.data || []) {
      push(`/lots/${encodeURIComponent(String(lot.id))}`, lot.created_at, 0.4);
    }

    for (const record of media) {
      push(`/media/record/${encodeURIComponent(record.slug)}`, record.date, 0.5);
    }
  } catch (error) {
    // A sitemap must still be served if Supabase is unavailable.
    console.error('[sitemap] dynamic routes unavailable:', error);
  }

  return routes;
}
