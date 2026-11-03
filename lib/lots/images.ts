import crypto from 'crypto';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { assertServerOnly } from '@/lib/serverOnly';
import type { ImageMetadata } from './types';

assertServerOnly('lib/lots/images');

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

export interface StoredImageResult {
  publicUrl: string;
  storedPath: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  width?: number | null;
  height?: number | null;
  fetchedAt: string;
}

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

function getSupabase() {
  return getServerSupabaseClient({ useServiceRole: true });
}

export function storagePathFromArtifactsPublicUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/artifacts/';

  if (!url.includes(marker)) return null;

  try {
    const path = url.split(marker)[1]?.split('?')[0]?.split('#')[0];
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

async function findExistingImage(hash: string): Promise<StoredImageResult | null> {
  const supabase = getSupabase();
  const extensions = ['jpg', 'png', 'webp', 'avif', 'gif'];

  for (const ext of extensions) {
    const fileName = `parsed/lot-${hash}.${ext}`;
    const { data } = supabase.storage.from('artifacts').getPublicUrl(fileName);

    if (!data?.publicUrl) continue;

    try {
      const res = await fetch(data.publicUrl, { method: 'HEAD' });

      if (!res.ok) continue;

      return {
        publicUrl: data.publicUrl,
        storedPath: fileName,
        mimeType: res.headers.get('content-type') || `image/${ext}`,
        bytes: Number(res.headers.get('content-length') || 0),
        sha256: '',
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      // Ignore network errors while probing an existing object.
    }
  }

  return null;
}

export async function checkExistingImage(hash: string): Promise<string | null> {
  const existing = await findExistingImage(hash);
  return existing?.publicUrl || null;
}

async function readImageDimensions(
  buffer: Buffer,
): Promise<{ width: number | null; height: number | null }> {
  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default;
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
    };
  } catch {
    return { width: null, height: null };
  }
}

/**
 * Downloads the auction house's original image and mirrors it to Supabase
 * Storage. Returns metadata that Vault can keep even when the mirror fails.
 */
export async function downloadAndStoreImageDetailed(
  externalUrl: string,
  baseUrl: string,
  apiKey?: string,
): Promise<StoredImageResult> {
  if (!externalUrl) {
    throw new Error('Image URL is empty');
  }

  const absoluteUrl = resolveUrl(externalUrl, baseUrl);
  const existingPath = storagePathFromArtifactsPublicUrl(absoluteUrl);

  if (existingPath) {
    return {
      publicUrl: absoluteUrl,
      storedPath: existingPath,
      mimeType: 'image/jpeg',
      bytes: 0,
      sha256: '',
      fetchedAt: new Date().toISOString(),
    };
  }

  const hash = getDeterministicHash(absoluteUrl);
  const existing = await findExistingImage(hash);
  if (existing) return existing;

  let referer = 'https://www.google.com/';
  try {
    const urlObj = new URL(absoluteUrl);
    referer = `${urlObj.protocol}//${urlObj.hostname}/`;
  } catch {
    // Ignore malformed URLs; fetch will fail with a useful error.
  }

  const browserHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: referer,
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
  const supabase = getSupabase();

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

  const dimensions = await readImageDimensions(buffer);

  return {
    publicUrl: publicUrlData.publicUrl,
    storedPath: fileName,
    mimeType,
    bytes: buffer.byteLength,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    width: dimensions.width,
    height: dimensions.height,
    fetchedAt: new Date().toISOString(),
  };
}

export async function downloadAndStoreImage(
  externalUrl: string,
  baseUrl: string,
  apiKey?: string,
): Promise<string> {
  const stored = await downloadAndStoreImageDetailed(externalUrl, baseUrl, apiKey);
  return stored.publicUrl;
}

export function imageMetadataFromStoredImage(input: {
  originalUrl: string;
  source?: string | null;
  stored: StoredImageResult;
}): ImageMetadata {
  return {
    originalUrl: input.originalUrl,
    storedPath: input.stored.storedPath,
    publicUrl: input.stored.publicUrl,
    source: input.source || null,
    availability: 'mirrored',
    mimeType: input.stored.mimeType,
    bytes: input.stored.bytes,
    sha256: input.stored.sha256,
    width: input.stored.width ?? null,
    height: input.stored.height ?? null,
    fetchedAt: input.stored.fetchedAt,
    rights: {
      basis: 'auction-house-original',
      publication: 'unreviewed',
      note: 'Publication rights must be confirmed by the editor before Selection publication.',
    },
    warnings: [],
  };
}
