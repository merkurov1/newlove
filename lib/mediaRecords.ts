import {
  records as fallbackRecords,
  type MediaRecord,
  type Lang,
  type Kind,
  type Topic,
} from '@/data/media';
import { createClient } from '@/lib/supabase/server';

type DatabaseMediaRecord = {
  id?: string | number;
  url?: string | null;
  canonical_url?: string | null;
  title?: string | null;
  outlet?: string | null;
  published_date?: string | null;
  created_at?: string | null;
  lang?: string | null;
  kind?: string | null;
  topic?: string | null;
  summary?: string | null;
  status?: string | null;
  ai_metadata?: Record<string, unknown> | null;
};

const VALID_LANGUAGES: Lang[] = ['EN', 'RU', 'DE', 'PL', 'BS'];

const VALID_KINDS: Kind[] = [
  'quote',
  'mention',
  'interview',
  'radio',
  'video',
  'column',
  'blog',
  'profile',
];

const VALID_TOPICS: Topic[] = [
  'Internet & Censorship',
  'AI & Tech',
  'Art & Culture',
  'Fintech & Crypto',
];

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function slugFromUrl(value: string): string {
  try {
    const url = new URL(value);
    const slug = `${url.hostname}${url.pathname}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);

    return slug || 'media-record';
  } catch {
    return 'media-record';
  }
}

function validDisplayDate(value: unknown): string | null {
  const candidate = text(value);

  if (/^\d{4}$/.test(candidate)) return candidate;
  if (/^\d{4}-\d{2}$/.test(candidate)) return candidate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;

  return null;
}

function dateFromCreatedAt(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;

  // Used only as a timeline fallback when the publication date is unknown.
  return parsed.toISOString().slice(0, 10);
}

function mapDatabaseRecord(
  row: DatabaseMediaRecord,
): MediaRecord | null {
  if (row.status !== 'published') return null;

  const url = text(row.url, text(row.canonical_url));
  if (!url || !isValidUrl(url)) return null;

  const metadata =
    row.ai_metadata && typeof row.ai_metadata === 'object'
      ? row.ai_metadata
      : {};

  const lang = VALID_LANGUAGES.includes(row.lang as Lang)
    ? (row.lang as Lang)
    : 'EN';

  const kind = VALID_KINDS.includes(row.kind as Kind)
    ? (row.kind as Kind)
    : 'mention';

  const topic = VALID_TOPICS.includes(row.topic as Topic)
    ? (row.topic as Topic)
    : 'Internet & Censorship';

  const publicationDate =
    validDisplayDate(row.published_date) ??
    validDisplayDate(metadata.original_date);

  const timelineDate =
    publicationDate ?? dateFromCreatedAt(row.created_at) ?? '1900';

  return {
    slug: text(metadata.slug, slugFromUrl(url)),
    title: text(row.title, 'Untitled publication'),
    outlet: text(row.outlet, 'Unknown publication'),
    url,
    date: timelineDate,
    lang,
    kind,
    topic,
    summary: text(row.summary),
    ...(!publicationDate
      ? {
          note: 'Publication date unavailable; timeline position uses archive creation date.',
        }
      : {}),
    ...(text(metadata.program)
      ? { program: text(metadata.program) }
      : {}),
  };
}

function canonicalize(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();

    return url.toString().replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

export async function getMediaRecords(): Promise<MediaRecord[]> {
  // Start with the verified local archive so it remains available
  // even if the database is temporarily unavailable.
  const merged = new Map<string, MediaRecord>();

  for (const record of fallbackRecords) {
    merged.set(canonicalize(record.url), record);
  }

  try {
    const supabase = await createClient({ useServiceRole: true });

    const { data, error } = await supabase
      .from('media_archive_records')
      .select(
        [
          'id',
          'url',
          'canonical_url',
          'title',
          'outlet',
          'published_date',
          'created_at',
          'lang',
          'kind',
          'topic',
          'summary',
          'status',
          'ai_metadata',
        ].join(','),
      )
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      console.error('[media] Supabase query failed:', error.message);
    } else {
      for (const rawRow of data ?? []) {
        const record = mapDatabaseRecord(
          rawRow as DatabaseMediaRecord,
        );

        if (!record) continue;

        const key = canonicalize(record.url);

        // Published database records replace matching local entries.
        // New records are added without deleting the verified archive.
        merged.set(key, record);
      }
    }
  } catch (error) {
    console.error('[media] Using local archive fallback:', error);
  }

  return [...merged.values()].sort((a, b) => {
    const dateOrder = b.date.localeCompare(a.date);
    return dateOrder || a.title.localeCompare(b.title);
  });
}

