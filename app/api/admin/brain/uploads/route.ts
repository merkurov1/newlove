import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createBrainStorage } from '@/lib/knowledge/brain/storage';
import { BRAIN_SOURCE_LIMITS, isBrainSourceKind } from '@/lib/knowledge/brain/sourceTypes';
import {
  BrainSourceError,
  brainSourceErrorMessage,
} from '@/lib/knowledge/brain/sourceValidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/**
 * Issues a short-lived signed upload URL. The file goes directly from the
 * browser to the private `brain-sources` bucket, so large PDFs never pass
 * through a serverless JSON body. The preview route verifies magic bytes,
 * UTF-8 validity, size and SHA-256 after upload.
 */
export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const kind = String(record.kind || '');
  const size = Number(record.size);
  const mimeType = String(record.mimeType || '').toLowerCase().split(';')[0].trim();

  if (!isBrainSourceKind(kind) || (kind !== 'pdf' && kind !== 'txt')) {
    return json({ error: 'Only PDF and TXT uploads are supported here.' }, 400);
  }

  if (!Number.isFinite(size) || size <= 0) {
    return json({ error: 'File size is required.' }, 400);
  }

  const limit = kind === 'pdf' ? BRAIN_SOURCE_LIMITS.maxPdfBytes : BRAIN_SOURCE_LIMITS.maxTxtBytes;

  if (size > limit) {
    return json({ error: `File is larger than ${Math.floor(limit / 1024 / 1024)} MB.` }, 413);
  }

  const allowedMime =
    kind === 'pdf'
      ? ['application/pdf', 'application/octet-stream']
      : ['text/plain', 'text/markdown', 'application/octet-stream'];

  if (mimeType && !allowedMime.includes(mimeType)) {
    return json({ error: `MIME type ${mimeType} is not valid for ${kind.toUpperCase()}.` }, 415);
  }

  const storage = createBrainStorage();

  if (!storage) return json({ error: 'Private source storage is not configured.' }, 503);

  try {
    const upload = await storage.createSignedUpload(kind);
    return json({ status: 'ok', ...upload, limits: { maxBytes: limit } });
  } catch (error) {
    const code = error instanceof BrainSourceError ? error.code : 'storage_upload_url_failed';
    return json(
      { error: code, message: brainSourceErrorMessage(code) },
      error instanceof BrainSourceError ? error.status : 503
    );
  }
}
