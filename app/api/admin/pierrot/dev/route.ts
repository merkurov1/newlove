import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getClientIp } from '@/lib/rateLimit';
import { checkPierrotRateLimit } from '@/lib/pierrot/rateLimit';
import { callDevModel } from '@/lib/pierrot/dev/llm';
import {
  appendDevMessage,
  ensureDevConversation,
  loadDevHistory,
} from '@/lib/pierrot/dev/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_DEV_MESSAGE = 8_000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;

  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const limited = await checkPierrotRateLimit({
    identifier: `dev:${admin.id || getClientIp(req)}`,
    intervalMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'pierrot-dev',
  });

  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const message =
    body && typeof body.message === 'string' ? body.message.trim() : '';
  const conversationId =
    body && typeof body.conversationId === 'string'
      ? body.conversationId
      : null;

  if (!message) {
    return json({ error: 'Message is required.' }, 400);
  }

  if (message.length > MAX_DEV_MESSAGE) {
    return json({ error: 'Message is too long.' }, 413);
  }

  if (conversationId && !/^[A-Za-z0-9_-]{8,64}$/.test(conversationId)) {
    return json({ error: 'Invalid conversation id.' }, 400);
  }

  try {
    const conversation = await ensureDevConversation({
      ownerUserId: admin.id,
      conversationId,
    });

    await appendDevMessage({
      conversationId: conversation.id,
      role: 'user',
      content: message,
    });

    const history = await loadDevHistory(conversation.id, 30);
    const result = await callDevModel(history);

    await appendDevMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: result.reply,
      provider: result.provider,
    });

    return json({
      reply: result.reply,
      conversationId: conversation.id,
      provider: result.provider,
      model: result.model,
      toolTrace: result.toolTrace,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'dev_request_failed';

    if (code === 'DEV_MIGRATION_REQUIRED') {
      return json(
        {
          error:
            'Dev mode requires the additive Supabase migration 2026-11-17_pierrot_dev_mode.sql.',
          code,
        },
        503
      );
    }

    if (
      code === 'No dev model provider is configured.' ||
      code === 'GITHUB_TOKEN is not configured.'
    ) {
      return json({ error: code, code: 'DEV_NOT_CONFIGURED' }, 503);
    }

    console.error('[Pierrot Dev]', { code });
    return json({ error: 'Dev request failed.', code }, 500);
  }
}
