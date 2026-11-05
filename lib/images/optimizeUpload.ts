import { assertServerOnly } from '@/lib/serverOnly';
import sharp from 'sharp';

assertServerOnly('lib/images/optimizeUpload');

export type OptimizedUploadImage = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number | null;
  height: number | null;
  optimized: boolean;
  originalSize: number;
};

const MAX_EDGE = 2000;
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 82;

function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    default:
      return 'bin';
  }
}

function unchanged(
  buffer: Buffer,
  mimeType: string,
  originalSize: number
): OptimizedUploadImage {
  return {
    buffer,
    mimeType,
    extension: extensionForMime(mimeType),
    width: null,
    height: null,
    optimized: false,
    originalSize,
  };
}

/**
 * Bounded upload normalization. It preserves the original format (so old Flow
 * URLs and media rows keep their extension) but resizes very large photos and
 * re-encodes JPEG/PNG/WebP once before the file reaches Supabase Storage.
 *
 * GIF and AVIF are intentionally left untouched: animated GIFs and AVIF
 * encoding are not worth the latency on every admin upload.
 */
export async function optimizeUploadImage(
  source: Buffer,
  mimeType: string
): Promise<OptimizedUploadImage> {
  const originalSize = source.length;

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    return unchanged(source, mimeType, originalSize);
  }

  try {
    const pipeline = sharp(source, { failOn: 'none', animated: false })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      });

    if (mimeType === 'image/jpeg') {
      pipeline.jpeg({
        quality: JPEG_QUALITY,
        mozjpeg: true,
        progressive: true,
      });
    } else if (mimeType === 'image/png') {
      pipeline.png({
        compressionLevel: 9,
        adaptiveFiltering: true,
      });
    } else {
      pipeline.webp({
        quality: WEBP_QUALITY,
        effort: 4,
      });
    }

    const result = await pipeline.toBuffer({ resolveWithObject: true });

    if (result.data.length >= source.length) {
      return {
        ...unchanged(source, mimeType, originalSize),
        width: result.info.width ?? null,
        height: result.info.height ?? null,
      };
    }

    return {
      buffer: result.data,
      mimeType,
      extension: extensionForMime(mimeType),
      width: result.info.width ?? null,
      height: result.info.height ?? null,
      optimized: true,
      originalSize,
    };
  } catch (error) {
    console.warn('[flow-upload] image optimization skipped', {
      message: error instanceof Error ? error.message : 'sharp_failed',
    });
    return unchanged(source, mimeType, originalSize);
  }
}
