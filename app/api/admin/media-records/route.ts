import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { BrainUrlError } from '@/lib/knowledge/brain/url';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { classifyMediaPublication, normalizeMediaLanguage } from '@/lib/knowledge/media/classify';
import { extractMediaPage } from '@/lib/knowledge/media/page';
import { enqueueMediaCoverageJob } from '@/lib/knowledge/media/queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

function pageError(error: unknown): HttpError {
  if (error instanceof BrainUrlError) {
    const badInput = new Set([
      'url_empty',
      'url_invalid',
      'protocol_unsupported',
      'credentials_forbidden',
      'private_host',
      'host_missing',
      'port_forbidden',
      'url_too_long',
    ]);

    return new HttpError(
      badInput.has(error.code)
        ? 'URL публикации недопустим или указывает на закрытый адрес.'
        : 'Не удалось загрузить страницу источника.',
      badInput.has(error.code) ? 400 : 502
    );
  }

  return new HttpError('Не удалось извлечь публикацию из источника.', 502);
}

function extractionSummary(page: Awaited<ReturnType<typeof extractMediaPage>>) {
  return {
    quality: page.quality.quality,
    coverageStatus: page.quality.coverageStatus,
    extractionStatus: page.quality.extractionStatus,
    errorCode: page.quality.errorCode,
    charCount: page.article.charCount,
    wordCount: page.article.wordCount,
    chunkCount: page.chunking.chunks.length,
    languageDetected: page.article.language,
    paywallDetected: page.article.diagnostics.paywallDetected,
    truncated: page.article.diagnostics.truncated,
    parser: page.article.diagnostics.parser,
    fetchedBytes: page.fetchedBytes,
    finalUrl: page.finalUrl,
  };
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
      .limit(200);

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

    if (action !== 'parse' && action !== 'save') {
      return jsonError('Неизвестное действие.', 400);
    }

    const inputUrl = clean(body.url, 2048);

    if (!inputUrl) {
      return jsonError('Укажите URL публикации.', 400);
    }

    const store = createBrainStore();
    let page: Awaited<ReturnType<typeof extractMediaPage>>;

    try {
      page = await extractMediaPage(inputUrl);
    } catch (error) {
      throw pageError(error);
    }

    const ai = await classifyMediaPublication({
      title: page.metadata.title,
      outlet: page.metadata.outlet,
      summary: page.metadata.summary,
      url: page.metadata.canonical_url,
      detectedLanguage: page.article.language,
    });

    const duplicate = store
      ? await store.findMediaRecordByUrl(page.metadata.url, page.metadata.canonical_url)
      : null;

    if (action === 'parse') {
      return NextResponse.json({
        record: {
          ...page.metadata,
          ...ai,
        },
        extraction: extractionSummary(page),
        duplicate: duplicate
          ? {
              id: duplicate.id,
              title: duplicate.title,
              status: duplicate.status,
              canonical_url: duplicate.canonical_url,
            }
          : null,
      });
    }

    const title = clean(body.title, 500) || page.metadata.title;
    const outlet = clean(body.outlet, 300) || page.metadata.outlet;

    if (!title || !outlet) {
      return jsonError('Нужны заголовок публикации и название издания.', 400);
    }

    const kind: Kind = isOneOf(KINDS, body.kind) ? body.kind : ai.kind;

    const topic: Topic = isOneOf(TOPICS, body.topic) ? body.topic : ai.topic;

    const lang = normalizeMediaLanguage(
      typeof body.lang === 'string' ? body.lang : ai.lang,
      ai.lang
    );

    const requestedDate = validDate(body.published_date);
    const publishedDate = requestedDate || page.metadata.published_date;

    const summary = clean(
      typeof body.summary === 'string' ? body.summary : page.metadata.summary,
      2000
    );

    let imageUrl = page.metadata.image_url;

    if (typeof body.image_url === 'string' && body.image_url.trim()) {
      try {
        const candidate = new URL(body.image_url.trim());

        if (
          ['http:', 'https:'].includes(candidate.protocol) &&
          !candidate.username &&
          !candidate.password
        ) {
          imageUrl = candidate.toString();
        }
      } catch {
        // Keep the image URL extracted from the source.
      }
    }

    const status = body.status === 'published' ? 'published' : 'draft';
    const now = new Date().toISOString();

    const supabase = await createClient({ useServiceRole: true });

    const { data, error } = await supabase
      .from('media_archive_records')
      .upsert(
        {
          url: page.metadata.url,
          canonical_url: page.metadata.canonical_url,
          title,
          outlet,
          published_date: publishedDate,
          lang,
          kind,
          topic,
          summary,
          image_url: imageUrl,
          status,
          ai_metadata: {
            model: ai.model,
            classification_error: ai.error,
            reviewed: true,
            import_pending: false,
            source: 'media_record_save',
            extracted_at: now,
            language_detected: page.article.language,
            text_quality: page.quality.quality,
            extraction_status: page.quality.extractionStatus,
            coverage_status: page.quality.coverageStatus,
            char_count: page.article.charCount,
            word_count: page.article.wordCount,
            chunk_count: page.chunking.chunks.length,
            paywall_detected: page.article.diagnostics.paywallDetected,
            truncated: page.article.diagnostics.truncated,
            parser: page.article.diagnostics.parser,
            final_url: page.finalUrl,
          },
        },
        { onConflict: 'canonical_url' }
      )
      .select('*')
      .single();

    if (error) {
      console.error('[media-records] Supabase save failed:', error);

      if (error.code === '23505') {
        throw new HttpError('Публикация с таким URL уже существует.', 409);
      }

      throw new HttpError('Не удалось сохранить публикацию.', 500);
    }

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
          mediaRecordId: String(data.id),
          inputUrl: page.metadata.url,
          normalizedUrl: page.metadata.canonical_url,
          requestedBy: admin.id,
          source: 'media_record_save',
        });

        coverage = {
          status: queued.status,
          runId: queued.runId,
          jobId: queued.job.id,
        };
      } catch (queueError) {
        console.error('[media-records] coverage enqueue failed', {
          code: queueError instanceof Error ? queueError.message : 'media_coverage_enqueue_failed',
        });
        coverage = {
          status: 'failed',
          error: 'Публикация сохранена, но очередь извлечения не создана.',
        };
      }
    }

    return NextResponse.json({
      record: data,
      extraction: extractionSummary(page),
      duplicate:
        duplicate && duplicate.id !== String(data.id)
          ? {
              id: duplicate.id,
              title: duplicate.title,
              status: duplicate.status,
              canonical_url: duplicate.canonical_url,
            }
          : null,
      coverage,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
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
