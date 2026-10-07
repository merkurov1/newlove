import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient({ useServiceRole: true });

  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .order('published_at', { ascending: false })
    .limit(30);

  if (error) throw error;

  const items = data ?? [];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <title>merkurov.love</title>
      <link>https://merkurov.love</link>
      <description>Published content</description>
      <language>ru</language>
      ${items
        .map(
          (item) => `
          <item>
            <title><![CDATA[${item.title ?? 'Untitled'}]]></title>
            <link>https://merkurov.love/${item.lang}/${item.slug}</link>
            <guid>${item.id}</guid>
            <pubDate>${new Date(item.published_at ?? Date.now()).toUTCString()}</pubDate>
            <description><![CDATA[${item.body_md ?? ''}]]></description>
          </item>
        `
        )
        .join('')}
    </channel>
  </rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
