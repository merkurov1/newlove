import { Bot, webhookCallback, InlineKeyboard, type Context } from 'grammy';
import {
  createPierrotStore,
  deletePierrotConversation,
  ensurePierrotConversation,
  getPierrotConversationConsent,
  loadPierrotHistory,
  setPierrotConversationConsent,
} from '@/lib/pierrot/serverStore';
import { PIERROT_CONSENT_VERSION, PIERROT_MAX_MESSAGE_LENGTH } from '@/lib/pierrot/conversation';
import { toTelegramHtml } from '@/lib/telegram/format';
import { buildTelegramButtons, createTelegramPierrotIds } from '@/lib/telegram/pierrotAdapter';
import { HUMAN_MAX_MESSAGE_LENGTH } from '@/lib/pierrot/humanPresenceShared';
import {
  acceptHumanRequest,
  appendHumanMessage,
  closeHumanSession,
  declineHumanRequest,
  deriveTelegramHumanMessageId,
  getActiveHumanSessionForOwner,
  getHumanPresenceByRequestId,
  getHumanPresenceByTelegramMessage,
  publicHumanState,
  recordHumanEvent,
} from '@/lib/pierrot/humanPresence';
import {
  acceptedNotificationText,
  closedNotificationText,
  declinedNotificationText,
  editHumanRequestNotification,
  expiredNotificationText,
  getHumanOwnerTelegramId,
  isHumanOwnerTelegramUser,
  sendOwnerConfirmation,
} from '@/lib/pierrot/humanPresenceTelegram';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const token = process.env.PIERROT_BOT_TOKEN;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token) throw new Error('PIERROT_BOT_TOKEN is unset');
if (!sbUrl || !sbKey) throw new Error('SUPABASE credentials missing');

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.merkurov.love').replace(
  /\/+$/,
  ''
);
const internalSecret = process.env.PIERO_API_SECRET || process.env.ADMIN_SECRET_KEY;
const allowedAdmins = new Set(
  (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const bot = new Bot(token);

function isTelegramAdmin(userId: number | undefined): boolean {
  return typeof userId === 'number' && allowedAdmins.has(String(userId));
}

function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadHistory(ids: ReturnType<typeof createTelegramPierrotIds>) {
  const store = createPierrotStore();

  if (!store) return [];

  try {
    return await loadPierrotHistory(store, ids.conversationId, ids.sessionId, 20);
  } catch {
    // The bot still answers if history is temporarily unavailable.
    return [];
  }
}

type PierrotResponse = {
  reply?: string;
  provider?: string;
  actions?: Parameters<typeof buildTelegramButtons>[0]['actions'];
  links?: Parameters<typeof buildTelegramButtons>[0]['links'];
  cta?: Parameters<typeof buildTelegramButtons>[0]['cta'];
};

async function requestPierrot(input: {
  chatId: number;
  userId?: number;
  messageId: string;
  text: string;
}): Promise<PierrotResponse> {
  const ids = createTelegramPierrotIds(input.chatId, input.messageId);
  const history = await loadHistory(ids);
  let consent: {
    state: 'pending' | 'granted' | 'denied';
    version: string | null;
  } = {
    state: 'pending',
    version: PIERROT_CONSENT_VERSION,
  };
  const store = createPierrotStore();

  if (store) {
    try {
      const stored = await getPierrotConversationConsent(store, ids.conversationId, ids.sessionId);

      if (stored) {
        consent = {
          state: stored.state,
          version: stored.version ?? PIERROT_CONSENT_VERSION,
        };
      }
    } catch {
      // Keep the notified default if consent lookup is temporarily unavailable.
    }
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-telegram-user-id': String(input.chatId),
  };

  if (internalSecret) {
    headers['x-pierrot-internal'] = internalSecret;
  }

  if (isTelegramAdmin(input.userId) && internalSecret) {
    headers['x-admin-key'] = internalSecret;
  }

  const response = await fetch(`${siteUrl}/api/pierrot-web`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(55_000),
    body: JSON.stringify({
      message: input.text,
      conversationId: ids.conversationId,
      sessionId: ids.sessionId,
      userMessageId: ids.userMessageId,
      consent,
      context: { pathname: '/' },
      history,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as PierrotResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || `Pierrot web returned ${response.status}`);
  }

  return data;
}

async function sendPierrotResponse(ctx: Context, data: PierrotResponse, question?: string) {
  const buttons = buildTelegramButtons(data, siteUrl);
  const keyboard = new InlineKeyboard();

  for (const button of buttons) {
    if (button.url) {
      keyboard.url(button.text, button.url).row();
    } else if (button.callbackData) {
      keyboard.text(button.text, button.callbackData).row();
    }
  }

  const html = toTelegramHtml(data.reply || 'Silence.');
  const prefix = question ? `<b>${toTelegramHtml(question)}</b>\n\n` : '';
  const body = `${prefix}${html}`;

  try {
    await ctx.reply(body, {
      parse_mode: 'HTML',
      ...(buttons.length > 0 ? { reply_markup: keyboard } : {}),
    });
  } catch {
    await ctx.reply(`${question ? `${question}\n\n` : ''}${data.reply || 'Silence.'}`);
  }
}

async function handleText(ctx: Context, text: string, messageId: string, question?: string) {
  const chatId = ctx.chat?.id;

  if (!chatId) return;

  if (text.length > PIERROT_MAX_MESSAGE_LENGTH) {
    await ctx.reply('That thought is too long for one message.');
    return;
  }

  try {
    await ctx.api.sendChatAction(chatId, 'typing').catch(() => undefined);
    const data = await requestPierrot({
      chatId,
      userId: ctx.from?.id,
      messageId,
      text,
    });

    await sendPierrotResponse(ctx, data, question);
  } catch (error) {
    // Never expose provider responses, prompts or internal details.
    console.error(
      '[Pierrot TG] request failed:',
      error instanceof Error ? error.message : 'unknown'
    );
    await ctx.reply('The ether is disrupted. Please try again.');
  }
}

function welcomeKeyboard() {
  return new InlineKeyboard()
    .url('Lobby', `${siteUrl}/lobby`)
    .url('Flow', `${siteUrl}/flow`)
    .row()
    .url('Journal', `${siteUrl}/journal`)
    .url('Art Engine', `${siteUrl}/art-engine`)
    .row()
    .url('Selection', `${siteUrl}/selection`)
    .url('Heart & Angel', `${siteUrl}/heartandangel`)
    .row()
    .url('Temple', `${siteUrl}/temple`);
}

async function sendWelcome(ctx: Context) {
  await ctx.reply(
    [
      'Structure is the antidote to chaos.',
      '',
      'I am Pierrot. Ask me anything, or choose a door.',
      '',
      'I can save this conversation privately for up to 90 days. Send /privacy on to allow saving; /privacy off disables it. /delete removes the saved copy.',
    ].join('\n'),
    { reply_markup: welcomeKeyboard() }
  );
}

async function editCallbackNotification(
  ctx: Context,
  text: string,
  requestId?: string,
  keepActiveControls = false
): Promise<void> {
  const chatId = ctx.chat?.id;
  const messageId = ctx.callbackQuery?.message?.message_id;

  if (!chatId || !messageId) return;

  await editHumanRequestNotification(
    chatId,
    messageId,
    text,
    requestId,
    keepActiveControls
  ).catch(() => undefined);
}

async function handleHumanCallback(
  ctx: Context,
  action: 'accept' | 'decline' | 'status' | 'end',
  requestId: string
): Promise<void> {
  const owner = getHumanOwnerTelegramId();
  const fromId = ctx.from?.id;

  // callback_data is never authorization. Only the configured owner may act.
  if (!owner || !isHumanOwnerTelegramUser(fromId)) {
    await ctx.answerCallbackQuery({ text: 'Unauthorized' }).catch(() => undefined);
    return;
  }

  await ctx.answerCallbackQuery().catch(() => undefined);

  const store = createPierrotStore();

  if (!store) {
    await ctx.reply('Storage is unavailable. Please try again.').catch(() => undefined);
    return;
  }

  try {
    if (action === 'accept') {
      const result = await acceptHumanRequest(store, requestId, owner);
      const label = result.visitorLabel || '#unknown';

      if (result.result === 'accepted') {
        await editCallbackNotification(
          ctx,
          acceptedNotificationText(label),
          requestId,
          true
        );

        await sendOwnerConfirmation(
          owner,
          [
            `Conversation ${label} is active.`,
            'Write here; every message goes to the visitor on merkurov.love.',
            'Use /end to finish.',
          ].join('\n')
        ).catch(() => undefined);

        if (result.conversationId) {
          await recordHumanEvent(store, {
            conversationId: result.conversationId,
            eventName: 'human_accepted',
            eventKey: `human_accepted:${requestId}`,
            payload: { request_id: requestId },
          }).catch(() => undefined);
        }
      } else if (result.result === 'already_active') {
        await editCallbackNotification(
          ctx,
          acceptedNotificationText(label),
          requestId,
          true
        );
      } else if (result.result === 'owner_busy') {
        await sendOwnerConfirmation(
          owner,
          [
            `You are already in a live conversation${result.busyConversationId ? ` (${result.busyConversationId.slice(0, 8)})` : ''}.`,
            'Use /end to close it first, then accept this request.',
          ].join('\n')
        ).catch(() => undefined);
      } else if (result.result === 'expired') {
        await editCallbackNotification(ctx, expiredNotificationText(label));

        if (result.conversationId) {
          await recordHumanEvent(store, {
            conversationId: result.conversationId,
            eventName: 'human_expired',
            eventKey: `human_expired:${requestId}`,
            payload: { request_id: requestId },
          }).catch(() => undefined);
        }
      } else if (result.result === 'declined') {
        await editCallbackNotification(ctx, declinedNotificationText(label, 'owner'));
      } else if (result.result === 'closed') {
        await editCallbackNotification(ctx, closedNotificationText(label, 'Anton'));
      } else {
        await ctx
          .reply(`Request ${label} is ${result.result.replace(/_/g, ' ')}.`)
          .catch(() => undefined);
      }

      return;
    }

    if (action === 'decline') {
      const result = await declineHumanRequest(store, requestId, 'owner');
      const label = result.visitorLabel || '#unknown';

      if (result.result === 'declined') {
        await editCallbackNotification(ctx, declinedNotificationText(label, 'owner'));
        await sendOwnerConfirmation(
          owner,
          `Conversation ${label} declined. Piero remains with the visitor.`
        ).catch(() => undefined);

        if (result.conversationId) {
          await recordHumanEvent(store, {
            conversationId: result.conversationId,
            eventName: 'human_declined',
            eventKey: `human_declined:${requestId}`,
            payload: { resolved_by: 'owner' },
          }).catch(() => undefined);
        }
      } else if (result.result === 'already_declined') {
        await editCallbackNotification(ctx, declinedNotificationText(label, 'owner'));
      } else if (result.result === 'expired') {
        await editCallbackNotification(ctx, expiredNotificationText(label));
      } else {
        await ctx
          .reply(`Request ${label} is ${result.result.replace(/_/g, ' ')}.`)
          .catch(() => undefined);
      }

      return;
    }

    if (action === 'status') {
      const record = await getHumanPresenceByRequestId(store, requestId);

      if (!record) {
        await ctx.reply('Request not found.').catch(() => undefined);
        return;
      }

      const state = publicHumanState(record.request);
      const lines = [
        `<b>PIEROT · HUMAN PRESENCE</b>`,
        '',
        `<b>Visitor:</b> ${escapeTelegramHtml(state.visitorLabel)}`,
        `<b>Status:</b> ${escapeTelegramHtml(state.status)}`,
        `<b>Page:</b> <code>${escapeTelegramHtml(state.startPage || '/')}</code>`,
      ];

      if (state.acceptedAt) lines.push(`<b>Accepted:</b> ${state.acceptedAt}`);
      if (state.closedAt) lines.push(`<b>Closed:</b> ${state.closedAt}`);

      await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' }).catch(() => undefined);
      return;
    }

    const result = await closeHumanSession(store, requestId, 'owner', owner);
    const label = result.visitorLabel || '#unknown';

    if (result.result === 'closed' || result.result === 'already_closed') {
      await editCallbackNotification(ctx, closedNotificationText(label, 'Anton'));

      if (result.result === 'closed') {
        await sendOwnerConfirmation(
          owner,
          `Conversation ${label} closed. Piero has resumed with the visitor.`
        ).catch(() => undefined);

        if (result.conversationId) {
          await recordHumanEvent(store, {
            conversationId: result.conversationId,
            eventName: 'human_closed',
            eventKey: `human_closed:${requestId}`,
            payload: { closed_by: 'owner' },
          }).catch(() => undefined);
        }
      }
    } else {
      await ctx
        .reply(`Request ${label} is ${result.result.replace(/_/g, ' ')}.`)
        .catch(() => undefined);
    }
  } catch {
    // Do not log visitor text or callback contents.
    console.error('[Pierrot TG] human callback failed');
    await ctx.reply('The request could not be updated. Please try again.').catch(() => undefined);
  }
}

/**
 * Route a plain text message from Anton to the active website conversation.
 * Returns true when the message was consumed by human presence, false when it
 * should continue through the normal Piero AI pipeline.
 */
async function routeOwnerHumanText(ctx: Context): Promise<boolean> {
  const owner = getHumanOwnerTelegramId();
  const text = ctx.message?.text?.trim();

  if (!owner || !isHumanOwnerTelegramUser(ctx.from?.id) || !text) return false;

  if (text.length > HUMAN_MAX_MESSAGE_LENGTH) {
    await ctx.reply('That thought is too long for one message.').catch(() => undefined);
    return true;
  }

  const store = createPierrotStore();
  if (!store) return false;

  try {
    const replyTo = ctx.message?.reply_to_message?.message_id;
    let target = replyTo
      ? await getHumanPresenceByTelegramMessage(store, owner, replyTo)
      : null;

    if (!target) {
      target = await getActiveHumanSessionForOwner(store, owner);
    }

    if (!target) return false;

    if (
      target.session &&
      target.session.owner_telegram_id !== owner
    ) {
      // A reply anchor must belong to the configured owner's session.
      return true;
    }

    if (target.request.status !== 'active' || target.session?.status !== 'active') {
      if (replyTo) {
        await ctx
          .reply(
            `Conversation ${target.request.visitor_label} is ${target.request.status}. Piero is back with the visitor.`
          )
          .catch(() => undefined);
        return true;
      }

      return false;
    }

    const chatId = ctx.chat?.id;
    const messageId = ctx.message?.message_id;

    if (!chatId || typeof messageId !== 'number') return true;

    const appended = await appendHumanMessage(store, {
      requestId: target.request.id,
      messageId: deriveTelegramHumanMessageId(chatId, messageId),
      role: 'human',
      content: text,
      direction: 'telegram_to_visitor',
      telegramChatId: chatId,
      telegramMessageId: messageId,
    });

    if (appended.inserted) {
      await recordHumanEvent(store, {
        conversationId: target.request.conversation_id,
        eventName: 'human_message_received',
        eventKey: `human_message_received:${appended.sequence}`,
        payload: { length: text.length },
      }).catch(() => undefined);
    }

    // Telegram may redeliver the exact update. The deterministic message id
    // makes the second append a no-op, so no duplicate reaches the visitor.
    return true;
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';

    // A closed session can race with an incoming update. Do not fall through
    // to Piero after the owner has started a human conversation.
    await ctx
      .reply(
        code === 'P0002'
          ? 'That conversation has ended. Piero is back with the visitor.'
          : 'The message could not be delivered. Please try again.'
      )
      .catch(() => undefined);
    return true;
  }
}

async function handleEndCommand(ctx: Context): Promise<void> {
  const owner = getHumanOwnerTelegramId();

  if (!owner || !isHumanOwnerTelegramUser(ctx.from?.id)) {
    await ctx.reply('Unknown command. Use /start or ask me anything.').catch(() => undefined);
    return;
  }

  const store = createPierrotStore();
  if (!store) {
    await ctx.reply('Storage is unavailable.').catch(() => undefined);
    return;
  }

  try {
    const active = await getActiveHumanSessionForOwner(store, owner);

    if (!active) {
      await ctx.reply('No active human conversation.').catch(() => undefined);
      return;
    }

    const result = await closeHumanSession(store, active.request.id, 'owner', owner);

    if (result.result !== 'closed' && result.result !== 'already_closed') {
      await ctx
        .reply(`Request ${active.request.visitor_label} is ${result.result}.`)
        .catch(() => undefined);
      return;
    }

    if (result.telegramChatId && (active.request.telegram_status_message_id || active.request.telegram_message_id)) {
      await editHumanRequestNotification(
        result.telegramChatId,
        active.request.telegram_status_message_id ?? active.request.telegram_message_id ?? 0,
        closedNotificationText(active.request.visitor_label, 'Anton')
      ).catch(() => undefined);
    }

    await recordHumanEvent(store, {
      conversationId: active.request.conversation_id,
      eventName: 'human_closed',
      eventKey: `human_closed:${active.request.id}`,
      payload: { closed_by: 'owner' },
    }).catch(() => undefined);

    await ctx
      .reply(
        `Conversation ${active.request.visitor_label} closed. Piero has resumed with the visitor.`
      )
      .catch(() => undefined);
  } catch {
    await ctx
      .reply('The conversation could not be closed. Please try again.')
      .catch(() => undefined);
  }
}

async function handleStatusCommand(ctx: Context): Promise<void> {
  const owner = getHumanOwnerTelegramId();

  if (!owner || !isHumanOwnerTelegramUser(ctx.from?.id)) {
    await ctx.reply('Unknown command. Use /start or ask me anything.').catch(() => undefined);
    return;
  }

  const store = createPierrotStore();

  if (!store) {
    await ctx.reply('Storage is unavailable.').catch(() => undefined);
    return;
  }

  try {
    const active = await getActiveHumanSessionForOwner(store, owner);

    if (!active) {
      await ctx.reply('No active human conversation.').catch(() => undefined);
      return;
    }

    const state = publicHumanState(active.request);

    await ctx
      .reply(
        [
          '<b>PIEROT · HUMAN PRESENCE</b>',
          '',
          `<b>Visitor:</b> ${escapeTelegramHtml(state.visitorLabel)}`,
          `<b>Status:</b> ${escapeTelegramHtml(state.status)}`,
          `<b>Page:</b> <code>${escapeTelegramHtml(state.startPage || '/')}</code>`,
          `<b>Opened:</b> ${escapeTelegramHtml(state.acceptedAt || '—')}`,
          '',
          'Write here to reply. Use /end to finish.',
        ].join('\n'),
        { parse_mode: 'HTML' }
      )
      .catch(() => undefined);
  } catch {
    await ctx.reply('Status is temporarily unavailable.').catch(() => undefined);
  }
}

async function handleHumanHelpCommand(ctx: Context): Promise<void> {
  if (!isHumanOwnerTelegramUser(ctx.from?.id)) {
    await ctx.reply('Unknown command. Use /start or ask me anything.').catch(() => undefined);
    return;
  }

  await ctx
    .reply(
      [
        '<b>PIEROT · HUMAN PRESENCE</b>',
        '',
        'Accept a visitor request from its notification.',
        'Write here to reply to the active visitor.',
        '/status — current conversation',
        '/end — close the conversation and return to Piero',
      ].join('\n'),
      { parse_mode: 'HTML' }
    )
    .catch(() => undefined);
}

bot.command('start', (ctx) => sendWelcome(ctx));
bot.command('help', (ctx) => sendWelcome(ctx));
bot.command('end', (ctx) => handleEndCommand(ctx));
bot.command('status', (ctx) => handleStatusCommand(ctx));
bot.command('human', (ctx) => handleHumanHelpCommand(ctx));

bot.command('privacy', async (ctx) => {
  const ids = createTelegramPierrotIds(ctx.chat.id, 'privacy');
  const store = createPierrotStore();
  const argument = (ctx.match || '').trim().toLowerCase();

  if (argument === 'off' || argument === 'on') {
    if (store) {
      try {
        await ensurePierrotConversation(store, {
          id: ids.conversationId,
          sessionId: ids.sessionId,
          startPage: '/',
          referrer: null,
          language: 'und',
          consentState: 'pending',
          consentVersion: PIERROT_CONSENT_VERSION,
        });
        await setPierrotConversationConsent(
          store,
          ids.conversationId,
          ids.sessionId,
          argument === 'off' ? 'denied' : 'granted',
          PIERROT_CONSENT_VERSION
        );
      } catch {
        await ctx.reply('The saving preference could not be updated. Please try again.');
        return;
      }
    }

    await ctx.reply(
      argument === 'off'
        ? 'Saving is off. Pierrot will answer without keeping a transcript. Existing saved copy remains until /delete.'
        : 'Saving is on. Pierrot will keep this conversation privately for up to 90 days.'
    );
    return;
  }

  let state: 'pending' | 'granted' | 'denied' = 'pending';

  if (store) {
    try {
      const stored = await getPierrotConversationConsent(store, ids.conversationId, ids.sessionId);
      if (stored) state = stored.state;
    } catch {
      // Report the default when the lookup is unavailable.
    }
  }

  await ctx.reply(
    [
      `Saving is ${state === 'granted' ? 'on' : 'off'}.`,
      'Use /privacy on to allow saving or /privacy off to disable it.',
      'Use /delete to remove the saved transcript.',
    ].join('\n')
  );
});

bot.command('delete', async (ctx) => {
  const store = createPierrotStore();

  if (store) {
    const ids = createTelegramPierrotIds(ctx.chat.id, 'delete');

    try {
      await deletePierrotConversation(store, ids.conversationId, ids.sessionId);
    } catch (error) {
      console.error(
        '[Pierrot TG] delete failed:',
        error instanceof Error ? error.message : 'unknown'
      );
      await ctx.reply('The saved copy could not be deleted. Please try again.');
      return;
    }
  }

  await ctx.reply('The saved copy of this conversation has been deleted.');
});

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith('/')) {
    await ctx.reply('Unknown command. Use /start or ask me anything.');
    return;
  }

  // While Anton is in a human conversation, his text belongs to the visitor,
  // not to Piero. Outside a human conversation this returns false and the
  // existing Piero AI flow is untouched.
  const handledAsHuman = await routeOwnerHumanText(ctx);

  if (handledAsHuman) return;

  await handleText(ctx, text, String(ctx.message.message_id));
});

bot.callbackQuery(/^hp:(accept|decline|status|end):([0-9a-fA-F-]{36})$/, async (ctx) => {
  const action = ctx.match?.[1] as 'accept' | 'decline' | 'status' | 'end';
  const requestId = ctx.match?.[2];

  if (!action || !requestId) {
    await ctx.answerCallbackQuery({ text: 'Invalid request' }).catch(() => undefined);
    return;
  }

  await handleHumanCallback(ctx, action, requestId);
});

bot.callbackQuery(/^p:(.+)$/, async (ctx) => {
  if (!ctx.chat) return;

  const prompt = Buffer.from(ctx.match[1], 'base64url').toString('utf8');

  await ctx.answerCallbackQuery().catch(() => undefined);

  if (prompt.trim()) {
    await handleText(ctx, prompt, `callback:${ctx.callbackQuery.id}`, prompt);
  }
});

bot.catch((error) => {
  console.error('[Pierrot TG] global error:', error instanceof Error ? error.message : 'unknown');
});

// The secret token is opt-in. A deployment whose Telegram webhook was
// registered without secret_token must not silently reject every update.
const enforceWebhookSecret = process.env.TELEGRAM_WEBHOOK_ENFORCE_SECRET === '1';
const webhookSecret = enforceWebhookSecret ? process.env.TELEGRAM_WEBHOOK_SECRET : undefined;

if (process.env.TELEGRAM_WEBHOOK_SECRET && !enforceWebhookSecret) {
  console.warn(
    '[Pierrot TG] TELEGRAM_WEBHOOK_SECRET is set but enforcement is off. ' +
      'Set TELEGRAM_WEBHOOK_ENFORCE_SECRET=1 after registering the webhook with secret_token.'
  );
}

export const POST = webhookCallback(
  bot,
  'std/http',
  webhookSecret ? { secretToken: webhookSecret } : undefined
);
