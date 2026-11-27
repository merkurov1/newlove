import { NextResponse } from 'next/server';

import { checkRateLimit } from '@/lib/rateLimit';
import {
  FLOW_PROOFREAD_MAX_INPUT_CHARS,
  FLOW_PROOFREAD_MAX_REQUEST_BYTES,
  isFlowProofreadError,
} from '@/lib/flow/proofread';
import { proofreadFlowText } from '@/lib/flow/proofreadProvider';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const RATE_LIMIT = {
  interval: 60_000,
  maxRequests: 10,
  keyPrefix: 'flow-proofread',
} as const;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function errorResponse(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status, headers: NO_STORE });
}

/**
 * Ephemeral conservative proofread for the Flow composer.
 *
 * Auth mirrors Flow publishing: an allowlisted Telegram Mini App owner, an
 * admin bearer/cookie session, or the dedicated admin secret. The draft is
 * never persisted or logged; only the body text is sent to DeepSeek.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let ownerId: string;

  try {
    const owner = await requireAdminFromRequest(req);

    ownerId = owner.id;
  } catch {
    return errorResponse(401, 'unauthorized', 'Unauthorized');
  }

  const contentType = req.headers.get('content-type') || '';

  if (!/^application\/json(?:\s*;|$)/iu.test(contentType.trim())) {
    return errorResponse(415, 'unsupported_media_type', 'Expected an application/json request.');
  }

  const declaredLength = Number(req.headers.get('content-length') || '0');

  if (Number.isFinite(declaredLength) && declaredLength > FLOW_PROOFREAD_MAX_REQUEST_BYTES) {
    return errorResponse(413, 'payload_too_large', 'Request body is too large.');
  }

  let rawBody: string;

  try {
    rawBody = await req.text();
  } catch {
    return errorResponse(400, 'invalid_payload', 'Invalid request body.');
  }

  if (Buffer.byteLength(rawBody, 'utf8') > FLOW_PROOFREAD_MAX_REQUEST_BYTES) {
    return errorResponse(413, 'payload_too_large', 'Request body is too large.');
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, 'invalid_json', 'Invalid JSON request body.');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return errorResponse(400, 'invalid_payload', 'Invalid request payload.');
  }

  const text = (payload as Record<string, unknown>).text;

  if (typeof text !== 'string') {
    return errorResponse(400, 'invalid_payload', 'A text field is required.');
  }

  if (!text.trim()) {
    return errorResponse(400, 'empty_input', 'There is no text to proofread.');
  }

  if (text.length > FLOW_PROOFREAD_MAX_INPUT_CHARS) {
    return errorResponse(413, 'input_too_long', 'This post is too long to proofread.');
  }

  const limited = checkRateLimit(ownerId, RATE_LIMIT);

  if (limited) return limited;

  try {
    const result = await proofreadFlowText(text);

    return NextResponse.json(
      {
        text: result.text,
        unchanged: result.text === text,
      },
      { status: 200, headers: NO_STORE }
    );
  } catch (error) {
    if (isFlowProofreadError(error)) {
      // Only the fixed error code is surfaced. Provider bodies, prompts and
      // draft text are deliberately never logged or returned.
      return errorResponse(error.status, error.code, error.message);
    }

    return errorResponse(500, 'internal_error', 'Proofreading failed. Your text is unchanged.');
  }
}
