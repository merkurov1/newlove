import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 3600;

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'\"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '\"':
        return '&quot;';
      default:
        return c;
    }
  });
}

function buildSitemapXml(urls: SitemapUrl[]): string {
  const urlEntries = urls
    .map((item) => {
      const loc = `<loc>${escapeXml(item.loc)}</loc>`;
      const lastmod = item.lastmod ? `<lastmod>${escapeXml(item.lastmod)}</lastmod>` : '';
      const changefreq = item.changefreq ? `<changefreq>${item.changefreq}</changefreq>` : '';
      const priority = item.priority !== undefined ? `<priority>${item.priority.toFixed(1)}</priority>` : '';
      return `  <url>\n    ${loc}\n    ${lastmod}\n    ${changefreq}\n    ${priority}\n  </url>`;
    })
    .join('\n');

  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<?xml-stylesheet type=\"text/xsl\" href=\"/sitemap.xsl\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n${urlEntries}\n</urlset>`;
}

export async function GET() {
  const baseUrl = 'https://www.merkurov.love';
  const now = new Date().toISOString();

  // 1. Static high-value routes and hubs
  const staticUrls: SitemapUrl[] = [
    { loc: baseUrl, lastmod: now, changefreq: 'daily', priority: 1.0 },
    { loc: `${baseUrl}/flow`, lastmod: now, changefreq: 'hourly', priority: 0.9 },
    { loc: `${baseUrl}/selection`, lastmod: now, changefreq: 'daily', priority: 0.9 },
    { loc: `${baseUrl}/art-engine`, lastmod: now, changefreq: 'weekly', priority: 0.8 },
    { loc: `${baseUrl}/lobby`, lastmod: now, changefreq: 'weekly', priority: 0.8 },
    { loc: `${baseUrl}/isakeyforall`, lastmod: now, changefreq: 'monthly', priority: 0.8 },
    { loc: `${baseUrl}/advising`, lastmod: now, changefreq: 'monthly', priority: 0.8 },
    { loc: `${baseUrl}/unframed`, lastmod: now, changefreq: 'weekly', priority: 0.8 },
    { loc: `${baseUrl}/heartandangel`, lastmod: now, changefreq: 'weekly', priority: 0.8 },
    { loc: `${baseUrl}/heartandangel/world`, lastmod: now, changefreq: 'monthly', priority: 0.8 },
    { loc: `${baseUrl}/heartandangel/about`, lastmod: now, changefreq: 'monthly', priority: 0.7 },
    { loc: `${baseUrl}/heartandangel/calm`, lastmod: now, changefreq: 'monthly', priority: 0.6 },
    { loc: `${baseUrl}/heartandangel/letitgo`, lastmod: now, changefreq: 'monthly', priority: 0.6 },
    { loc: `${baseUrl}/heritage`, lastmod: now, changefreq: 'weekly', priority: 0.8 },
    { loc: `${baseUrl}/journal`, lastmod: now, changefreq: 'weekly', priority: 0.8 },
    { loc: `${baseUrl}/letters`, lastmod: now, changefreq: 'weekly', priority: 0.7 },
    { loc: `${baseUrl}/projects`, lastmod: now, changefreq: 'monthly', priority: 0.7 },
    { loc: `${baseUrl}/media`, lastmod: now, changefreq: 'weekly', priority: 0.7 },
    { loc: `${baseUrl}/stat`, lastmod: now, changefreq: 'daily', priority: 0.6 },
    { loc: `${baseUrl}/all`, lastmod: now, changefreq: 'weekly', priority: 0.6 },
    { loc: `${baseUrl}/temple`, lastmod: now, changefreq: 'monthly', priority: 0.6 },
    { loc: `${baseUrl}/vigil`, lastmod: now, changefreq: 'monthly', priority: 0.6 },
    { loc: `${baseUrl}/absolution`, lastmod: now, changefreq: 'monthly', priority: 0.6 },
    { loc: `${baseUrl}/tribute`, lastmod: now, changefreq: 'monthly', priority: 0.5 },
  ];

  let flowUrls: SitemapUrl[] = [];
  let articleUrls: SitemapUrl[] = [];
  let letterUrls: SitemapUrl[] = [];
  let projectUrls: SitemapUrl[] = [];
  let tagUrls: SitemapUrl[] = [];

  try {
    const supabase = createClient({ useServiceRole: true });

    // 2. Flow posts (/flow/[slug])
    try {
      const { data: flowItems } = await supabase
        .from('items')
        .select('slug, updated_at, published_at')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .not('slug', 'is', null)
        .order('published_at', { ascending: false })
        .limit(2000);

      if (flowItems) {
        flowUrls = flowItems
          .filter((item) => typeof item.slug === 'string' && item.slug.trim().length > 0)
          .map((item) => ({
            loc: `${baseUrl}/flow/${encodeURIComponent(item.slug.trim())}`,
            lastmod: item.updated_at || item.published_at || now,
            changefreq: 'weekly' as const,
            priority: 0.7,
          }));
      }
    } catch (err) {
      console.error('Sitemap fetch flow items error:', err);
    }

    // 3. Articles (rooted /slug and /selection/[slug])
    try {
      const { data: articles } = await supabase
        .from('articles')
        .select('slug, updatedAt, publishedAt')
        .eq('published', true)
        .order('publishedAt', { ascending: false })
        .limit(1000);

      if (articles) {
        articleUrls = articles
          .filter((a) => a.slug && typeof a.slug === 'string')
          .map((item) => ({
            loc: `${baseUrl}/${encodeURIComponent(item.slug.trim())}`,
            lastmod: item.updatedAt || item.publishedAt || now,
            changefreq: 'weekly' as const,
            priority: 0.8,
          }));
      }
    } catch (err) {
      console.error('Sitemap fetch articles error:', err);
    }

    // 4. Letters (/letters/[slug])
    try {
      const { data: letters } = await supabase
        .from('letters')
        .select('slug, updatedAt, publishedAt')
        .eq('published', true)
        .order('publishedAt', { ascending: false })
        .limit(500);

      if (letters) {
        letterUrls = letters
          .filter((l) => l.slug && typeof l.slug === 'string')
          .map((letter) => ({
            loc: `${baseUrl}/letters/${encodeURIComponent(letter.slug.trim())}`,
            lastmod: letter.updatedAt || letter.publishedAt || now,
            changefreq: 'monthly' as const,
            priority: 0.7,
          }));
      }
    } catch (err) {
      console.error('Sitemap fetch letters error:', err);
    }

    // 5. Projects
    try {
      const { data: projects } = await supabase
        .from('projects')
        .select('slug, updatedAt, createdAt')
        .eq('published', true)
        .limit(200);

      if (projects) {
        projectUrls = projects
          .filter((p) => p.slug && typeof p.slug === 'string')
          .map((project) => ({
            loc: `${baseUrl}/${encodeURIComponent(project.slug.trim())}`,
            lastmod: project.updatedAt || project.createdAt || now,
            changefreq: 'monthly' as const,
            priority: 0.6,
          }));
      }
    } catch (err) {
      console.error('Sitemap fetch projects error:', err);
    }

    // 6. Tags
    try {
      const { data: tags } = await supabase
        .from('Tag')
        .select('slug, name')
        .limit(200);

      if (tags) {
        tagUrls = tags
          .filter((t) => (t.slug || t.name))
          .map((tag) => ({
            loc: `${baseUrl}/tags/${encodeURIComponent((tag.slug || tag.name).trim())}`,
            lastmod: now,
            changefreq: 'weekly' as const,
            priority: 0.5,
          }));
      }
    } catch (err) {
      console.error('Sitemap fetch tags error:', err);
    }
  } catch (globalErr) {
    console.error('Sitemap generation error:', globalErr);
  }

  // Deduplicate URLs
  const uniqueUrlsMap = new Map<string, SitemapUrl>();
  for (const item of [
    ...staticUrls,
    ...flowUrls,
    ...articleUrls,
    ...letterUrls,
    ...projectUrls,
    ...tagUrls,
  ]) {
    if (!uniqueUrlsMap.has(item.loc)) {
      uniqueUrlsMap.set(item.loc, item);
    }
  }

  const sitemapXml = buildSitemapXml(Array.from(uniqueUrlsMap.values()));

  return new NextResponse(sitemapXml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
