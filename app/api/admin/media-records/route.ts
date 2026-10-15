import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import * as cheerio from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

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

const TOPICS = [
  'Internet & Censorship',
  'AI & Tech',
  'Art & Culture',
  'Fintech & Crypto',
] as const;

const LANGUAGES = ['EN', 'RU', 'DE', 'PL', 'BS'] as const;

type Kind = (typeof KINDS)[number];
type Topic = (typeof TOPICS)[number];
type Language = (typeof LANGUAGES)[number];

class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
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

function isOneOf<T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка.';
}

function authErrorStatus(error: unknown): number | null {
  const message = errorMessage(error).toLowerCase();

  if (
    message === 'unauthorized' ||
    message.includes('not authenticated')
  ) {
    return 401;
  }

  if (
    message.includes('admin access required') ||
    message.includes('forbidden')
  ) {
    return 403;
  }

  return null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const value = ip.toLowerCase().split('%')[0];

  if (
    value === '::' ||
    value === '::1' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    /^fe[89ab]/.test(value) ||
    value.startsWith('ff')
  ) {
    return true;
  }

  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);

  if (mapped) {
    return isPrivateIPv4(mapped[1]);
  }

  // IPv4-mapped IPv6 in hexadecimal form.
  const hexMapped = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);

  if (hexMapped) {
    const high = parseInt(hexMapped[1], 16);
    const low = parseInt(hexMapped[2], 16);

    const ipv4 = [
      (high >> 8) & 255,
      high & 255,
      (low >> 8) & 255,
      low & 255,
    ].join('.');

    return isPrivateIPv4(ipv4);
  }

  // Conservatively reject IPv4-compatible and other unusual mapped forms.
  if (value.startsWith('::')) return true;

  return false;
}

function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);

  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);

  return true;
}

async function validatePublicUrl(input: string): Promise<URL> {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new HttpError('Укажите корректный URL публикации.', 400);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new HttpError('Разрешены только HTTP и HTTPS ссылки.', 400);
  }

  if (url.username || url.password) {
    throw new HttpError('URL с логином или паролем запрещён.', 400);
  }

  if (!url.hostname || url.hostname.endsWith('.')) {
    throw new HttpError('Некорректное имя хоста.', 400);
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new HttpError('Этот адрес недоступен для парсинга.', 400);
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new HttpError('Приватные IP-адреса запрещены.', 400);
    }
  } else {
    let addresses: Awaited<ReturnType<typeof lookup>>[];

    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new HttpError('Не удалось проверить адрес источника.', 400);
    }

    if (
      addresses.length === 0 ||
      addresses.some((address) => isPrivateAddress(address.address))
    ) {
      throw new HttpError(
        'Источник разрешается в недопустимый IP-адрес.',
        400,
      );
    }
  }

  url.hash = '';

  return url;
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

function getMeta(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string {
  for (const selector of selectors) {
    const value = $(selector).first().attr('content')?.trim();

    if (value) return value;
  }

  return '';
}

async function readLimitedHtml(
  response: Response,
  maxBytes = 1_000_000,
): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') || 0);

  if (contentLength > maxBytes) {
    throw new HttpError('HTML-страница слишком большая для парсинга.', 413);
  }

  if (!response.body) {
    throw new HttpError('Источник вернул пустую страницу.', 502);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();
        throw new HttpError(
          'HTML-страница превышает лимит размера.',
          413,
        );
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder('utf-8').decode(result);
}

async function extractMetadata(input: string) {
  const url = await validatePublicUrl(input);

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; MerkurovMediaArchive/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
  } catch {
    throw new HttpError(
      'Не удалось загрузить страницу. Проверьте ссылку или попробуйте другой источник.',
      502,
    );
  }

  if (!response.ok) {
    throw new HttpError(`Источник вернул HTTP ${response.status}.`, 502);
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('text/html')) {
    throw new HttpError('Источник не вернул HTML-страницу.', 415);
  }

  const html = await readLimitedHtml(response);
  const $ = cheerio.load(html);

  const title =
    getMeta($, [
      'meta[property="og:title"]',
      'meta[name="og:title"]',
      'meta[name="twitter:title"]',
    ]) || clean($('title').first().text(), 500);

  const summary = getMeta($, [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);

  const canonicalHref =
    $('link[rel="canonical"]').first().attr('href')?.trim() || '';

  let canonicalUrl = url.toString();

  if (canonicalHref) {
    try {
      const candidate = new URL(canonicalHref, url);

      if (
        ['http:', 'https:'].includes(candidate.protocol) &&
        !candidate.username &&
        !candidate.password
      ) {
        candidate.hash = '';
        canonicalUrl = candidate.toString();
      }
    } catch {
      // Keep the original URL if canonical is malformed.
    }
  }

  const image =
    getMeta($, [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
    ]) || '';

  let imageUrl: string | null = null;

  if (image) {
    try {
      const candidate = new URL(image, url);

      if (
        ['http:', 'https:'].includes(candidate.protocol) &&
        !candidate.username &&
        !candidate.password
      ) {
        imageUrl = candidate.toString();
      }
    } catch {
      imageUrl = null;
    }
  }

  const rawDate =
    getMeta($, [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[name="date"]',
      'meta[name="pubdate"]',
      'meta[name="publishdate"]',
    ]) ||
    $('time[datetime]').first().attr('datetime') ||
    '';

  let publishedDate: string | null = null;

  if (rawDate) {
    const candidate = rawDate.slice(0, 10);
    publishedDate = validDate(candidate);
  }

  return {
    url: url.toString(),
    canonical_url: canonicalUrl,
    title: clean(title, 500),
    outlet: url.hostname.replace(/^www\./i, ''),
    summary: clean(summary, 2000),
    image_url: imageUrl,
    published_date: publishedDate,
  };
}

function fallbackClassification() {
  return {
    lang: 'EN' as Language,
    kind: 'mention' as Kind,
    topic: 'Internet & Censorship' as Topic,
    model: 'fallback',
  };
}

async function classify(metadata: {
  title: string;
  outlet: string;
  summary: string;
  url: string;
}) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();

  if (!apiKey) return fallbackClassification();

  try {
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

    const client = new OpenAI({
      apiKey,
      baseURL:
        process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 12_000,
      maxRetries: 1,
    });

    const result = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Classify a media archive record. Return JSON only with fields lang, kind, topic. ' +
            'lang must be EN, RU, DE, PL or BS. ' +
            'kind must be quote, mention, interview, radio, video, column, blog or profile. ' +
            'topic must be Internet & Censorship, AI & Tech, Art & Culture or Fintech & Crypto. ' +
            'Infer only from supplied metadata. Do not invent facts. ' +
            'Use mention if participation type is unclear. Choose the most relevant topic.',
        },
        {
          role: 'user',
          content: JSON.stringify(metadata),
        },
      ],
    });

    const raw = result.choices[0]?.message?.content || '{}';
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return fallbackClassification();
    }

    const data = parsed as Record<string, unknown>;

    return {
      lang: isOneOf(LANGUAGES, data.lang)
        ? data.lang
        : fallbackClassification().lang,
      kind: isOneOf(KINDS, data.kind)
        ? data.kind
        : fallbackClassification().kind,
      topic: isOneOf(TOPICS, data.topic)
        ? data.topic
        : fallbackClassification().topic,
      model,
    };
  } catch (error) {
    console.error('[media-records] DeepSeek classification failed:', error);
    return fallbackClassification();
  }
}

async function requireAdmin(request: NextRequest) {
  try {
    await requireAdminFromRequest(request);
  } catch (error) {
    const status = authErrorStatus(error);

    if (status) {
      throw new HttpError(
        status === 401 ? 'Требуется авторизация.' : 'Недостаточно прав.',
        status,
      );
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

    return NextResponse.json({ records: data || [] });
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
    await requireAdmin(request);

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

    const metadata = await extractMetadata(inputUrl);

    if (action === 'parse') {
      const ai = await classify(metadata);

      return NextResponse.json({
        record: {
          ...metadata,
          ...ai,
        },
      });
    }

    const title = clean(body.title, 500) || metadata.title;
    const outlet = clean(body.outlet, 200) || metadata.outlet;

    if (!title || !outlet) {
      return jsonError(
        'Нужны заголовок публикации и название издания.',
        400,
      );
    }

    const kind: Kind = isOneOf(KINDS, body.kind)
      ? body.kind
      : 'mention';

    const topic: Topic = isOneOf(TOPICS, body.topic)
      ? body.topic
      : 'Internet & Censorship';

    const lang: Language = isOneOf(LANGUAGES, body.lang)
      ? body.lang
      : 'EN';

    const requestedDate = validDate(body.published_date);
    const publishedDate = requestedDate || metadata.published_date;

    const summary = clean(
      typeof body.summary === 'string' ? body.summary : metadata.summary,
      2000,
    );

    let imageUrl = metadata.image_url;

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

    const classificationModel = clean(body.model, 100) || 'manual-or-fallback';

    const supabase = await createClient({ useServiceRole: true });

    const { data, error } = await supabase
      .from('media_archive_records')
      .upsert(
        {
          ...metadata,
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
            model: classificationModel,
            reviewed: true,
          },
        },
        { onConflict: 'canonical_url' },
      )
      .select('*')
      .single();

    if (error) {
      console.error('[media-records] Supabase save failed:', error);

      if (error.code === '23505') {
        throw new HttpError(
          'Публикация с таким URL уже существует.',
          409,
        );
      }

      throw new HttpError('Не удалось сохранить публикацию.', 500);
    }

    return NextResponse.json({ record: data });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status);
    }

    const authStatus = authErrorStatus(error);

    if (authStatus) {
      return jsonError(
        authStatus === 401 ? 'Требуется авторизация.' : 'Недостаточно прав.',
        authStatus,
      );
    }

    console.error('[media-records] POST failed:', error);

    return jsonError('Внутренняя ошибка сервера.', 500);
  }
}