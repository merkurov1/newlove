import { JsonLd } from '@/components/seo/JsonLd';
import { PageEvent } from '@/components/analytics/PageEvent';
import { breadcrumbJsonLd, collectionPageJsonLd, itemListJsonLd } from '@/lib/structuredData';
import { createClient } from '@/lib/supabase/server';
import SubscribeFormClient from '@/components/journal/SubscribeFormClient';
import FrontPage, { type FrontIssue, type FlowEntry } from '@/components/journal/FrontPage';
import { JOURNAL_COPY, journalIssueHref, type JournalLanguage } from '@/lib/i18n/journal';
import { selectJournalEdition } from '@/lib/journal/archive';
import { loadFlowItemsPage } from '@/lib/flow/items-cash';
import {
  loadAllJournalIssues,
  loadJournalIssueDetail,
  type JournalIssueRow,
} from '@/lib/journal/load';
import { collectIssueMaterials, materialHref } from '@/lib/journal/issue';
import { extractPreview } from '@/lib/journal/preview';
import { localizedPath } from '@/lib/i18n/config';
import type { IssuePayload } from '@/lib/flow-issue/types';
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
    ['article', 'Статьи'],
    ['video', 'Видео'],
    ['photo', 'Фото'],
  ],
  en: [
    ['note', 'Notes'],
    ['link', 'Links'],
    ['article', 'Articles'],
    ['video', 'Video'],
    ['photo', 'Photos'],
  ],
};

function parseTypeCounts(value: unknown): Record<string, number> | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, number>;
}

function summarize(byType: unknown, lang: 'ru' | 'en') {
  const map = parseTypeCounts(byType);
  if (!map) return '';
  return TYPE_NAMES[lang]
    .filter(([key]) => Number(map[key]) > 0)
    .map(([key, label]) => `${label} ${map[key]}`)
    .join(', ');
}

function toIssue(row: any): FrontIssue {
  const lang = isEn(row.lang) ? 'en' : 'ru';
  const lead = clean(row.leadBody);

  return {
    id: String(row.id),
    slug: String(row.slug || ''),
    lang,
    number: row.number ?? null,
    headline: clean(row.leadTitle) || String(row.title || 'Flow'),
    excerpt: cut(lead, 220),
    lead: cut(lead, 1400),
    summary: summarize(row.byType, lang),
    published: row.itemCount != null ? Number(row.itemCount) : null,
    publishedAt: row.publishedAt || row.sentAt || row.createdAt || null,
    createdAt: row.createdAt || null,
    periodStart: row.periodStart || null,
    periodEnd: row.periodEnd || null,
    typeCounts: parseTypeCounts(row.byType) || undefined,
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

function normalizePayload(value: unknown): IssuePayload | null {
  let payload = value;

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }

  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as IssuePayload)
    : null;
}

// The Flow preview uses the same server-side loader as /api/flow so
// publication, visibility and normalization rules stay identical without a
// self-fetch (an internal HTTP request can receive an HTML error page instead
// of JSON when the deployment cannot reach its own origin).
async function loadFlow(): Promise<FlowEntry[]> {
  try {
    // Fetch enough of the shared stream so both language editions can get a
    // real recent preview. The public list is not filtered by language:
    // `/journal` and `/ru/journal` present the same recent materials.
    const result = await loadFlowItemsPage(50, 0);
    return result.items.map(toFlow);
  } catch (error) {
    console.error('[Journal] Flow:', error);
    return [];
  }
}

export default async function JournalPageView({ lang }: { lang: JournalLanguage }) {
  const copy = JOURNAL_COPY[lang];
  const supabase: any = await createClient();

  // Read the whole catalogue in explicit pages. Interface language is not a
  // query filter, so the English journal keeps Russian editions (and their
  // original titles) in the archive.
  const [issueRows, allFlow]: [JournalIssueRow[], FlowEntry[]] = await Promise.all([
    loadAllJournalIssues(supabase).catch((error) => {
      console.error('[Journal] Issues:', error);
      return [] as JournalIssueRow[];
    }),
    loadFlow(),
  ]);

  const issues = issueRows.map(toIssue);

  // One global current issue for both /journal and /ru/journal. The selection
  // keeps that issue period but prefers its published edition in the reader's
  // language, so the Russian page shows the real Russian edition rather than a
  // translated shell around English materials. If no edition exists, the
  // original issue is shown unchanged.
  const selection = selectJournalEdition(issues, lang);
  let featured = selection.featured;
  const archive = selection.archive;

  // The catalogue only carries metadata. The featured issue additionally
  // loads its stored payload so the page can show the real materials rather
  // than a type summary.
  let payload: IssuePayload | null = null;

  if (featured?.id) {
    try {
      const detail = await loadJournalIssueDetail(supabase, featured.id);
      payload = normalizePayload(detail?.payload);

      if (payload) {
        const payloadLang =
          payload.lang === 'ru' || payload.lang === 'en' ? payload.lang : featured.lang;
        const lead = clean(payload.lead?.body) || featured.lead || '';
        const contentLead = detail?.content ? extractPreview(detail.content, payload, 1400) : '';

        featured = {
          ...featured,
          lang: payloadLang,
          headline: clean(payload.lead?.title) || featured.headline,
          lead: lead || contentLead || featured.lead,
          editorialSummary: clean(payload.summary) || undefined,
        };
      }
    } catch (error) {
      console.error('[Journal] Issue contents:', error);
    }
  }

  const materials = collectIssueMaterials(payload);

  // The recent stream is part of the same record. Interface language changes
  // the chrome, not which materials exist: keep both languages and let the
  // row label show when a material is in the other language.
  const flow = allFlow.slice(0, 4);

  const journalItems = issues.map((issue) => ({
    name: issue.headline,
    url: journalIssueHref(issue.lang, issue.slug),
  }));

  const materialItems = materials
    .map((material) => {
      const href = materialHref(material.url);
      if (!href || !material.title) return null;
      return { name: material.title, url: href };
    })
    .filter((item): item is { name: string; url: string } => item !== null);

  return (
    <div
      lang={lang}
      className="min-h-screen bg-[#F5F2EB] font-sans text-[#1D1B18] selection:bg-[#1D1B18] selection:text-[#F5F2EB]"
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
      {materialItems.length > 0 && (
        <JsonLd
          data={itemListJsonLd({
            path: localizedPath('journal', lang),
            name: copy.inside.title,
            items: materialItems,
            inLanguage: featured?.lang || lang,
          })}
        />
      )}
      <JsonLd
        data={breadcrumbJsonLd([
          { name: copy.meta.breadcrumbs.home, path: '/' },
          { name: copy.meta.breadcrumbs.section, path: localizedPath('journal', lang) },
        ])}
      />
      <FrontPage
        lang={lang}
        featured={featured}
        materials={materials}
        flow={flow}
        archive={archive}
        subscribe={
          <SubscribeFormClient defaultLanguage={lang} editorial showLanguageSelector={false} />
        }
      />
    </div>
  );
}
