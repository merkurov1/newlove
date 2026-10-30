import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata, ROUTE_COPY } from '@/lib/seo';
import { breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/structuredData';
import { createClient } from '@/lib/supabase/server';
import SubscribeFormClient from '@/components/journal/SubscribeFormClient';
import FrontPage, {
  type FrontIssue,
  type FlowEntry,
} from '@/components/journal/FrontPage';

export const dynamic = 'force-dynamic';

const journalCopy = ROUTE_COPY['/journal'];

export const metadata: Metadata = pageMetadata({
  ...journalCopy,
  path: '/journal',
  languages: {
    'x-default': '/journal',
    en: '/journal',
    ru: '/journal',
  },
});

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

const TYPE_NAMES: Record<'ru' | 'en', [string, string][]> = {
  ru: [['note', 'Заметки'], ['link', 'Ссылки'], ['video', 'Видео'], ['photo', 'Фото']],
  en: [['note', 'Notes'], ['link', 'Links'], ['video', 'Videos'], ['photo', 'Photos']],
};

function summarize(byType: any, lang: 'ru' | 'en') {
  let map = byType;
  if (typeof map === 'string') {
    try {
      map = JSON.parse(map);
    } catch {
      map = null;
    }
  }
  if (!map || typeof map !== 'object') return '';
  return TYPE_NAMES[lang]
    .filter(([key]) => Number(map[key]) > 0)
    .map(([key, label]) => `${label} ${map[key]}`)
    .join(', ');
}

function toIssue(row: any): FrontIssue {
  const lang = isEn(row.lang) ? 'en' : 'ru';

  return {
    id: String(row.id),
    slug: String(row.slug || ''),
    lang,
    number: row.number ?? null,
    // Заголовок выпуска — заголовок авторской заметки-лида, если он есть.
    headline: clean(row.leadTitle) || String(row.title || 'Flow'),
    excerpt: cut(clean(row.leadBody), 200),
    summary: summarize(row.byType, lang),
    published: row.itemCount != null ? Number(row.itemCount) : null,
    publishedAt: row.publishedAt || row.sentAt || row.createdAt || null,
    periodStart: row.periodStart || null,
    periodEnd: row.periodEnd || null,
  };
}

function toFlow(row: any): FlowEntry {
  const body = clean(row.body_md);
  // У фото в title обычно имя файла, поэтому подпись берём из тела записи.
  const text = row.type === 'photo' ? body : clean(row.title) || body;

  return {
    id: String(row.id),
    slug: row.slug ? String(row.slug) : null,
    type: String(row.type || 'note'),
    lang: isEn(row.lang) ? 'en' : 'ru',
    text: cut(text, 110),
    at: row.published_at || null,
  };
}

// Поток читаем тем же API, что и страница /flow: так выборка и права доступа совпадают.
async function loadFlow(): Promise<FlowEntry[]> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    if (!host) return [];

    const proto =
      h.get('x-forwarded-proto') ||
      (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');

    const response = await fetch(
      `${proto}://${host}/api/flow/items?limit=5&offset=0`,
      { cache: 'no-store' },
    );

    if (!response.ok) {
      console.error('[Journal] Flow API status:', response.status);
      return [];
    }

    const json = await response.json();
    return (Array.isArray(json.items) ? json.items : [])
      .slice(0, 5)
      .map(toFlow);
  } catch (error) {
    console.error('[Journal] Flow:', error);
    return [];
  }
}

export default async function JournalPage() {
  // Нетипизированный клиент: типы Supabase не умеют разбирать выборки по путям JSON.
  const supabase: any = createClient();

  let issues: FrontIssue[] = [];

  const [issuesRes, flow]: [any, FlowEntry[]] = await Promise.all([
    // Выпуски: берём только нужные поля payload, а не весь снимок.
    supabase
      .from('letters')
      .select(
        'id,title,slug,publishedAt,sentAt,createdAt,lang,number,' +
          'leadTitle:payload->lead->>title,leadBody:payload->lead->>body,' +
          'itemCount:payload->stats->>published,byType:payload->stats->byType,' +
          'periodStart:payload->period->>start,periodEnd:payload->period->>end',
      )
      .eq('published', true)
      .eq('kind', 'issue')
      .order('publishedAt', { ascending: false })
      .order('id', { ascending: false })
      .limit(16),
    loadFlow(),
  ]);

  if (issuesRes.error) console.error('[Journal] Issues:', issuesRes.error);
  else issues = (issuesRes.data || []).map(toIssue);

  const ru = issues.find((i) => i.lang === 'ru') || null;
  const en = issues.find((i) => i.lang === 'en') || null;
  const archive = issues
    .filter((i) => i.id !== ru?.id && i.id !== en?.id)
    .slice(0, 5);

  const journalItems = issues.map((issue) => ({
    name: issue.headline,
    url: `/journal/${encodeURIComponent(issue.slug)}`,
  }));

  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-[#111] selection:bg-black selection:text-white">
      <JsonLd
        data={collectionPageJsonLd({
          path: '/journal',
          name: 'Journal — Chronicles of the Unframed',
          description: journalCopy.description,
          items: journalItems,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Journal', path: '/journal' },
        ])}
      />
      <FrontPage
        ru={ru}
        en={en}
        flow={flow}
        archive={archive}
        subscribe={<SubscribeFormClient />}
      />
    </div>
  );
}
