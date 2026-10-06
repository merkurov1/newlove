import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { parseLotHtml } from '@/lib/lots/parse';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Проверяет, не вернулась ли заглушка Cloudflare / Bot challenge
 */
function isBlockedHtml(html: string): boolean {
  if (!html || html.length < 500) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes('just a moment...') ||
    lower.includes('enable javascript and cookies to continue') ||
    lower.includes('cf-browser-verification') ||
    lower.includes('challenge-running') ||
    lower.includes('attention required! | cloudflare')
  );
}

/**
 * Генерирует детерминированное имя файла на основе SHA-256 от URL
 */
function getDeterministicFileName(externalUrl: string, mimeType: string): string {
  const hash = crypto.createHash('sha256').update(externalUrl).digest('hex').substring(0, 16);
  let ext = 'jpg';
  if (mimeType.includes('png')) ext = 'png';
  else if (mimeType.includes('webp')) ext = 'webp';
  else if (mimeType.includes('avif')) ext = 'avif';
  else if (mimeType.includes('gif')) ext = 'gif';

  return `parsed/lot-${hash}.${ext}`;
}

/**
 * Скачивает и сохраняет изображение с проверкой дедупликации
 */
async function downloadAndStoreImage(externalUrl: string, apiKey?: string): Promise<string> {
  if (!externalUrl) return '';
  if (externalUrl.includes('/storage/v1/object/public/')) {
    return externalUrl; // Уже в Supabase Storage
  }

  let referer = 'https://www.google.com/';
  try {
    const urlObj = new URL(externalUrl);
    referer = `${urlObj.protocol}//${urlObj.hostname}/`;
  } catch {
    // Игнорируем ошибки URL
  }

  const browserHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer,
  };

  let res: Response | null = null;

  // 1. Через wsrv.nl (таймаут 5 сек)
  try {
    const fetchUrl = `https://wsrv.nl/?url=${encodeURIComponent(externalUrl)}`;
    const proxyRes = await fetch(fetchUrl, {
      headers: browserHeaders,
      signal: AbortSignal.timeout(5_000),
    });
    if (proxyRes.ok) {
      res = proxyRes;
    }
  } catch {
    console.warn('[Parser] wsrv.nl proxy failed, falling back to direct fetch...');
  }

  // 2. Прямой fetch (таймаут 5 сек)
  if (!res) {
    try {
      const directRes = await fetch(externalUrl, {
        headers: browserHeaders,
        signal: AbortSignal.timeout(5_000),
      });
      if (directRes.ok) {
        res = directRes;
      }
    } catch {
      console.warn('[Parser] Direct image fetch failed or timed out');
    }
  }

  // 3. ScrapingAnt (таймаут 10 сек)
  if (!res && apiKey) {
    try {
      const saEndpoint = new URL('https://api.scrapingant.com/v2/general');
      saEndpoint.searchParams.set('url', externalUrl);
      saEndpoint.searchParams.set('browser', 'false');

      const saRes = await fetch(saEndpoint, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (saRes.ok) {
        res = saRes;
      }
    } catch (err) {
      console.warn('[Parser] ScrapingAnt image fetch failed:', err);
    }
  }

  if (!res) {
    throw new Error(`Failed to download image from ${externalUrl}`);
  }

  const rawContentType = res.headers.get('content-type') || '';
  const contentLength = Number(res.headers.get('content-length') || 0);

  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error('The source image is larger than 15 MB');
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('The source image is larger than 15 MB');
  }

  let mimeType = rawContentType.split(';')[0].trim().toLowerCase();
  if (!mimeType.startsWith('image/')) {
    mimeType = 'image/jpeg';
  }

  const fileName = getDeterministicFileName(externalUrl, mimeType);

  // Загрузка в Supabase Storage (upsert: true перезапишет только если изменился)
  const { error: uploadError } = await supabase.storage.from('artifacts').upload(fileName, buffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (uploadError) {
    throw new Error(`Supabase Storage upload error: ${JSON.stringify(uploadError)}`);
  }

  const { data: publicUrlData } = supabase.storage.from('artifacts').getPublicUrl(fileName);

  if (!publicUrlData?.publicUrl) {
    throw new Error('Failed to get public URL from Supabase Storage');
  }

  return publicUrlData.publicUrl;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const apiKey = process.env.SCRAPINGANT_API_KEY;
    let html = '';

    // 1. Быстрый прямой запрос (5 секунд таймаут)
    try {
      const directRes = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(5_000),
      });

      if (directRes.ok) {
        const directHtml = await directRes.text();
        if (!isBlockedHtml(directHtml)) {
          html = directHtml;
        } else {
          console.warn('[Parser] Direct fetch returned Cloudflare/bot challenge page');
        }
      }
    } catch {
      console.warn('[Parser] Direct HTML fetch failed or timed out, falling back to ScrapingAnt');
    }

    // 2. Если прямой запрос не прошел или заблокирован — ScrapingAnt
    if (!html && apiKey) {
      try {
        const saEndpoint = new URL('https://api.scrapingant.com/v2/general');
        saEndpoint.searchParams.set('url', url);
        saEndpoint.searchParams.set('browser', 'true');

        const saRes = await fetch(saEndpoint, {
          headers: { 'x-api-key': apiKey },
          signal: AbortSignal.timeout(25_000),
        });

        if (saRes.ok) {
          html = await saRes.text();
        }
      } catch (err) {
        console.warn('[Parser] ScrapingAnt request failed:', err);
      }
    }

    if (!html || isBlockedHtml(html)) {
      return NextResponse.json(
        { error: 'Failed to retrieve unblocked HTML from the target URL' },
        { status: 422 }
      );
    }

    // 3. Синхронный разбор HTML лота
    const lotData = parseLotHtml(html, url);

    // 4. Зеркалирование изображения
    let permanentImageUrl = '';
    const candidates =
      lotData.imageCandidates && lotData.imageCandidates.length > 0
        ? lotData.imageCandidates
        : lotData.imageUrl
        ? [{ url: lotData.imageUrl }]
        : [];

    for (const candidate of candidates.slice(0, 3)) {
      try {
        const storedUrl = await downloadAndStoreImage(candidate.url, apiKey);
        if (storedUrl) {
          permanentImageUrl = storedUrl;
          break;
        }
      } catch (imageError) {
        console.warn(`[Parser] Image candidate failed (${candidate.url}):`, imageError);
      }
    }

    if (!permanentImageUrl && lotData.imageUrl) {
      permanentImageUrl = lotData.imageUrl;
    }

    return NextResponse.json({
      ...lotData,
      imageUrl: permanentImageUrl,
    });
  } catch (error: any) {
    console.error('[API parse-lot] Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to parse lot' }, { status: 500 });
  }
}
