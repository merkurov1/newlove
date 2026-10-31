import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { normalizeSourceUrl } from '@/lib/knowledge/brain/url';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { normalizeMediaLanguage } from '@/lib/knowledge/media/classify';
import { enqueueMediaCoverageJob } from '@/lib/knowledge/media/queue';
import { previewMediaSource, type MediaPreviewInput } from '@/lib/knowledge/media/sourcePreview';
import { createBrainStorage } from '@/lib/knowledge/brain/storage';
import { BrainSourceError } from '@/lib/knowledge/brain/sourceValidation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const KINDS = [
  'quote',
  'mention',
  'interview',
  'radio',
  'video',
  'column',
  'blog',
  'profile',
] as const;

const TOPICS = ['Internet & Censorship', 'AI & Tech', 'Art & Culture', 'Fintech & Crypto'] as const;

type Kind = (typeof KINDS)[number];
type Topic = (typeof TOPICS)[number];

class HttpError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function clean(value: unknown, max = 2000): string {
  if (typeof value !== 'string') return '';

  return value
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка.';
}

function authErrorStatus(error: unknown): number | null {
  const message = errorMessage(error).toLowerCase();

  if (message === 'unauthorized' || message.includes('not authenticated')) {
    return 401;
  }

  if (message.includes('admin access required') || message.includes('forbidden')) {
    return 403;
  }

  return null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

async function requireAdmin(request: NextRequest) {
  try {
    return await requireAdminFromRequest(request);
  } catch (error) {
    const status = authErrorStatus(error);

    if (status) {
      throw new HttpError(status === 401 ? 'Требуется авторизация.' : 'Недостаточно прав.', status);
    }

    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const supabase = await createClient({ useServiceRole: true });

    const { data, error } = await supabase
      .from('media_archive_records')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[media-records] Supabase GET failed:', error);
      throw new HttpError('Не удалось загрузить архив публикаций.', 500);
    }

    const records = (data || []) as Array<Record<string, unknown>>;
    const ids = records.map((row) => (typeof row.id === 'string' ? row.id : '')).filter(Boolean);
    const store = createBrainStore();

    if (!store || ids.length === 0) {
      return NextResponse.json({ records });
    }

    const [documents, jobs] = await Promise.all([
      store.listMediaCoverageDocuments(ids),
      store.getLatestMediaJobsForRecords(ids),
    ]);

    const documentByRecord = new Map(
      documents.map((document) => [document.mediaRecordId, document])
    );
    const latestJobByRecord = new Map<string, (typeof jobs)[number]>();

    for (const job of jobs) {
      if (job.media_record_id && !latestJobByRecord.has(job.media_record_id)) {
        latestJobByRecord.set(job.media_record_id, job);
      }
    }

    return NextResponse.json({
      records: records.map((row) => {
        const id = typeof row.id === 'string' ? row.id : '';
        const document = documentByRecord.get(id) || null;
        const job = latestJobByRecord.get(id) || null;

        return {
          ...row,
          coverage: document
            ? {
                documentId: document.documentId,
                coverageStatus: document.coverageStatus,
                textQuality: document.textQuality,
                extractionStatus: document.extractionStatus,
                ingestionStatus: document.ingestionStatus,
                chunkCount: document.chunkCount ?? 0,
                sourceCharCount: document.sourceCharCount ?? 0,
                language: document.language,
                processedAt: document.processedAt,
                contentHash: document.contentHash,
                canonicalUrl: document.canonicalUrl,
              }
            : null,
          latest_job: job
            ? {
                id: job.id,
                runId: job.run_id,
                status: job.status,
                errorCode: job.error_code,
                errorDetail: job.error_detail,
                processedAt: job.processed_at,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }

    console.error('[media-records] GET failed:', error);

    return jsonError('Внутренняя ошибка сервера.', 500);
  }
}

const SOURCE_KINDS = ['url', 'pdf', 'txt', 'text'] as const;
const SOURCE_FORMATS = ['url', 'pdf', 'txt', 'text'] as const;

type SourceKind = (typeof SOURCE_KINDS)[number];
type SourceFormat = (typeof SOURCE_FORMATS)[number];

function isSourceKind(value: unknown): value is SourceKind {
  return typeof value === 'string' && (SOURCE_KINDS as readonly string[]).includes(value);
}

function isSourceFormat(value: unknown): value is SourceFormat {
  return typeof value === 'string' && (SOURCE_FORMATS as readonly string[]).includes(value);
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

function extractionDiagnostics(value: unknown): Record<string, unknown> {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
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
    if (source[key] !== undefined) result[key] = source[key];
  }

  return result;
}

function previewInputFromBody(body: Record<string, unknown>): MediaPreviewInput {
  const rawSource =
    body.source && typeof body.source === 'object' && !Array.isArray(body.source)
      ? (body.source as Record<string, unknown>)
      : body;
  const kindValue = rawSource.kind ?? body.sourceKind ?? (body.text ? 'text' : 'url');

  if (!isSourceKind(kindValue)) {
    throw new HttpError('Неизвестный способ загрузки текста.', 400);
  }

  return {
    kind: kindValue,
    url: clean(body.url, 2048) || clean(rawSource.url, 2048),
    text: typeof rawSource.text === 'string' ? rawSource.text : undefined,
    storagePath:
      typeof rawSource.storagePath === 'string' ? rawSource.storagePath : null,
    sourceSha256:
      typeof rawSource.sourceSha256 === 'string' ? rawSource.sourceSha256 : null,
    originalFilename:
      typeof rawSource.originalFilename === 'string' ? rawSource.originalFilename : null,
    mimeType: typeof rawSource.mimeType === 'string' ? rawSource.mimeType : null,
    byteSize: Number.isFinite(Number(rawSource.byteSize)) ? Number(rawSource.byteSize) : null,
    title: typeof body.title === 'string' ? body.title : null,
    author: typeof body.author === 'string' ? body.author : null,
    publishedAt:
      typeof body.published_date === 'string' ? body.published_date : null,
    language: typeof body.lang === 'string' ? body.lang : null,
    summary: typeof body.summary === 'string' ? body.summary : null,
    imageUrl: typeof body.image_url === 'string' ? body.image_url : null,
    kindOverride: typeof body.kind === 'string' ? body.kind : null,
    topic: typeof body.topic === 'string' ? body.topic : null,
  };
}

function storedSourceFromBody(body: Record<string, unknown>): {
  kind: SourceKind;
  format: SourceFormat;
  storagePath: string;
  sourceSha256: string;
  contentHash: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  byteSize: number | null;
  pageCount: number | null;
} {
  const raw =
    body.source && typeof body.source === 'object' && !Array.isArray(body.source)
      ? (body.source as Record<string, unknown>)
      : null;

  if (!raw) {
    throw new HttpError(
      'Сначала выполните preview, чтобы сохранить источник без повторного скачивания.',
      400
    );
  }

  if (!isSourceKind(raw.kind)) throw new HttpError('Неизвестный способ загрузки.', 400);

  const storagePath = clean(raw.storagePath, 1000);
  const sourceSha256 = clean(raw.sourceSha256, 64);
  const format = isSourceFormat(raw.format) ? raw.format : raw.kind;

  if (!storagePath || !/^[a-f0-9]{64}$/.test(sourceSha256)) {
    throw new HttpError('Некорректный источник текста. Повторите preview.', 400);
  }

  return {
    kind: raw.kind,
    format,
    storagePath,
    sourceSha256,
    contentHash:
      typeof raw.contentHash === 'string' && /^[a-f0-9]{64}$/.test(raw.contentHash)
        ? raw.contentHash
        : null,
    originalFilename:
      typeof raw.originalFilename === 'string' ? raw.originalFilename.slice(0, 300) : null,
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType.slice(0, 120) : null,
    byteSize: Number.isFinite(Number(raw.byteSize)) ? Number(raw.byteSize) : null,
    pageCount: Number.isFinite(Number(raw.pageCount)) ? Number(raw.pageCount) : null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);

    let body: Record<string, unknown>;

    try {
      const parsed: unknown = await request.json();

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return jsonError('Некорректное тело запроса.', 400);
      }

      body = parsed as Record<string, unknown>;
    } catch {
      return jsonError('Не удалось прочитать JSON запроса.', 400);
    }

    const action = body.action;

    if (action !== 'preview' && action !== 'parse' && action !== 'save') {
      return jsonError('Неизвестное действие.', 400);
    }

    const store = createBrainStore();
    const previewInput = previewInputFromBody(body);

    if (action === 'preview' || action === 'parse') {
      const preview = await previewMediaSource(previewInput);
      const blockedCodes = new Set([
        'http_status_401',
        'http_status_402',
        'http_status_403',
        'http_status_451',
        'response_too_large',
        'paywall_detected',
        'truncated_content',
      ]);
      const warning = blockedCodes.has(preview.extraction.errorCode || '')
        ? 'Источник заблокировал серверное извлечение или отдал неполный preview. Это не считается полным текстом. Вставьте доступный вам текст вручную или загрузите PDF; исходная ссылка сохранится.'
        : preview.extraction.paywallDetected
          ? 'Источник отдал paywall/subscriber preview. Preview не считается полным текстом. Вставьте доступный вам текст вручную или загрузите PDF.'
          : preview.extraction.truncated
            ? 'Источник отдал только фрагмент статьи (truncation). Полный текст не индексируется как complete.'
            : preview.extraction.quality === 'metadata_only'
              ? 'Извлечён только metadata/subscriber preview; полный текст не получен. Публикацию можно сохранить, но для индексации вставьте текст вручную или загрузите PDF.'
              : preview.extraction.quality !== 'full_text'
                ? `Качество текста: ${preview.extraction.quality}. Проверьте preview перед сохранением.`
                : null;

      return NextResponse.json({
        record: preview.record,
        source: preview.source,
        extraction: preview.extraction,
        duplicate: preview.duplicate,
        warning,
      });
    }

    const source = storedSourceFromBody(body);
    const storage = createBrainStorage();

    if (!storage) throw new HttpError('Приватное хранилище источников не настроено.', 503);

    // Verify the captured source exists and matches its SHA-256. Do not fetch
    // the publication again and do not re-extract it here.
    try {
      await storage.downloadVerified(source.storagePath, source.sourceSha256);
    } catch (error) {
      throw new HttpError(
        error instanceof BrainSourceError
          ? error.code
          : 'Сохранённый источник недоступен. Повторите preview.',
        409
      );
    }

    const title = clean(body.title, 500);
    const outlet = clean(body.outlet, 300);

    if (!title || !outlet) {
      return jsonError('Нужны заголовок публикации и название издания.', 400);
    }

    const originalUrl = clean(body.url, 2048);

    if (!originalUrl) return jsonError('Укажите исходный URL публикации.', 400);

    let canonicalUrl: string;

    try {
      canonicalUrl = normalizeSourceUrl(
        typeof body.canonical_url === 'string' && body.canonical_url.trim()
          ? body.canonical_url
          : originalUrl
      );
    } catch {
      return jsonError('URL публикации недопустим.', 400);
    }

    const supabase = await createClient({ useServiceRole: true });
    const existing = store
      ? await store.findMediaRecordByUrl(originalUrl, canonicalUrl).catch(() => null)
      : null;

    const kind: Kind = isOneOf(KINDS, body.kind)
      ? body.kind
      : isOneOf(KINDS, existing?.kind)
        ? existing.kind
        : 'mention';
    const topic: Topic = isOneOf(TOPICS, body.topic)
      ? body.topic
      : isOneOf(TOPICS, existing?.topic)
        ? existing.topic
        : TOPICS[0];
    const lang = normalizeMediaLanguage(
      typeof body.lang === 'string' ? body.lang : existing?.lang,
      'EN'
    );
    const publishedDate = validDate(body.published_date) || existing?.published_date || null;
    const summary = clean(body.summary, 2000) || existing?.summary || '';
    const author = clean(body.author, 300) || existing?.author || null;
    const imageUrl = safeImageUrl(body.image_url) || existing?.image_url || null;
    const status = body.status === 'published' ? 'published' : 'draft';
    const diagnostics = extractionDiagnostics(
      body.extraction ?? body.extraction_diagnostics
    );
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
      source_format: source.format,
      content_hash: source.contentHash,
      source_path: source.storagePath,
      source_sha256: source.sourceSha256,
      extraction_diagnostics: diagnostics,
      indexing_status: 'pending' as const,
      indexing_error: null,
      ai_metadata: {
        reviewed: true,
        import_pending: false,
        source: 'media_source_save',
        source_kind: source.kind,
        source_format: source.format,
        source_sha256: source.sourceSha256,
        content_hash: source.contentHash,
        source_path: source.storagePath,
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
      console.error('[media-records] source save failed:', error);

      if (error?.code === '23505') {
        throw new HttpError('Публикация с таким URL уже существует.', 409);
      }

      throw new HttpError('Не удалось сохранить публикацию.', 500);
    }

    const mediaRecordId = String(data.id);
    let coverage: {
      status: string;
      runId?: string;
      jobId?: string;
      error?: string;
    } | null = null;

    if (store) {
      try {
        const queued = await enqueueMediaCoverageJob({
          store,
          mediaRecordId,
          inputUrl: originalUrl,
          normalizedUrl: canonicalUrl,
          requestedBy: admin.id,
          source: 'media_source_save',
          sourceFormat: source.format,
          storagePath: source.storagePath,
          sourceSha256: source.sourceSha256,
          originalFilename: source.originalFilename,
          mimeType: source.mimeType,
          byteSize: source.byteSize,
          pageCount: source.pageCount,
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
        console.error('[media-records] coverage enqueue failed', {
          code: queueError instanceof Error ? queueError.message : 'media_coverage_enqueue_failed',
        });
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

    return NextResponse.json({
      record: data,
      updated: Boolean(existing),
      extraction: diagnostics,
      coverage,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }

    if (error instanceof BrainSourceError) {
      return jsonError(error.code, error.status);
    }

    const authStatus = authErrorStatus(error);

    if (authStatus) {
      return jsonError(
        authStatus === 401 ? 'Требуется авторизация.' : 'Недостаточно прав.',
        authStatus
      );
    }

    console.error('[media-records] POST failed:', error);

    return jsonError('Внутренняя ошибка сервера.', 500);
  }
}
