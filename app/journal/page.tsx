import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { createClient } from '@/lib/supabase/server';
import SubscribeFormClient from '@/components/journal/SubscribeFormClient';
import FrontPage, {
  type FrontIssue,
  type FlowEntry,
} from '@/components/journal/FrontPage';
import JournalViewClient, {
  type JournalArticle,
  type JournalCursor,
} from '@/components/journal/JournalViewClient';
import { extractPreview } from '@/lib/journal/preview';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  alternates: { canonical: 'https://www.merkurov.love/journal' },
  title: 'Journal | Merkurov',
  description:
    'Chronicles of the unframed. Market intelligence and heritage architecture.',
});

const PAGE_SIZE = 10;

const isEn = (value: unknown) =>
  String(value || '').toLowerCase().trim().startsWith('en');

const clean = (value: unknown) =>
  String(value ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const cut = (value: string, max: number) =>
  value.length > max
    ? value.slice(0, max).replace(/\s+\S*$/, '') + '…'
    : value;

function toIssue(row: any): FrontIssue {
  return {
    id: String(row.id),
    slug: String(row.slug || ''),
    lang: isEn(row.lang) ? 'en' : 'ru',
    number: row.number ?? null,
    headline: clean(row.leadTitle) || String(row.title || 'Flow'),
    excerpt: cut(clean(row.leadBody), 200),
    published: row.published != null ? Number(row.published) : null,
    publishedAt: row.publishedAt || row.sentAt || row.createdAt || null,
    periodStart: row.periodStart || null,
    periodEnd: row.periodEnd || null,
  };
}

function toFlow(row: any): FlowEntry {
  const body = clean(row.body_md);
  const text = row.type === 'photo' ? body : clean(row.title) || body;

  return {
    id: String(row.id),
    type: String(row.type || 'note'),
    lang: isEn(row.lang) ? 'en' : 'ru',
    text: cut(text, 110),
    at: row.published_at || null,
  };
}

export default async function JournalPage() {
  // Нетипизированный клиент: типы Supabase не умеют разбирать выборки по путям JSON.
  const supabase: any = createClient();

  let issues: FrontIssue[] = [];
  let flow: FlowEntry[] = [];
  let initialArticles: JournalArticle[] = [];
  let initialCursor: JournalCursor | null = null;
  let hasMore = false;

  const [issuesRes, flowRes, articlesRes]: any[] = await Promise.all([
    supabase
      .from('letters')
      .select(
        'id,title,slug,publishedAt,sentAt,createdAt,lang,number,' +
          'leadTitle:payload->lead->>title,leadBody:payload->lead->>body,' +
          'published:payload->stats->>published,' +
          'periodStart:payload->period->>start,periodEnd:payload->period->>end',
      )
      .eq('published', true)
      .eq('kind', 'issue')
      .order('publishedAt', { ascending: false })
      .order('id', { ascending: false })
      .limit(16),
    supabase
      .from('items')
      .select('id,type,title,body_md,lang,published_at')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .order('published_at', { ascending: false })
      .limit(5),
    supabase
      .from('letters')
      .select(
        'id,title,slug,content,published,publishedAt,sentAt,createdAt,kind,lang,payload',
      )
      .eq('published', true)
      .or('kind.is.null,kind.neq.issue')
      .order('publishedAt', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1),
  ]);

  if (issuesRes.error) console.error('[Journal] Issues:', issuesRes.error);
  else issues = (issuesRes.data || []).map(toIssue);

  if (flowRes.error) console.error('[Journal] Flow:', flowRes.error);
  else flow = (flowRes.data || []).map(toFlow);

  if (articlesRes.error) {
    console.error('[Journal] Articles:', articlesRes.error);
  } else {
    const rows = (articlesRes.data || []).filter(
      (item: any) => item.kind !== 'issue',
    );
    hasMore = rows.length > PAGE_SIZE;
    initialArticles = rows.slice(0, PAGE_SIZE).map((item: any) => ({
      id: String(item.id),
      title: String(item.title || 'Untitled'),
      slug: String(item.slug || ''),
      preview: extractPreview(item.content, item.payload, 280),
      publishedAt: item.publishedAt || null,
      sentAt: item.sentAt || null,
      createdAt: item.createdAt || null,
      kind: item.kind || 'letter',
      lang: item.lang || null,
    }));
    const last = initialArticles[initialArticles.length - 1];
    if (last) initialCursor = { id: last.id, publishedAt: last.publishedAt };
  }

  const ru = issues.find((i) => i.lang === 'ru') || null;
  const en = issues.find((i) => i.lang === 'en') || null;
  const archive = issues
    .filter((i) => i.id !== ru?.id && i.id !== en?.id)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-[#111] selection:bg-black selection:text-white">
      <FrontPage
        ru={ru}
        en={en}
        flow={flow}
        archive={archive}
        subscribe={<SubscribeFormClient />}
      />

      <JournalViewClient
        initialArticles={initialArticles}
        initialCursor={initialCursor}
        initialHasMore={hasMore}
      />
    </div>
  );
}
