import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export function resolveUrl(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch {
    return relativeOrAbsolute;
  }
}

export function getDeterministicHash(externalUrl: string): string {
  return crypto.createHash('sha256').update(externalUrl).digest('hex').substring(0, 16);
}

export async function checkExistingImage(hash: string): Promise<string | null> {
  const extensions = ['jpg', 'png', 'webp', 'avif', 'gif'];
  for (const ext of extensions) {
    const fileName = `parsed/lot-${hash}.${ext}`;
    const { data } = supabase.storage.from('artifacts').getPublicUrl(fileName);
    if (data?.publicUrl) {
      try {
        const res = await fetch(data.publicUrl, { method: 'HEAD' });
        if (res.ok) return data.publicUrl;
      } catch {
        // Игнорируем сетевые ошибки при HEAD-проверке
      }
    }
  }
  return null;
}

export async function downloadAndStoreImage(
  externalUrl: string,
  baseUrl: string,
  apiKey?: string
): Promise<string> {
  if (!externalUrl) return '';

  const absoluteUrl = resolveUrl(externalUrl, baseUrl);

  if (absoluteUrl.includes('/storage/v1/object/public/')) {
    return absoluteUrl;
  }

  const hash = getDeterministicHash(absoluteUrl);
  const existingUrl = await checkExistingImage(hash);
  if (existingUrl) {
    return existingUrl;
  }

  let referer = 'https://www.google.com/';
  try {
    const urlObj = new URL(absoluteUrl);
    referer = `${urlObj.protocol}//${urlObj.hostname}/`;
  } catch {
    // Игнорируем ошибки форматирования
  }

  const browserHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer,
  };

  let res: Response | null = null;

  // 1. wsrv.nl proxy
  try {
    const fetchUrl = `https://wsrv.nl/?url=${encodeURIComponent(absoluteUrl)}`;
    const proxyRes = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(5_000),
    });
    if (proxyRes.ok) res = proxyRes;
  } catch {
    console.warn('[Parser] wsrv.nl proxy failed, falling back to direct fetch...');
  }

  // 2. Direct fetch
  if (!res) {
    try {
      const directRes = await fetch(absoluteUrl, {
        headers: browserHeaders,
        signal: AbortSignal.timeout(5_000),
      });
      if (directRes.ok) res = directRes;
    } catch {
      console.warn('[Parser] Direct image fetch failed or timed out');
    }
  }

  // 3. ScrapingAnt fallback
  if (!res && apiKey) {
    try {
      const saEndpoint = new URL('https://api.scrapingant.com/v2/general');
      saEndpoint.searchParams.set('url', absoluteUrl);
      saEndpoint.searchParams.set('browser', 'false');

      const saRes = await fetch(saEndpoint, {
        headers: { 'x-api-key': apiKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (saRes.ok) res = saRes;
    } catch (err) {
      console.warn('[Parser] ScrapingAnt image fetch failed:', err);
    }
  }

  if (!res) {
    throw new Error(`Failed to download image from ${absoluteUrl}`);
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

  let ext = 'jpg';
  if (mimeType.includes('png')) ext = 'png';
  else if (mimeType.includes('webp')) ext = 'webp';
  else if (mimeType.includes('avif')) ext = 'avif';
  else if (mimeType.includes('gif')) ext = 'gif';

  const fileName = `parsed/lot-${hash}.${ext}`;

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
