import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { previewBrainSource, type PreviewInput } from '@/lib/knowledge/brain/preview';
import { BRAIN_SOURCE_LIMITS, isBrainSourceKind } from '@/lib/knowledge/brain/sourceTypes';
import {
  BrainSourceError,
  brainSourceErrorMessage,
} from '@/lib/knowledge/brain/sourceValidation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function statusFor(error: BrainSourceError): number {
  if (error.code === 'pdf_ocr_required') return 422;
  return error.status;
}

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Invalid preview request.' }, 400);
  }

  const record = body as Record<string, unknown>;
  const kind = record.kind;

  if (!isBrainSourceKind(kind)) {
    return json({ error: 'Unknown source type.' }, 400);
  }

  const overrides =
    record.overrides && typeof record.overrides === 'object' && !Array.isArray(record.overrides)
      ? (record.overrides as Record<string, unknown>)
      : {};

  try {
    let input: PreviewInput;

    if (kind === 'url') {
      input = { kind, url: String(record.url || ''), overrides };
    } else if (kind === 'text') {
      input = { kind, text: String(record.text || ''), overrides };
    } else {
      input = {
        kind,
        storagePath: String(record.storagePath || ''),
        sourceSha256: String(record.sourceSha256 || ''),
        originalFilename:
          typeof record.originalFilename === 'string' ? record.originalFilename : null,
        mimeType: typeof record.mimeType === 'string' ? record.mimeType : null,
        byteSize: Number(record.byteSize) || null,
        overrides,
      };
    }

    const result = await previewBrainSource(input);

    return json({
      status: 'ok',
      preview: result.preview,
      storagePath: result.storagePath,
      limits: {
        maxPdfBytes: BRAIN_SOURCE_LIMITS.maxPdfBytes,
        maxTxtBytes: BRAIN_SOURCE_LIMITS.maxTxtBytes,
        maxTextBytes: BRAIN_SOURCE_LIMITS.maxTextBytes,
      },
    });
  } catch (error) {
    if (error instanceof BrainSourceError) {
      return json(
        { error: error.code, message: brainSourceErrorMessage(error.code) },
        statusFor(error)
      );
    }

    console.error('[Brain preview]', {
      code: error instanceof Error ? error.message : 'preview_failed',
    });

    return json({ error: 'Could not preview this source.' }, 503);
  }
}
