import { records as fallbackMedia } from '@/data/media';
import { getMediaRecords } from '@/lib/mediaRecords';
import { createClient } from '@/lib/supabase/server';
import {
  ANCESTOR_NAME,
  ANCESTOR_WIKIPEDIA,
  DEFAULT_OG_IMAGE,
  PERSON_NAME,
  SITE_URL,
  AI_DISCLOSURE,
} from '@/lib/seo';

type LinkItem = { title: string; url: string; description?: string };

async function getJournalItems(limit = 30): Promise<LinkItem[]> {
  try {
    const supabase = createClient({ useServiceRole: true });
    const { data } = await supabase
      .from('letters')
      .select('title,slug,publishedAt,createdAt,kind,status,published')
      .eq('published', true)
      .not('slug', 'is', null)
      .order('publishedAt', { ascending: false })
      .limit(limit);

    return (data || [])
      .filter((row: any) => !row.status || row.status === 'published')
      .map((row: any) => ({
        title: String(row.title || 'Journal dispatch'),
        url: `${SITE_URL}/journal/${encodeURIComponent(String(row.slug))}`,
      }));
  } catch {
    return [];
  }
}

async function getFlowItems(limit = 30): Promise<LinkItem[]> {
  try {
    const supabase = createClient({ useServiceRole: true });
    const { data } = await supabase
      .from('items')
      .select('title,slug,published_at')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .not('slug', 'is', null)
      .order('published_at', { ascending: false })
      .limit(limit);

    return (data || []).map((row: any) => ({
      title: String(row.title || 'Flow item'),
      url: `${SITE_URL}/flow/${encodeURIComponent(String(row.slug))}`,
    }));
  } catch {
    return [];
  }
}

async function getMediaItems(limit = 60): Promise<LinkItem[]> {
  let media = fallbackMedia;
  try {
    media = await getMediaRecords();
  } catch {
    media = fallbackMedia;
  }

  return media.slice(0, limit).map((record) => ({
    title: `${record.title} — ${record.outlet} (${record.date})`,
    url: `${SITE_URL}/media/record/${encodeURIComponent(record.slug)}`,
    description: record.summary,
  }));
}

const SECTIONS: { heading: string; url: string; description: string }[] = [
  {
    heading: 'About',
    url: `${SITE_URL}/isakeyforall`,
    description:
      'Biography of Anton Merkurov: artist, digital strategist and great-grandson of sculptor Sergey Merkurov.',
  },
  {
    heading: 'Advising',
    url: `${SITE_URL}/advising`,
    description:
      'Direct counsel on digital strategy, art-market positioning and heritage architecture.',
  },
  {
    heading: 'Curator Engine',
    url: `${SITE_URL}/art-engine`,
    description:
      'Art-market intelligence terminal for acquisition research, liquidity analysis and curatorial dossiers.',
  },
  {
    heading: 'Heart & Angel',
    url: `${SITE_URL}/heartandangel`,
    description:
      'A living digital mythology expressed through painting, digital graphics, augmented reality and code.',
  },
  {
    heading: 'Selection',
    url: `${SITE_URL}/selection`,
    description:
      'Curated artworks, artist dossiers and non-conformist masterworks from the Merkurov archive.',
  },
  {
    heading: 'Journal',
    url: `${SITE_URL}/journal`,
    description:
      'Essays and dispatches on art, digital heritage, media and cultural capital.',
  },
  {
    heading: 'Heritage',
    url: `${SITE_URL}/heritage`,
    description:
      'Documented legacy of sculptor Sergey Merkurov, the Gyumri house-museum and the Dynamo reliefs.',
  },
  {
    heading: 'Media Archive',
    url: `${SITE_URL}/media`,
    description:
      'Interviews, expert commentary, columns and citations, each linked to its original publication.',
  },
  {
    heading: 'Unframed',
    url: `${SITE_URL}/unframed`,
    description: 'UNFRAMED — a memoir by Anton Merkurov, from granite to ether.',
  },
];

export async function buildLlmsText(full = false): Promise<string> {
  const [journal, flow, media] = await Promise.all([
    getJournalItems(full ? 40 : 10),
    getFlowItems(full ? 30 : 10),
    getMediaItems(full ? 80 : 12),
  ]);

  const lines: string[] = [
    `# ${PERSON_NAME}`,
    '',
    '> The official website of Anton Merkurov: digital strategist, art dealer and heritage architect. Art, heritage, advising, publishing and digital projects.',
    '',
    `Canonical host: ${SITE_URL}`,
    '',
  ];

  lines.push('## Sections', '');
  for (const section of SECTIONS) {
    lines.push(`- [${section.heading}](${section.url}): ${section.description}`);
  }
  lines.push('');

  lines.push('## Notes on sources and identity', '');
  lines.push(
    '- The site uses one spelling for the sculptor: Sergey Merkurov (1881–1952).',
    `- Wikipedia reference for ${ANCESTOR_NAME}: ${ANCESTOR_WIKIPEDIA}`,
    `- ${AI_DISCLOSURE}`,
    '',
  );

  if (full) {
    lines.push('## Journal', '');
    for (const item of journal) lines.push(`- [${item.title}](${item.url})`);
    if (journal.length === 0) lines.push('- No journal entries are currently published.');
    lines.push('');

    lines.push('## Flow', '');
    for (const item of flow) lines.push(`- [${item.title}](${item.url})`);
    if (flow.length === 0) lines.push('- No Flow items are currently published.');
    lines.push('');

    lines.push('## Media Archive', '');
    for (const item of media) {
      lines.push(`- [${item.title}](${item.url})${item.description ? ` — ${item.description}` : ''}`);
    }
    lines.push('');

    lines.push('## Heritage dossier', '');
    lines.push(
      `${ANCESTOR_NAME} (1881–1952) was a monumental sculptor, known for the Lenin mausoleum masks, the Dynamo Stadium reliefs and the house-museum in Gyumri, Armenia. Anton Merkurov is his great-grandson and maintains the family archive.`,
      '',
      `- [Heritage Archive](${SITE_URL}/heritage)`,
      `- [Anton Merkurov — About](${SITE_URL}/isakeyforall)`,
      '',
    );

    lines.push('## Unframed', '');
    lines.push(
      'UNFRAMED is a memoir of migration, media and digital frontiers — the transition from granite to ether.',
      '',
      `- [UNFRAMED](${SITE_URL}/unframed)`,
      `- [Read the book](${SITE_URL}/unframed/book)`,
      `- Cover image: ${DEFAULT_OG_IMAGE}`,
      '',
    );

    lines.push('## Machine-readable endpoints', '');
    lines.push(
      `- Sitemap: ${SITE_URL}/sitemap.xml`,
      `- Robots: ${SITE_URL}/robots.txt`,
      `- RSS: ${SITE_URL}/feed.xml`,
      '',
    );
  }

  return `${lines.join('\n').trim()}\n`;
}
