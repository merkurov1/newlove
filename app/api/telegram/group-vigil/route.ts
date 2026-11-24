import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { readTelegramBotToken } from '@/lib/telegram/botToken';
import {
  joinGroupVigil,
  leaveGroupVigil,
  readGroupVigil,
  verifyGroupVigilContext,
  type GroupVigilContext,
} from '@/lib/telegram/groupVigil';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Action = 'join' | 'leave' | 'status';

function parseAction(value: unknown): Action | null {
  return value === 'join' || value === 'leave' || value === 'status' ? value : null;
}

function unavailable(message: string, status = 409) {
  return NextResponse.json(
    { ok: false, error: message, shared: false },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'telegram-group-vigil',
  });

  if (limited) return limited;

  const botToken = readTelegramBotToken();

  if (!botToken) {
    return unavailable('Shared Vigil is not configured for this bot.', 503);
  }

  const body = (await req.json().catch(() => null)) as
    | { action?: unknown; initData?: unknown }
    | null;

  const action = parseAction(body?.action);
  const initData = typeof body?.initData === 'string' ? body.initData : '';

  if (!action || !initData) {
    return unavailable('Invalid Shared Vigil request.', 400);
  }

  // Any client-supplied chat_instance/chat_type/chat is ignored on purpose.
  // The group is derived exclusively from the signed initData payload.
  const context: GroupVigilContext = verifyGroupVigilContext({ initData, botToken });

  if (!context.ok) {
    if (context.reason === 'group_context_unavailable') {
      return unavailable(
        'Shared Vigil requires opening the Temple from a Telegram group with a signed chat context.'
      );
    }

    if (context.reason === 'missing_bot_token') {
      return unavailable('Shared Vigil is not configured for this bot.', 503);
    }

    return unavailable('Telegram launch data could not be verified.', 401);
  }

  let store;

  try {
    store = getServerSupabaseClient({ useServiceRole: true });
  } catch {
    return unavailable('Shared Vigil storage is unavailable.', 503);
  }

  const result =
    action === 'join'
      ? await joinGroupVigil(store, context)
      : action === 'leave'
        ? await leaveGroupVigil(store, context)
        : await readGroupVigil(store, context);

  if (!result.ok) {
    return unavailable('Shared Vigil is temporarily unavailable.', 503);
  }

  return NextResponse.json(
    {
      ok: true,
      shared: true,
      joined: result.joined,
      participants: result.participants,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
