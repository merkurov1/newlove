// app/rss.xml/route.js
import { safeData } from '@/lib/safeSerialize';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export async function GET() {
  // Use the server service-role client for read-only/export operations during build
  let supabase;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love';
  try {
    supabase = getServerSupabaseClient();
  } catch (e) {
    console.error('Unable to create server supabase client for RSS:', e);
    return new Response('DB unavailable', { status: 500 });
  }
  const { data: articles, error } = await supabase.from('article').select('title,slug,content,publishedAt,author:users(name)').eq('published', true).order('publishedAt', { ascending: false }).limit(30);
  if (error) {
    // If the DB/schema is not available during build, return an empty feed to avoid
    // failing the whole build. This keeps CI stable when migrations aren't applied.
    console.warn('Supabase fetch articles for RSS (falling back to empty feed):', error?.message || error);
    const emptyRss = `<?xml version="1.0" encoding="UTF-8" ?>
  <rss version="2.0">
    <channel>
      <title>Блог Антона Меркурова</title>
      <link>${siteUrl}</link>
      <description>Последние статьи и публикации</description>
      <language>ru</language>
    </channel>
  </rss>`;
    return new Response(emptyRss, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
      },
    });
  }
  const safeArticles = safeData(articles || []);

  const feedItems = safeArticles.map((a) => `
    <item>
      <title>${escape(a.title)}</title>
      <link>${siteUrl}/${a.slug}</link>
      <guid>${siteUrl}/${a.slug}</guid>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${truncate(stripMd(a.content), 300)}]]></description>
      <author>${escape(a.author?.name || 'Автор')}</author>
    </item>
  `).join('');

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

function stripMd(md) {
  return md.replace(/[#_*`>\[\]!\(\)]/g, '').replace(/\n+/g, ' ');
}
function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}
function escape(str) {
  return str.replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}
