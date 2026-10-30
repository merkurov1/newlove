import {
  records as fallbackRecords,
  type MediaRecord,
  type Lang,
  type Kind,
  type Topic,
  type PublicMediaQuote,
  type PublicMediaRelation,
  type PublicMediaQuoteType,
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

function mapDatabaseRecord(row: DatabaseMediaRecord): MediaRecord | null {
  if (row.status !== 'published') return null;

  const url = text(row.url, text(row.canonical_url));
  if (!url || !isValidUrl(url)) return null;

  const metadata = row.ai_metadata && typeof row.ai_metadata === 'object' ? row.ai_metadata : {};

  const lang = VALID_LANGUAGES.includes(row.lang as Lang) ? (row.lang as Lang) : 'EN';

  const kind = VALID_KINDS.includes(row.kind as Kind) ? (row.kind as Kind) : 'mention';

  const topic = VALID_TOPICS.includes(row.topic as Topic)
    ? (row.topic as Topic)
    : 'Internet & Censorship';

  const publicationDate =
    validDisplayDate(row.published_date) ?? validDisplayDate(metadata.original_date);

  const timelineDate = publicationDate ?? dateFromCreatedAt(row.created_at) ?? '1900';

  return {
    id: text(row.id) || undefined,
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
    ...(text(metadata.program) ? { program: text(metadata.program) } : {}),
  };
}

const PUBLIC_QUOTE_TYPES: PublicMediaQuoteType[] = ['direct_quote', 'indirect_quote', 'mention'];

async function enrichMediaRecords(recordsById: Map<string, MediaRecord>): Promise<void> {
  const ids = [...recordsById.keys()];
  if (ids.length === 0) return;

  const supabase = await createClient({ useServiceRole: true });
  const [documents, quotes, topics, relations] = await Promise.all([
    supabase
      .from('knowledge_documents')
      .select('media_record_id,media_text_quality,language,chunk_count,media_coverage_status')
      .in('media_record_id', ids)
      .limit(1000),
    supabase
      .from('media_quotes')
      .select(
        'id,media_record_id,quote_text,quote_type,language,translation,translation_language,translation_status,verification_status,attribution,is_current,document_char_start'
      )
      .in('media_record_id', ids)
      .eq('is_current', true)
      .eq('verification_status', 'verified')
      .order('document_char_start', { ascending: true })
      .limit(2000),
    supabase
      .from('media_analysis_topics')
      .select('media_record_id,primary_topic,subtopics,is_current')
      .in('media_record_id', ids)
      .eq('is_current', true)
      .limit(1000),
    supabase
      .from('media_record_relations')
      .select(
        'source_media_record_id,target_media_record_id,relation_type,confidence,review_status,is_current'
      )
      .eq('is_current', true)
      .eq('review_status', 'confirmed')
      .limit(2000),
  ]);

  for (const row of documents.data || []) {
    const record = recordsById.get(String(row.media_record_id));
    if (record) record.textQuality = row.media_text_quality || null;
  }

  for (const row of quotes.data || []) {
    const record = recordsById.get(String(row.media_record_id));
    if (!record) continue;

    const quoteType = row.quote_type as PublicMediaQuoteType;
    if (!PUBLIC_QUOTE_TYPES.includes(quoteType)) continue;

    const quote: PublicMediaQuote = {
      id: String(row.id),
      text: String(row.quote_text),
      type: quoteType,
      language: row.language || null,
      ...(row.translation_status === 'verified' && row.translation
        ? {
            translation: row.translation,
            translationLanguage: row.translation_language || null,
          }
        : {}),
    };

    record.verifiedQuotes = [...(record.verifiedQuotes || []), quote];
    record.quoteCount = (record.quoteCount || 0) + 1;
  }

  for (const row of topics.data || []) {
    const record = recordsById.get(String(row.media_record_id));
    if (!record) continue;

    if (
      (
        ['Internet & Censorship', 'AI & Tech', 'Art & Culture', 'Fintech & Crypto'] as string[]
      ).includes(row.primary_topic)
    ) {
      record.derivedTopic = row.primary_topic as Topic;
    }
    record.subtopics = Array.isArray(row.subtopics) ? row.subtopics : [];
  }

  for (const row of relations.data || []) {
    const sourceId = String(row.source_media_record_id);
    const targetId = String(row.target_media_record_id);
    const source = recordsById.get(sourceId);
    const target = recordsById.get(targetId);

    const add = (record: MediaRecord, other: MediaRecord) => {
      const related: PublicMediaRelation = {
        slug: other.slug,
        title: other.title,
        outlet: other.outlet,
        url: other.url,
        date: other.date,
        relationType: String(row.relation_type),
        confidence: Number(row.confidence) || 0,
      };
      const exists = (record.related || []).some(
        (item) => item.slug === related.slug && item.relationType === related.relationType
      );
      if (!exists) record.related = [...(record.related || []), related];
    };

    if (source && target) {
      add(source, target);
      add(target, source);
    }
  }
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

  const dbRecordsById = new Map<string, MediaRecord>();

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
        ].join(',')
      )
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      console.error('[media] Supabase query failed:', error.message);
    } else {
      for (const rawRow of data ?? []) {
        const record = mapDatabaseRecord(rawRow as DatabaseMediaRecord);

        if (!record) continue;

        const key = canonicalize(record.url);

        // Published database records replace matching local entries.
        // New records are added without deleting the verified archive.
        merged.set(key, record);
        if (record.id) dbRecordsById.set(record.id, record);
      }
    }

    await enrichMediaRecords(dbRecordsById);
  } catch (error) {
    console.error('[media] Using local archive fallback:', error);
  }

  return [...merged.values()].sort((a, b) => {
    const dateOrder = b.date.localeCompare(a.date);
    return dateOrder || a.title.localeCompare(b.title);
  });
}
