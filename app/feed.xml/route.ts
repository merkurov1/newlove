import { createClient } from '@/lib/supabase/server';
import { SITE_NAME, SITE_URL } from '@/lib/seo';

export const revalidate = 1800;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET() {
  let items: Array<{
    title: string;
    slug: string;
    date: string;
    description: string;
  }> = [];

  try {
    const supabase = createClient({ useServiceRole: true });
    const { data } = await supabase
      .from('letters')
      .select('title,slug,publishedAt,createdAt,content,kind,status,published')
      .eq('published', true)
      .not('slug', 'is', null)
      .order('publishedAt', { ascending: false })
      .limit(40);

    items = (data || [])
      .filter((row: any) => !row.status || row.status === 'published')
      .map((row: any) => ({
        title: String(row.title || 'Journal dispatch'),
        slug: String(row.slug),
        date: new Date(row.publishedAt || row.createdAt || Date.now()).toISOString(),
        description: stripHtml(row.content).slice(0, 280),
      }));
  } catch (error) {
    console.error('[feed.xml] Could not load journal entries:', error);
  }

  const latest = items[0]?.date || new Date().toISOString();

  const entries = items
    .map((item) => {
      const url = `${SITE_URL}/journal/${encodeURIComponent(item.slug)}`;
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>
      <description>${escapeXml(item.description)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${SITE_NAME} — Journal`)}</title>
    <link>${SITE_URL}/journal</link>
    <description>Essays, dispatches and market intelligence by Anton Merkurov.</description>
    <language>en</language>
    <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${entries}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=86400',
    },
  });
}
