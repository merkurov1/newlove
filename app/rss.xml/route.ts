// app/rss.xml/route.js
import { safeData } from '@/lib/safeSerialize';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export async function GET() {
  // Use the server service-role client for read-only/export operations during build
  let supabase;
  try {
    // RSS generation runs server-side and needs elevated read privileges
    supabase = getServerSupabaseClient({ useServiceRole: true });
  } catch (e) {
    console.error('Unable to create server supabase client for RSS:', e);
    return new Response('DB unavailable', { status: 500 });
  }
  const { data: articles, error } = await supabase.from('articles').select('title,slug,content,publishedAt,author:authorId(name)').eq('published', true).order('publishedAt', { ascending: false }).limit(30);
  if (error) {
    console.error('Supabase fetch articles for RSS', error);
    return new Response('Internal error', { status: 500 });
  }
  const safeArticles = safeData(articles || []);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love';
  const feedItems = safeArticles.map((a: any) => {
    const authorName = Array.isArray(a.author) ? (a.author[0]?.name || 'Автор') : (a.author?.name || 'Автор');
    return `
    <item>
      <title>${escape(a.title)}</title>
      <link>${siteUrl}/${a.slug}</link>
      <guid>${siteUrl}/${a.slug}</guid>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${truncate(stripMd(a.content), 300)}]]></description>
      <author>${escape(authorName)}</author>
    </item>
  `;
  }).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
  <rss version="2.0">
    <channel>
      <title>Блог Антона Меркурова</title>
      <link>${siteUrl}</link>
      <description>Последние статьи и публикации</description>
      <language>ru</language>
      ${feedItems}
    </channel>
  </rss>`;

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}

function stripMd(md: string): string {
  return String(md || '').replace(/[#_*`>\[\]!\(\)]/g, '').replace(/\n+/g, ' ');
}
function truncate(str: string, n: number): string {
  const s = String(str || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function escape(str: string): string {
  const s = String(str || '');
  return s.replace(/[&<>]/g, (c: string) => ({'&':'&amp;','<':'&lt;','>':'&gt;'} as Record<string,string>)[c]);
}
