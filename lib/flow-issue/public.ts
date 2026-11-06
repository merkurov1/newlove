import { getServerSupabaseClient } from '@/lib/serverAuth';
import { buildIssueTitle } from './title';
import type { IssueLang, IssuePayload } from './types';

const SELECT =
  'id,title,slug,kind,status,published,html_web,payload,publishedAt,createdAt,number,lang';

export type PublicFlowIssue = {
  id: string;
  title: string;
  slug: string;
  lang: IssueLang;
  number: number | null;
  htmlWeb: string;
  payload: IssuePayload | null;
  publishedAt: string | null;
  createdAt: string | null;
};

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function normalizeIssue(row: any): PublicFlowIssue {
  const payload =
    row?.payload && typeof row.payload === 'object' ? (row.payload as IssuePayload) : null;

  const lang: IssueLang = payload?.lang === 'ru' || row?.lang === 'ru' ? 'ru' : 'en';

  return {
    id: String(row?.id || ''),
    title: clean(row?.title) || 'Flow',
    slug: clean(row?.slug),
    lang,
    number: typeof row?.number === 'number' ? row.number : null,
    htmlWeb: clean(row?.html_web),
    payload,
    publishedAt: clean(row?.publishedAt) || clean(row?.published_at) || null,
    createdAt: clean(row?.createdAt) || clean(row?.created_at) || null,
  };
}

function client() {
  return getServerSupabaseClient({ useServiceRole: true });
}

export async function loadPublicFlowIssue(slug: string): Promise<PublicFlowIssue | null> {
  try {
    const supabase = client();
    const { data, error } = await supabase
      .from('letters')
      .select(SELECT)
      .eq('slug', slug)
      .eq('kind', 'issue')
      .eq('status', 'published')
      .eq('published', true)
      .maybeSingle();

    if (error) {
      console.error('[flow-issues] issue lookup failed', error);
      return null;
    }

    if (!data) return null;

    return normalizeIssue(data);
  } catch (error) {
    console.error('[flow-issues] issue lookup crashed', error);
    return null;
  }
}

export async function listPublicFlowIssues(lang: IssueLang): Promise<PublicFlowIssue[]> {
  try {
    const supabase = client();
    const { data, error } = await supabase
      .from('letters')
      .select(SELECT)
      .eq('kind', 'issue')
      .eq('status', 'published')
      .eq('published', true)
      .eq('lang', lang)
      .order('publishedAt', { ascending: false });

    if (error) {
      console.error('[flow-issues] archive lookup failed', error);
      return [];
    }

    return (data || []).map(normalizeIssue).filter((issue) => issue.slug);
  } catch (error) {
    console.error('[flow-issues] archive lookup crashed', error);
    return [];
  }
}

export function issuePageTitle(issue: PublicFlowIssue): string {
  if (issue.payload) {
    const title = buildIssueTitle(issue.payload);
    if (title) return title;
  }

  return issue.title;
}

export function issueDescription(issue: PublicFlowIssue): string {
  const payload = issue.payload;
  const summary = clean(payload?.summary);

  if (summary) return summary;

  if (payload?.period) {
    const start = new Date(payload.period.start);
    const end = new Date(payload.period.end);
    const locale = issue.lang === 'ru' ? 'ru-RU' : 'en-GB';

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const period = `${start.toLocaleDateString(locale, {
        timeZone: 'UTC',
      })} — ${end.toLocaleDateString(locale, { timeZone: 'UTC' })}`;

      return issue.lang === 'ru'
        ? `Выпуск Flow за период ${period}.`
        : `A Flow issue for the period ${period}.`;
    }
  }

  return issue.lang === 'ru'
    ? 'Выпуск Flow: заметки, ссылки, изображения и сигналы.'
    : 'A Flow issue: notes, links, images and signals.';
}

export function issueItemCount(issue: PublicFlowIssue): number {
  if (Array.isArray(issue.payload?.items) && issue.payload.items.length) {
    return issue.payload.items.length;
  }

  const stats = issue.payload?.stats;
  if (stats && typeof stats.published === 'number') {
    return stats.published;
  }

  const payload = issue.payload;
  return payload
    ? (payload.lead ? 1 : 0) +
        (payload.latest?.length ?? 0) +
        (payload.links?.length ?? 0) +
        (payload.videos?.length ?? 0) +
        (payload.photos?.length ?? 0)
    : 0;
}
