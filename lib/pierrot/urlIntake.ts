import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { assertServerOnly } from '@/lib/serverOnly';
import { records as mediaRecords, archives as mediaArchives } from '@/data/media';
import { parseUrl } from '@/lib/flow/parseUrl';
import { isYouTubeUrl } from '@/lib/flow/youtube';
import { enqueueBrainSources } from '@/lib/knowledge/brain/enqueue';
import { previewBrainSource } from '@/lib/knowledge/brain/preview';
import { recordPierrotEvent } from '@/lib/pierrot/serverStore';
import {
  BrainUrlError,
  getSourceDomain,
  normalizeSourceUrl,
  tryNormalizeSourceUrl,
} from '@/lib/knowledge/brain/url';
import { BrainSourceError, brainSourceErrorMessage } from '@/lib/knowledge/brain/sourceValidation';
import {
  previewMediaSource,
  type MediaPreviewExtraction,
  type MediaPreviewRecord,
} from '@/lib/knowledge/media/sourcePreview';
import { saveMediaPreview } from '@/lib/knowledge/media/savePreview';

assertServerOnly('lib/pierrot/urlIntake');

export type UrlMaterialKind =
  'media' | 'video' | 'social' | 'research' | 'article' | 'website' | 'pdf';

export type UrlBrainPipeline = 'media' | 'brain';

export type UrlDuplicateInfo = {
  status: 'existing' | 'existing_active' | 'duplicate_content' | 'media_record';
  documentId?: string;
  mediaRecordId?: string;
  title?: string;
  message: string;
};

export type UrlPreviewResult = {
  url: string;
  normalizedUrl: string;
  canonicalUrl: string | null;
  materialKind: UrlMaterialKind;
  pipeline: UrlBrainPipeline;
  title: string;
  outlet: string;
  author: string | null;
  publishedAt: string | null;
  language: string | null;
  summary: string;
  details: string[];
  contentHash: string | null;
  duplicate: UrlDuplicateInfo | null;
  canAdd: boolean;
  blocker: string | null;
};

export type PendingUrlCandidate = {
  pendingId: string;
  url: string;
  normalizedUrl: string;
  canonicalUrl: string | null;
  materialKind: UrlMaterialKind;
  pipeline: UrlBrainPipeline;
  title: string;
  contentHash: string | null;
  mediaRecordId: string | null;
  mediaCoverageDocumentId: string | null;
  createdAt: string;
};

export type LoadedPendingUrl = {
  eventKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
  candidate: PendingUrlCandidate;
};

export type UrlConfirmationResult = {
  status: 'added' | 'queued' | 'existing' | 'failed';
  message: string;
  documentId?: string;
  runId?: string;
};

export class UrlIntakeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'UrlIntakeError';
  }
}

const VIDEO_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
  'vimeo.com',
  'www.vimeo.com',
  'rutube.ru',
  'www.rutube.ru',
  'dailymotion.com',
  'www.dailymotion.com',
]);

const SOCIAL_HOSTS = new Set([
  'x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
  't.me',
  'telegram.me',
  'instagram.com',
  'www.instagram.com',
  'facebook.com',
  'www.facebook.com',
  'fb.com',
  'linkedin.com',
  'www.linkedin.com',
  'threads.net',
  'www.threads.net',
  'bsky.app',
  'vk.com',
  'www.vk.com',
  'reddit.com',
  'www.reddit.com',
]);

const RESEARCH_HOSTS = new Set([
  'arxiv.org',
  'www.arxiv.org',
  'doi.org',
  'dx.doi.org',
  'ssrn.com',
  'www.ssrn.com',
  'researchgate.net',
  'www.researchgate.net',
  'academia.edu',
  'www.academia.edu',
  'jstor.org',
  'www.jstor.org',
  'semanticscholar.org',
  'www.semanticscholar.org',
  'pubmed.ncbi.nlm.nih.gov',
  'ncbi.nlm.nih.gov',
  'www.ncbi.nlm.nih.gov',
  'nature.com',
  'www.nature.com',
  'science.org',
  'www.science.org',
  'sciencedirect.com',
  'www.sciencedirect.com',
  'springer.com',
  'www.springer.com',
  'tandfonline.com',
  'www.tandfonline.com',
  'sagepub.com',
  'www.sagepub.com',
  'wiley.com',
  'www.wiley.com',
  'cambridge.org',
  'www.cambridge.org',
  'oup.com',
  'www.oup.com',
]);

const MEDIA_HOSTS = new Set<string>();

for (const record of [...mediaRecords, ...mediaArchives]) {
  const domain = getSourceDomain(record.url);
  if (domain) MEDIA_HOSTS.add(domain);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function materialKindFor(url: string): UrlMaterialKind {
  const host = hostnameOf(url);
  const normalizedHost = host.replace(/^www\./, '');
  let pathname = '';

  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    pathname = '';
  }

  if (pathname.endsWith('.pdf')) return 'pdf';
  if (isYouTubeUrl(url) || VIDEO_HOSTS.has(host) || VIDEO_HOSTS.has(normalizedHost)) return 'video';
  if (SOCIAL_HOSTS.has(host) || SOCIAL_HOSTS.has(normalizedHost)) return 'social';
  if (RESEARCH_HOSTS.has(host) || RESEARCH_HOSTS.has(normalizedHost)) return 'research';
  if (MEDIA_HOSTS.has(normalizedHost)) return 'media';

  return /\/(article|articles|news|story|stories|post|posts|column|columns)\//i.test(pathname)
    ? 'article'
    : 'website';
}

export function detectUrlMaterialKind(rawUrl: string): UrlMaterialKind | null {
  try {
    return materialKindFor(normalizeSourceUrl(rawUrl));
  } catch {
    return null;
  }
}

export function urlMaterialKindLabel(kind: UrlMaterialKind, language: 'ru' | 'en'): string {
  const labels: Record<UrlMaterialKind, { ru: string; en: string }> = {
    media: { ru: 'публикация СМИ / статья', en: 'media publication / article' },
    video: { ru: 'видео', en: 'video' },
    social: { ru: 'пост или публикация в соцсети', en: 'social post' },
    research: { ru: 'исследовательский материал', en: 'research material' },
    article: { ru: 'статья / веб-публикация', en: 'article / web publication' },
    website: { ru: 'страница сайта', en: 'website page' },
    pdf: { ru: 'PDF-документ', en: 'PDF document' },
  };

  return labels[kind][language];
}

function errorCodeFor(error: unknown): string {
  if (error instanceof UrlIntakeError) return error.code;
  if (error instanceof BrainUrlError) return error.code;
  if (error instanceof BrainSourceError) return error.code;
  return 'url_preview_failed';
}

function errorMessageFor(error: unknown, language: 'ru' | 'en'): string {
  const code = errorCodeFor(error);

  if (error instanceof BrainSourceError) {
    return brainSourceErrorMessage(code);
  }

  const messages: Record<string, { ru: string; en: string }> = {
    url_invalid: {
      ru: 'Ссылка выглядит некорректно. Пришлите полный http(s) URL.',
      en: 'This URL looks invalid. Send a full http(s) URL.',
    },
    url_empty: {
      ru: 'Ссылка пустая. Пришлите URL.',
      en: 'The URL is empty. Send a URL.',
    },
    protocol_unsupported: {
      ru: 'Поддерживаются только http и https.',
      en: 'Only http and https are supported.',
    },
    credentials_forbidden: {
      ru: 'Ссылки с логином и паролем запрещены.',
      en: 'URLs with credentials are not allowed.',
    },
    private_host: {
      ru: 'Локальные и приватные адреса запрещены.',
      en: 'Local and private addresses are not allowed.',
    },
    dns_failed: {
      ru: 'Не удалось разрешить домен ссылки.',
      en: 'The URL hostname could not be resolved.',
    },
    fetch_timeout: {
      ru: 'Источник не ответил вовремя. Содержимое не извлечено.',
      en: 'The source took too long to respond. No content was extracted.',
    },
    fetch_failed: {
      ru: 'Не удалось загрузить страницу. Содержимое не извлечено.',
      en: 'The page could not be fetched. No content was extracted.',
    },
    unsupported_content_type: {
      ru: 'Страница отдала не HTML. Для PDF используйте Brain Injection.',
      en: 'The page did not return HTML. Use Brain Injection for PDFs.',
    },
    response_too_large: {
      ru: 'Источник слишком большой для безопасного разбора.',
      en: 'The source is too large for a safe preview.',
    },
    pdf_url_unsupported: {
      ru: 'PDF по ссылке не загружаю из чата. Используйте Brain Injection для PDF-файла.',
      en: 'PDF links are not imported from chat. Use Brain Injection for a PDF file.',
    },
  };

  return (
    messages[code]?.[language] ||
    (language === 'ru'
      ? 'Не удалось разобрать ссылку. Содержимое недоступно или не поддерживается.'
      : 'The URL could not be parsed. Its content is unavailable or unsupported.')
  );
}

function dedupeMessage(
  duplicate: UrlPreviewResult['duplicate'],
  language: 'ru' | 'en'
): string | null {
  if (!duplicate) return null;

  if (duplicate.status === 'existing_active') {
    return language === 'ru'
      ? 'Этот источник уже стоит в очереди Brain.'
      : 'This source is already queued in Brain.';
  }

  if (duplicate.status === 'duplicate_content') {
    return language === 'ru'
      ? `Такой же текст уже есть в Brain${duplicate.title ? `: ${duplicate.title}` : ''}.`
      : `The same text is already in Brain${duplicate.title ? `: ${duplicate.title}` : ''}.`;
  }

  if (duplicate.status === 'media_record') {
    return language === 'ru'
      ? 'Публикация уже есть в Media Archive. Проверю её покрытие в Brain.'
      : 'The publication already exists in the Media Archive. I will check its Brain coverage.';
  }

  return language === 'ru'
    ? `Материал уже есть в Brain${duplicate.title ? `: ${duplicate.title}` : ''}.`
    : `This material is already in Brain${duplicate.title ? `: ${duplicate.title}` : ''}.`;
}

async function previewMediaUrl(normalizedUrl: string): Promise<UrlPreviewResult> {
  const result = await previewMediaSource(
    { kind: 'url', url: normalizedUrl },
    { persistSource: false }
  );
  const record: MediaPreviewRecord = result.record;
  const extraction: MediaPreviewExtraction = result.extraction;
  const blocked = extraction.quality === 'blocked' || extraction.extractionStatus === 'blocked';
  const coverageDocumentId = result.duplicate?.coverage?.documentId || null;
  const duplicate: UrlDuplicateInfo | null = result.duplicate
    ? coverageDocumentId
      ? {
          status: 'existing',
          documentId: coverageDocumentId,
          mediaRecordId: result.duplicate.id,
          title: result.duplicate.title,
          message: 'Already indexed in Brain.',
        }
      : {
          status: 'media_record',
          mediaRecordId: result.duplicate.id,
          title: result.duplicate.title,
          message: 'Media record exists but Brain coverage is missing.',
        }
    : null;

  return {
    url: record.url,
    normalizedUrl,
    canonicalUrl: record.canonical_url,
    materialKind: 'media',
    pipeline: 'media',
    title: record.title,
    outlet: record.outlet,
    author: record.author,
    publishedAt: record.published_date,
    language: record.lang,
    summary: record.summary.slice(0, 700),
    details: [
      `Media: ${record.kind} · ${record.topic} · ${record.lang}`,
      `Text quality: ${extraction.quality} · ${extraction.wordCount} words · ${extraction.charCount} chars · ${extraction.chunkCount} chunks`,
      ...(extraction.paywallDetected ? ['Paywall/subscriber preview detected.'] : []),
      ...(extraction.truncated ? ['The source returned only a truncated article.'] : []),
    ],
    contentHash: extraction.contentHash || null,
    duplicate,
    canAdd: !blocked && !coverageDocumentId,
    blocker: blocked
      ? extraction.errorCode || 'content_unavailable'
      : coverageDocumentId
        ? 'already_indexed'
        : null,
  };
}

async function previewBrainUrl(
  normalizedUrl: string,
  materialKind: UrlMaterialKind
): Promise<UrlPreviewResult> {
  try {
    const result = await previewBrainSource({ kind: 'url', url: normalizedUrl });
    const preview = result.preview;
    const duplicate: UrlDuplicateInfo | null = preview.duplicate
      ? {
          status: preview.duplicate.status,
          documentId: preview.duplicate.documentId || undefined,
          title: preview.duplicate.title,
          message: preview.duplicate.status,
        }
      : null;

    return {
      url: preview.canonicalUrl || normalizedUrl,
      normalizedUrl: preview.normalizedUrl,
      canonicalUrl: preview.canonicalUrl,
      materialKind,
      pipeline: 'brain',
      title: preview.title,
      outlet: getSourceDomain(preview.canonicalUrl || normalizedUrl) || 'unknown',
      author: preview.author,
      publishedAt: preview.publishedAt,
      language: preview.language,
      summary: preview.excerpt.slice(0, 700),
      details: [
        `Text: ${preview.wordCount} words · ${preview.charCount} chars · ${preview.chunkCount} chunks`,
        ...(preview.headings.length > 0
          ? [`Headings: ${preview.headings.slice(0, 4).join(' · ')}`]
          : []),
        ...preview.warnings,
      ],
      contentHash: preview.contentSha256,
      duplicate,
      canAdd: !duplicate && preview.charCount > 0,
      blocker: duplicate ? 'already_exists' : preview.charCount > 0 ? null : 'content_unavailable',
    };
  } catch (error) {
    if (materialKind !== 'video' && materialKind !== 'social') throw error;

    const metadata = await parseUrl(normalizedUrl).catch(() => null);
    if (!metadata || (!metadata.title && !metadata.description)) throw error;

    return {
      url: metadata.url,
      normalizedUrl,
      canonicalUrl: metadata.url,
      materialKind,
      pipeline: 'brain',
      title: metadata.title || metadata.site_name || hostnameOf(normalizedUrl) || normalizedUrl,
      outlet: metadata.site_name || hostnameOf(normalizedUrl) || 'unknown',
      author: null,
      publishedAt: null,
      language: null,
      summary: (metadata.description || '').slice(0, 700),
      details: [
        'Metadata extracted, but full text was not available.',
        ...(metadata.videoId ? [`Video ID: ${metadata.videoId}`] : []),
      ],
      contentHash: null,
      duplicate: null,
      canAdd: false,
      blocker: 'content_unavailable',
    };
  }
}

export async function previewUrlForPierrot(rawUrl: string): Promise<UrlPreviewResult> {
  let normalized: string;

  try {
    normalized = normalizeSourceUrl(rawUrl);
  } catch (error) {
    throw new UrlIntakeError(errorCodeFor(error), errorMessageFor(error, 'ru'));
  }

  const materialKind = materialKindFor(normalized);

  if (materialKind === 'pdf') {
    throw new UrlIntakeError(
      'pdf_url_unsupported',
      errorMessageFor(new UrlIntakeError('pdf_url_unsupported', ''), 'ru')
    );
  }

  try {
    return materialKind === 'media'
      ? await previewMediaUrl(normalized)
      : await previewBrainUrl(normalized, materialKind);
  } catch (error) {
    throw new UrlIntakeError(errorCodeFor(error), errorMessageFor(error, 'ru'));
  }
}

export function formatUrlPreview(result: UrlPreviewResult, language: 'ru' | 'en'): string {
  const ru = language === 'ru';
  const lines = [
    ru ? 'Разобрал ссылку.' : 'I parsed the link.',
    '',
    `${ru ? 'Тип' : 'Type'}: ${urlMaterialKindLabel(result.materialKind, language)}`,
    `${ru ? 'Ссылка' : 'URL'}: ${result.url}`,
    `${ru ? 'Название' : 'Title'}: ${result.title}`,
    `${ru ? 'Источник' : 'Source'}: ${result.outlet}`,
    ...(result.author ? [`${ru ? 'Автор' : 'Author'}: ${result.author}`] : []),
    ...(result.publishedAt ? [`${ru ? 'Дата' : 'Date'}: ${result.publishedAt}`] : []),
    ...(result.language ? [`${ru ? 'Язык' : 'Language'}: ${result.language}`] : []),
    '',
    result.summary || (ru ? 'Доступного описания нет.' : 'No description was available.'),
    '',
    ...result.details.map((detail) => `• ${detail}`),
  ];

  const duplicateMessage = dedupeMessage(result.duplicate, language);
  if (duplicateMessage) lines.push('', duplicateMessage);

  if (!result.canAdd) {
    lines.push(
      '',
      ru
        ? 'В Brain не добавляю: содержимое недоступно, уже существует или требует другого способа загрузки.'
        : 'I will not add it to Brain: the content is unavailable, already exists, or needs another import path.'
    );
    return lines.join('\n');
  }

  lines.push('', ru ? 'Добавить этот материал в Brain?' : 'Add this material to Brain?');

  return lines.join('\n');
}

export function extractFirstUrl(message: string): string | null {
  const match = message.match(
    /(?:^|\s)(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}(?:\/[^\s<>"']*)?)/i
  );

  if (!match?.[1]) return null;

  return match[1].replace(/[),.;!?]+$/g, '');
}

export function isUrlConfirmation(message: string): 'yes' | 'no' | null {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, '');

  if (
    /^(да|конечно|давай|добавь|добавляй|подтверждаю|yes|yep|yeah|sure|add|confirm)(?:\s|$|[,!.])/i.test(
      normalized
    )
  ) {
    return 'yes';
  }

  if (
    /^(нет|не надо|не добавляй|не добавлять|отмена|no|nope|cancel|don't|do not)(?:\s|$|[,!.])/i.test(
      normalized
    )
  ) {
    return 'no';
  }

  return null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function candidateFromPayload(payload: Record<string, unknown>): PendingUrlCandidate | null {
  const url = typeof payload.pending_url === 'string' ? payload.pending_url : '';
  const normalizedUrl =
    typeof payload.pending_normalized_url === 'string' ? payload.pending_normalized_url : '';
  const pipeline = payload.pending_pipeline === 'media' ? 'media' : 'brain';
  const materialKind =
    typeof payload.pending_kind === 'string'
      ? (payload.pending_kind as UrlMaterialKind)
      : 'website';

  if (!url || !normalizedUrl) return null;

  return {
    pendingId: typeof payload.pending_id === 'string' ? payload.pending_id : '',
    url,
    normalizedUrl,
    canonicalUrl:
      typeof payload.pending_canonical_url === 'string' ? payload.pending_canonical_url : null,
    materialKind,
    pipeline,
    title: typeof payload.pending_title === 'string' ? payload.pending_title : '',
    contentHash:
      typeof payload.pending_content_hash === 'string' ? payload.pending_content_hash : null,
    mediaRecordId:
      typeof payload.pending_media_record_id === 'string' ? payload.pending_media_record_id : null,
    mediaCoverageDocumentId:
      typeof payload.pending_media_coverage_document_id === 'string'
        ? payload.pending_media_coverage_document_id
        : null,
    createdAt: typeof payload.pending_created_at === 'string' ? payload.pending_created_at : '',
  };
}

export async function savePendingUrlCandidate(input: {
  store: SupabaseClient;
  conversationId: string;
  sessionId: string;
  preview: UrlPreviewResult;
}): Promise<void> {
  const pendingId = randomUUID();
  const createdAt = new Date().toISOString();

  await recordPierrotEvent(input.store, {
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    eventName: 'assistant_replied',
    eventKey: `brain_url_pending:${pendingId}`,
    payload: {
      pending_id: pendingId,
      pending_url: input.preview.url,
      pending_normalized_url: input.preview.normalizedUrl,
      pending_canonical_url: input.preview.canonicalUrl,
      pending_kind: input.preview.materialKind,
      pending_pipeline: input.preview.pipeline,
      pending_title: input.preview.title,
      pending_content_hash: input.preview.contentHash,
      pending_media_record_id: input.preview.duplicate?.mediaRecordId || null,
      pending_media_coverage_document_id: input.preview.duplicate?.documentId || null,
      pending_created_at: createdAt,
    },
  });
}

export async function loadPendingUrlCandidate(
  store: SupabaseClient,
  conversationId: string
): Promise<LoadedPendingUrl | null> {
  const { data, error } = await store
    .from('pierrot_events')
    .select('event_key,payload,created_at')
    .eq('conversation_id', conversationId)
    .eq('event_name', 'assistant_replied')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !Array.isArray(data)) return null;

  for (const row of data) {
    const payload = toRecord(row.payload);
    if (!payload || payload.consumed_at) continue;

    const candidate = candidateFromPayload(payload);
    if (!candidate) continue;

    return {
      eventKey: String(row.event_key || ''),
      payload,
      createdAt: String(row.created_at || candidate.createdAt || ''),
      candidate,
    };
  }

  return null;
}

export async function consumePendingUrlCandidate(input: {
  store: SupabaseClient;
  conversationId: string;
  eventKey: string;
  payload: Record<string, unknown>;
  reason: string;
}): Promise<void> {
  if (!input.eventKey) return;

  await input.store
    .from('pierrot_events')
    .update({
      payload: {
        ...input.payload,
        consumed_at: new Date().toISOString(),
        consumed_reason: input.reason,
      },
    })
    .eq('conversation_id', input.conversationId)
    .eq('event_key', input.eventKey);
}

export async function confirmPendingUrlCandidate(input: {
  candidate: PendingUrlCandidate;
  requestedBy: string | null;
  language: 'ru' | 'en';
}): Promise<UrlConfirmationResult> {
  const ru = input.language === 'ru';

  if (input.candidate.pipeline === 'media') {
    if (input.candidate.mediaCoverageDocumentId) {
      return {
        status: 'existing',
        message: ru
          ? 'Этот материал уже есть в Brain. Повторно не добавляю.'
          : 'This material is already in Brain. I did not add it again.',
        documentId: input.candidate.mediaCoverageDocumentId,
      };
    }

    try {
      const preview = await previewMediaSource({
        kind: 'url',
        url: input.candidate.normalizedUrl,
      });

      if (preview.duplicate?.coverage?.documentId) {
        return {
          status: 'existing',
          message: ru
            ? 'Этот материал уже есть в Brain. Повторно не добавляю.'
            : 'This material is already in Brain. I did not add it again.',
          documentId: preview.duplicate.coverage.documentId,
        };
      }

      if (!preview.source) {
        return {
          status: 'failed',
          message: ru
            ? 'Не удалось сохранить источник. Содержимое недоступно или источник заблокирован.'
            : 'The source could not be saved. The content is unavailable or blocked.',
        };
      }

      const saved = await saveMediaPreview({
        url: preview.record.url,
        canonicalUrl: preview.record.canonical_url,
        title: preview.record.title,
        outlet: preview.record.outlet,
        author: preview.record.author,
        publishedDate: preview.record.published_date,
        lang: preview.record.lang,
        kind: preview.record.kind,
        topic: preview.record.topic,
        summary: preview.record.summary,
        imageUrl: preview.record.image_url,
        status: 'draft',
        source: preview.source,
        extraction: preview.extraction,
        requestedBy: input.requestedBy,
      });

      if (saved.coverage?.status === 'failed') {
        return {
          status: 'failed',
          message: ru
            ? `Публикация сохранена, но очередь Brain не создана: ${saved.coverage.error || 'неизвестная ошибка'}.`
            : `The publication was saved, but the Brain queue was not created: ${saved.coverage.error || 'unknown error'}.`,
        };
      }

      return {
        status: 'queued',
        message: ru
          ? 'Добавлено: публикация сохранена в Media Archive, задача на индексацию в Brain поставлена в очередь.'
          : 'Added: the publication is saved in the Media Archive and a Brain indexing job is queued.',
        runId: saved.coverage?.runId,
      };
    } catch (error) {
      return {
        status: 'failed',
        message: ru
          ? `Не удалось добавить материал: ${errorMessageFor(error, 'ru')}`
          : `Could not add the material: ${errorMessageFor(error, 'en')}`,
      };
    }
  }

  try {
    const result = await enqueueBrainSources({
      sources: [{ kind: 'url', url: input.candidate.normalizedUrl }],
      requestedBy: input.requestedBy,
      recheckExisting: false,
    });
    const row = result.rows[0];

    if (!row) {
      return {
        status: 'failed',
        message: ru
          ? 'Не удалось поставить материал в очередь Brain.'
          : 'Could not queue the material in Brain.',
      };
    }

    if (row.status === 'existing') {
      return {
        status: 'existing',
        message: ru
          ? `Материал уже есть в Brain${row.title ? `: ${row.title}` : ''}. Повторно не добавляю.`
          : `The material is already in Brain${row.title ? `: ${row.title}` : ''}. I did not add it again.`,
        documentId: row.documentId,
      };
    }

    if (row.status === 'already_queued') {
      return {
        status: 'queued',
        message: ru
          ? 'Этот материал уже стоит в очереди Brain. Повторно не добавляю.'
          : 'This material is already queued in Brain. I did not add it again.',
        runId: row.runId,
      };
    }

    if (row.status === 'queued') {
      return {
        status: 'added',
        message: ru
          ? 'Добавлено: материал поставлен в очередь Brain.'
          : 'Added: the material is queued in Brain.',
        runId: result.startRun?.id,
      };
    }

    return {
      status: 'failed',
      message: ru
        ? `Не удалось добавить материал: ${row.reason || row.status}.`
        : `Could not add the material: ${row.reason || row.status}.`,
    };
  } catch (error) {
    return {
      status: 'failed',
      message: ru
        ? `Не удалось добавить материал: ${errorMessageFor(error, 'ru')}`
        : `Could not add the material: ${errorMessageFor(error, 'en')}`,
    };
  }
}

export function pendingUrlError(
  error: unknown,
  language: 'ru' | 'en'
): { code: string; message: string } {
  return {
    code: errorCodeFor(error),
    message: errorMessageFor(error, language),
  };
}

export function isUrlInput(message: string): boolean {
  const extracted = extractFirstUrl(message);
  if (!extracted) return false;

  const normalized = tryNormalizeSourceUrl(extracted);
  return Boolean(normalized.url);
}
