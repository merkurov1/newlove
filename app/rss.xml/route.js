// app/rss.xml/route.js
import prisma from '@/lib/prisma';

export async function GET() {
  const articles = await prisma.article.findMany({
    where: { published: true },
    orderBy: { publishedAt: 'desc' },
    take: 30,
    select: {
      title: true,
      slug: true,
      content: true,
      publishedAt: true,
      author: { select: { name: true } },
    },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://merkurov.love';
  const feedItems = articles.map((a) => `
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
