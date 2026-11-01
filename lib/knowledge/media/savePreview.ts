import { getServerSupabaseClient } from '@/lib/serverAuth';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { normalizeSourceUrl } from '@/lib/knowledge/brain/url';
import { enqueueMediaCoverageJob } from '@/lib/knowledge/media/queue';
import {
  MEDIA_KINDS,
  MEDIA_TOPICS,
  normalizeMediaLanguage,
  type MediaKind,
  type MediaTopic,
} from '@/lib/knowledge/media/classify';
import type {
  MediaPreviewExtraction,
  MediaSourceDescriptor,
} from '@/lib/knowledge/media/sourcePreview';

export class MediaSaveError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'MediaSaveError';
  }
}

export type MediaSaveSource = Omit<MediaSourceDescriptor, 'contentHash'> & {
  contentHash: string | null;
};

export type SaveMediaPreviewInput = {
  url: string;
  canonicalUrl?: string | null;
  title: string;
  outlet: string;
  author?: string | null;
  publishedDate?: string | null;
  lang?: string | null;
  kind?: string | null;
  topic?: string | null;
  summary?: string | null;
  imageUrl?: string | null;
  status?: 'draft' | 'published';
  source: MediaSaveSource;
  extraction?: Partial<MediaPreviewExtraction> | Record<string, unknown> | null;
  requestedBy?: string | null;
};

export type SaveMediaPreviewResult = {
  record: Record<string, unknown>;
  updated: boolean;
  coverage: {
    status: string;
    runId?: string;
    jobId?: string;
    error?: string;
  } | null;
};

function clean(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value
        .replace(/\u0000/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : date;
}

function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const candidate = new URL(value.trim());
    if (!['http:', 'https:'].includes(candidate.protocol)) return null;
    if (candidate.username || candidate.password) return null;
    return candidate.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

function isKind(value: unknown): value is MediaKind {
  return typeof value === 'string' && (MEDIA_KINDS as readonly string[]).includes(value);
}

function isTopic(value: unknown): value is MediaTopic {
  return typeof value === 'string' && (MEDIA_TOPICS as readonly string[]).includes(value);
}

function extractionDiagnostics(
  extraction: Partial<MediaPreviewExtraction> | Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!extraction) return {};

  const result: Record<string, unknown> = {};

  for (const key of [
    'quality',
    'coverageStatus',
    'extractionStatus',
    'errorCode',
    'charCount',
    'wordCount',
    'chunkCount',
    'languageDetected',
    'paywallDetected',
    'truncated',
    'parser',
    'fetchedBytes',
    'finalUrl',
    'pageCount',
    'skippedPages',
    'sourceFormat',
    'contentHash',
    'sourceSha256',
  ]) {
    const record = extraction as Record<string, unknown>;
    if (record[key] !== undefined) {
      result[key] = record[key];
    }
  }

  return result;
}

/**
 * Saves a previewed media source using the same archive and Brain coverage
 * queue as the existing Media admin panel. It is shared by the HTTP route and
 * the owner-only Pierrot URL workflow.
 */
export async function saveMediaPreview(
  input: SaveMediaPreviewInput
): Promise<SaveMediaPreviewResult> {
  const originalUrl = clean(input.url, 2048);
  if (!originalUrl) throw new MediaSaveError('Укажите исходный URL публикации.', 400);

  const title = clean(input.title, 500);
  const outlet = clean(input.outlet, 300);
  if (!title || !outlet) {
    throw new MediaSaveError('Нужны заголовок публикации и название издания.', 400);
  }

  let canonicalUrl: string;
  try {
    canonicalUrl = normalizeSourceUrl(input.canonicalUrl || originalUrl);
  } catch {
    throw new MediaSaveError('URL публикации недопустим.', 400);
  }

  const store = createBrainStore();
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const existing = store
    ? await store.findMediaRecordByUrl(originalUrl, canonicalUrl).catch(() => null)
    : null;

  const kind: MediaKind = isKind(input.kind)
    ? input.kind
    : isKind(existing?.kind)
      ? existing.kind
      : 'mention';
  const topic: MediaTopic = isTopic(input.topic)
    ? input.topic
    : isTopic(existing?.topic)
      ? existing.topic
      : 'Internet & Censorship';
  const lang = normalizeMediaLanguage(input.lang ?? existing?.lang ?? undefined, 'EN');
  const publishedDate =
    validDate(input.publishedDate) || validDate(existing?.published_date) || null;
  const summary = clean(input.summary, 2000) || existing?.summary || '';
  const author = clean(input.author, 300) || existing?.author || null;
  const imageUrl = safeImageUrl(input.imageUrl) || existing?.image_url || null;
  const status = input.status === 'published' ? 'published' : 'draft';
  const diagnostics = extractionDiagnostics(input.extraction);
  const now = new Date().toISOString();

  const payload = {
    url: originalUrl,
    canonical_url: canonicalUrl,
    title,
    outlet,
    author,
    published_date: publishedDate,
    lang,
    kind,
    topic,
    summary,
    image_url: imageUrl,
    status,
    source_format: input.source.format,
    content_hash: input.source.contentHash,
    source_path: input.source.storagePath,
    source_sha256: input.source.sourceSha256,
    extraction_diagnostics: diagnostics,
    indexing_status: 'pending' as const,
    indexing_error: null,
    ai_metadata: {
      reviewed: true,
      import_pending: false,
      source: 'media_source_save',
      source_kind: input.source.kind,
      source_format: input.source.format,
      source_sha256: input.source.sourceSha256,
      content_hash: input.source.contentHash,
      source_path: input.source.storagePath,
      extraction: diagnostics,
      extracted_at: now,
    },
    updated_at: now,
  };

  let data: Record<string, unknown> | null = null;
  let error: { code?: string; message?: string } | null = null;

  if (existing) {
    const result = await supabase
      .from('media_archive_records')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .single();
    data = result.data as Record<string, unknown> | null;
    error = result.error;
  } else {
    const result = await supabase
      .from('media_archive_records')
      .insert({ ...payload, created_at: now })
      .select('*')
      .single();
    data = result.data as Record<string, unknown> | null;
    error = result.error;

    if (error?.code === '23505') {
      const raced = store
        ? await store.findMediaRecordByUrl(originalUrl, canonicalUrl).catch(() => null)
        : null;

      if (raced) {
        const retry = await supabase
          .from('media_archive_records')
          .update(payload)
          .eq('id', raced.id)
          .select('*')
          .single();
        data = retry.data as Record<string, unknown> | null;
        error = retry.error;
      }
    }
  }

  if (error || !data) {
    console.error('[media save] source save failed:', error);

    if (error?.code === '23505') {
      throw new MediaSaveError('Публикация с таким URL уже существует.', 409);
    }

    throw new MediaSaveError('Не удалось сохранить публикацию.', 500);
  }

  const mediaRecordId = String(data.id);
  let coverage: SaveMediaPreviewResult['coverage'] = null;

  if (store) {
    try {
      const queued = await enqueueMediaCoverageJob({
        store,
        mediaRecordId,
        inputUrl: originalUrl,
        normalizedUrl: canonicalUrl,
        requestedBy: input.requestedBy || null,
        source: 'media_source_save',
        sourceFormat: input.source.format,
        storagePath: input.source.storagePath,
        sourceSha256: input.source.sourceSha256,
        originalFilename: input.source.originalFilename,
        mimeType: input.source.mimeType,
        byteSize: input.source.byteSize,
        pageCount: input.source.pageCount,
        authorOverride: author,
        publishedAtOverride: publishedDate,
        languageOverride: lang,
      });

      coverage = {
        status: queued.status,
        runId: queued.runId,
        jobId: queued.job.id,
      };

      await supabase
        .from('media_archive_records')
        .update({
          indexing_status: queued.status === 'already_queued' ? 'processing' : 'pending',
          indexing_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', mediaRecordId);
    } catch (queueError) {
      console.error(
        '[media save] coverage enqueue failed',
        queueError instanceof Error ? queueError.message : 'media_coverage_enqueue_failed'
      );
      coverage = {
        status: 'failed',
        error: 'Публикация сохранена, но очередь Knowledge не создана.',
      };

      await supabase
        .from('media_archive_records')
        .update({
          indexing_status: 'failed',
          indexing_error: 'coverage_enqueue_failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', mediaRecordId);
    }
  }

  return {
    record: data,
    updated: Boolean(existing),
    coverage,
  };
}
