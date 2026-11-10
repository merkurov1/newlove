import { headers } from 'next/headers';
import { JsonLd } from '@/components/seo/JsonLd';
import { PageEvent } from '@/components/analytics/PageEvent';
import { breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/structuredData';
import { createClient } from '@/lib/supabase/server';
import SubscribeFormClient from '@/components/journal/SubscribeFormClient';
import FrontPage, { type FrontIssue, type FlowEntry } from '@/components/journal/FrontPage';
import { JOURNAL_COPY, journalIssueHref, type JournalLanguage } from '@/lib/i18n/journal';
import { localizedPath } from '@/lib/i18n/config';
import HtmlLanguage from '@/components/i18n/HtmlLanguage';

const isEn = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .startsWith('en');

const clean = (value: unknown) =>
  String(value ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const cut = (value: string, max: number) =>
  value.length > max ? value.slice(0, max).replace(/\s+\S*$/, '') + '…' : value;

const TYPE_NAMES: Record<'ru' | 'en', [string, string][]> = {
  ru: [
    ['note', 'Заметки'],
    ['link', 'Ссылки'],
    ['video', 'Видео'],
    ['photo', 'Фото'],
  ],
  en: [
    ['note', 'Notes'],
    ['link', 'Links'],
    ['video', 'Videos'],
    ['photo', 'Photos'],
  ],
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

/**
 * Keep the preview anchored to the current edition, but do not leave the
 * section empty when the stream is currently publishing in the other
 * language. The UI labels the language of any entry from the other edition.
 */
function flowPreview(allFlow: FlowEntry[], lang: JournalLanguage): FlowEntry[] {
  const preferred = allFlow.filter((entry) => entry.lang === lang);
  const other = allFlow.filter((entry) => entry.lang !== lang);

  return [...preferred, ...other].slice(0, 5);
}

// The Flow preview uses the same public API as /flow so visibility and
// publication rules stay identical.
async function loadFlow(): Promise<FlowEntry[]> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host');
    if (!host) return [];

    const proto =
      h.get('x-forwarded-proto') ||
      (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');

    const response = await fetch(`${proto}://${host}/api/flow/items?limit=12&offset=0`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('[Journal] Flow API status:', response.status);
      return [];
    }

    const json = await response.json();
    return (Array.isArray(json.items) ? json.items : []).map(toFlow);
  } catch (error) {
    console.error('[Journal] Flow:', error);
    return [];
  }
}

export default async function JournalPageView({ lang }: { lang: JournalLanguage }) {
  const copy = JOURNAL_COPY[lang];
  const supabase: any = createClient();

  let issues: FrontIssue[] = [];

  const [issuesRes, allFlow]: [any, FlowEntry[]] = await Promise.all([
    supabase
      .from('letters')
      .select(
        'id,title,slug,publishedAt,sentAt,createdAt,lang,number,' +
          'leadTitle:payload->lead->>title,leadBody:payload->lead->>body,' +
          'itemCount:payload->stats->>published,byType:payload->stats->byType,' +
          'periodStart:payload->period->>start,periodEnd:payload->period->>end'
      )
      .eq('published', true)
      .eq('kind', 'issue')
      .order('publishedAt', { ascending: false })
      .order('id', { ascending: false })
      .limit(24),
    loadFlow(),
  ]);

  if (issuesRes.error) console.error('[Journal] Issues:', issuesRes.error);
  else issues = (issuesRes.data || []).map(toIssue);

  const featured = issues.find((issue) => issue.lang === lang) || null;
  const other = issues.find((issue) => issue.lang !== lang) || null;
  const archive = issues
    .filter((issue) => issue.id !== featured?.id && issue.id !== other?.id)
    .slice(0, 8);
  const flow = flowPreview(allFlow, lang);

  const journalItems = issues.map((issue) => ({
    name: issue.headline,
    url: journalIssueHref(issue.lang, issue.slug),
  }));

  return (
    <div
      lang={lang}
      className="min-h-screen bg-[#FDFBF7] font-sans text-[#111] selection:bg-black selection:text-white"
    >
      <HtmlLanguage lang={lang} />
      <PageEvent name="section_view" params={{ section: 'journal', language: lang }} />
      <JsonLd
        data={collectionPageJsonLd({
          path: localizedPath('journal', lang),
          name: copy.meta.structuredName,
          description: copy.meta.description,
          items: journalItems,
          inLanguage: lang,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.meta.breadcrumbs.home, path: '/' },
          { name: copy.meta.breadcrumbs.section, path: localizedPath('journal', lang) },
        ])}
      />
      <FrontPage
        lang={lang}
        featured={featured}
        other={other}
        flow={flow}
        archive={archive}
        subscribe={
          <SubscribeFormClient defaultLanguage={lang} editorial showLanguageSelector={false} />
        }
      />
    </div>
  );
}
