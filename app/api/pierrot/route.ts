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
  getPendingHumanRequestForOwner,
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
import { planOwnerHumanRouting } from '@/lib/pierrot/humanRouting';
import {
  largestTelegramPhoto,
  transcribeTelegramVoice,
  uploadTelegramPhoto,
} from '@/lib/telegram/files';
import {
  clearTelegramFlowMode,
  getTelegramFlowMode,
  isTelegramFlowMode,
  setTelegramFlowMode,
  TELEGRAM_FLOW_MODES,
  telegramFlowModeLabel,
  type TelegramFlowMode,
} from '@/lib/telegram/flowState';
import { crosspostSummary, publishTelegramFlowItem } from '@/lib/telegram/flowPublish';
import {
  getNotificationPreferences,
  isNotificationOwner,
  setNotificationPreference,
  TELEGRAM_NOTIFICATION_CATEGORIES,
  type TelegramNotificationCategory,
} from '@/lib/telegram/notifications';

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
    // The shared backend verifies this against the same allowed-user list and
    // the server-to-server secret. x-admin-key is retained for compatibility
    // but is not an owner credential.
    headers['x-admin-key'] = internalSecret;
    headers['x-telegram-owner-id'] = String(input.userId);
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

  await editHumanRequestNotification(chatId, messageId, text, requestId, keepActiveControls).catch(
    () => undefined
  );
}

type PierrotStore = NonNullable<ReturnType<typeof createPierrotStore>>;

/**
 * Accepting a new request replaces the owner's previous live conversation.
 *
 * The database allows only one active session per owner. Without this
 * replacement an abandoned session blocks every future request with
 * `owner_busy`, and the owner's next Telegram message is silently routed to
 * the old visitor. Closing the old session on an explicit accept keeps the
 * invariant and makes the new request usable.
 */
async function acceptHumanRequestReplacingActive(
  store: PierrotStore,
  requestId: string,
  owner: number
) {
  const result = await acceptHumanRequest(store, requestId, owner);

  if (result.result !== 'owner_busy') return result;

  const active = await getActiveHumanSessionForOwner(store, owner);

  if (!active || active.request.id === requestId) return result;

  const closed = await closeHumanSession(store, active.request.id, 'owner', owner);

  if (closed.result === 'closed') {
    await recordHumanEvent(store, {
      conversationId: active.request.conversation_id,
      eventName: 'human_closed',
      eventKey: `human_closed:${active.request.id}`,
      payload: { closed_by: 'owner', reason: 'replaced' },
    }).catch(() => undefined);

    if (active.request.telegram_chat_id && active.request.telegram_message_id) {
      await editHumanRequestNotification(
        active.request.telegram_chat_id,
        active.request.telegram_message_id,
        closedNotificationText(active.request.visitor_label, 'Anton')
      ).catch(() => undefined);
    }
  }

  return acceptHumanRequest(store, requestId, owner);
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
      const result = await acceptHumanRequestReplacingActive(store, requestId, owner);
      const label = result.visitorLabel || '#unknown';

      if (result.result === 'accepted') {
        await editCallbackNotification(ctx, acceptedNotificationText(label), requestId, true);

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
        await editCallbackNotification(ctx, acceptedNotificationText(label), requestId, true);
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
    const replyTarget = replyTo
      ? await getHumanPresenceByTelegramMessage(store, owner, replyTo)
      : null;
    const activeTarget = replyTarget ? null : await getActiveHumanSessionForOwner(store, owner);

    // A plain message with no Reply and no active session is still a valid
    // answer to the only notification waiting for this owner. With several
    // pending requests the lookup returns null instead of guessing.
    const pendingTarget =
      replyTarget || activeTarget ? null : await getPendingHumanRequestForOwner(store, owner);

    const plan = planOwnerHumanRouting({ replyTarget, activeTarget, pendingTarget });

    if (!plan) return false;

    let target = plan.target;

    if (target.session && target.session.owner_telegram_id !== owner) {
      // A reply anchor must belong to the configured owner's session.
      return true;
    }

    // Sending any text in response to a pending request is an explicit
    // acceptance. This covers both Telegram Reply and the single-pending
    // fallback above, so a natural "just type back" gesture never dead-ends.
    if (plan.autoAccept) {
      const accepted = await acceptHumanRequestReplacingActive(store, target.request.id, owner);

      if (accepted.result === 'accepted' || accepted.result === 'already_active') {
        target = (await getHumanPresenceByRequestId(store, target.request.id)) ?? target;

        if (target.request.telegram_chat_id && target.request.telegram_message_id) {
          await editHumanRequestNotification(
            target.request.telegram_chat_id,
            target.request.telegram_message_id,
            acceptedNotificationText(target.request.visitor_label),
            target.request.id,
            true
          ).catch(() => undefined);
        }
      } else {
        await ctx
          .reply(
            accepted.result === 'expired'
              ? `Conversation ${target.request.visitor_label} expired. Piero is back with the visitor.`
              : `Conversation ${target.request.visitor_label} could not be started (${accepted.result}).`
          )
          .catch(() => undefined);
        return true;
      }
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

    if (
      result.telegramChatId &&
      (active.request.telegram_status_message_id || active.request.telegram_message_id)
    ) {
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

function flowModesKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const entry of TELEGRAM_FLOW_MODES) {
    keyboard.text(`${entry.label} — ${entry.description}`, `flow:mode:${entry.mode}`).row();
  }

  return keyboard;
}

async function handleFlowCommand(ctx: Context): Promise<void> {
  if (!isTelegramAdmin(ctx.from?.id)) {
    await ctx.reply('Flow publishing is available to the owner account.').catch(() => undefined);
    return;
  }

  await ctx
    .reply(
      [
        '<b>Publish to Flow</b>',
        '',
        'Choose a mode. The next message is published immediately — no draft and no confirmation step.',
        'Use /cancel to leave this mode.',
      ].join('\n'),
      { parse_mode: 'HTML', reply_markup: flowModesKeyboard() }
    )
    .catch(() => undefined);
}

async function handleFlowModeSelection(ctx: Context, mode: TelegramFlowMode): Promise<void> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!isTelegramAdmin(userId) || typeof userId !== 'number' || typeof chatId !== 'number') {
    await ctx.answerCallbackQuery({ text: 'Unauthorized' }).catch(() => undefined);
    return;
  }

  const store = createPierrotStore();

  if (!store) {
    await ctx.answerCallbackQuery({ text: 'Storage is unavailable' }).catch(() => undefined);
    return;
  }

  try {
    await setTelegramFlowMode(store, { userId, chatId, mode });
  } catch {
    await ctx.answerCallbackQuery({ text: 'Could not start this mode' }).catch(() => undefined);
    await ctx.reply('Flow publishing is temporarily unavailable.').catch(() => undefined);
    return;
  }

  await ctx.answerCallbackQuery().catch(() => undefined);

  const instructions: Record<TelegramFlowMode, string> = {
    note: 'Send the note text. It will be published immediately.',
    link: 'Send a message containing the link and any commentary.',
    article: 'Send the article text. It will be published immediately.',
    media: 'Send a photo with an optional caption.',
  };

  await ctx
    .reply(
      [
        `<b>${escapeTelegramHtml(telegramFlowModeLabel(mode))} mode</b>`,
        '',
        instructions[mode],
        '',
        'Use /cancel to stop.',
      ].join('\n'),
      { parse_mode: 'HTML' }
    )
    .catch(() => undefined);
}

async function handleCancelCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const store = createPierrotStore();

  if (store && typeof userId === 'number' && typeof chatId === 'number') {
    await clearTelegramFlowMode(store, { userId, chatId }).catch(() => undefined);
  }

  await ctx
    .reply('Flow mode cancelled. Ordinary Pierrot conversation is active again.')
    .catch(() => undefined);
}

function flowPublishedKeyboard(url: string, title: string): InlineKeyboard {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

  return new InlineKeyboard()
    .url('Open publication', url)
    .url('Share', share)
    .row()
    .text('Publish another', 'flow:again');
}

async function sendFlowPublishResult(
  ctx: Context,
  result: Awaited<ReturnType<typeof publishTelegramFlowItem>>
): Promise<void> {
  if (!result.ok) {
    await ctx
      .reply(`Flow was not published: ${escapeTelegramHtml(result.error)}`, { parse_mode: 'HTML' })
      .catch(() => undefined);
    return;
  }

  const title = typeof result.item.title === 'string' ? result.item.title : 'Flow item';
  const crosspost = crosspostSummary(result.crosspost);
  const lines = [
    '<b>Published to Flow</b>',
    '',
    `<b>${escapeTelegramHtml(title)}</b>`,
    `<a href="${escapeTelegramHtml(result.url)}">Open publication</a>`,
  ];

  if (result.duplicate) {
    lines.push('', 'This Telegram update was already published; no duplicate was created.');
  }

  if (crosspost) {
    lines.push('', `<b>Crosspost</b>`, escapeTelegramHtml(crosspost));
  }

  await ctx
    .reply(lines.join('\n'), {
      parse_mode: 'HTML',
      reply_markup: flowPublishedKeyboard(result.url, title),
      link_preview_options: { is_disabled: true },
    })
    .catch(async () => {
      await ctx.reply(`${title}\n${result.url}`).catch(() => undefined);
    });
}

async function handleFlowText(ctx: Context, text: string): Promise<boolean> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;
  const store = createPierrotStore();

  if (
    !store ||
    typeof userId !== 'number' ||
    typeof chatId !== 'number' ||
    typeof messageId !== 'number'
  ) {
    return false;
  }

  let mode: TelegramFlowMode | null = null;

  try {
    mode = await getTelegramFlowMode(store, { userId, chatId });
  } catch {
    return false;
  }

  if (!mode) return false;

  const result = await publishTelegramFlowItem({
    store,
    userId,
    chatId,
    messageId,
    mode,
    text,
    username: ctx.from?.username ?? null,
    firstName: ctx.from?.first_name ?? null,
  });

  if (result.ok) {
    await clearTelegramFlowMode(store, { userId, chatId }).catch(() => undefined);
  }

  await sendFlowPublishResult(ctx, result);
  return true;
}

async function handleFlowPhoto(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;
  const store = createPierrotStore();

  if (
    !store ||
    typeof userId !== 'number' ||
    typeof chatId !== 'number' ||
    typeof messageId !== 'number'
  ) {
    return false;
  }

  let mode: TelegramFlowMode | null = null;

  try {
    mode = await getTelegramFlowMode(store, { userId, chatId });
  } catch {
    return false;
  }

  if (mode !== 'media') {
    await ctx
      .reply(
        'To publish a photo, open /flow and choose Media. Visual analysis is not enabled for ordinary Pierrot chat.'
      )
      .catch(() => undefined);
    return true;
  }

  const photo = largestTelegramPhoto(ctx.message?.photo);

  if (!photo) {
    await ctx.reply('That photo is too large or unsupported.').catch(() => undefined);
    return true;
  }

  const imageUrl = await uploadTelegramPhoto(store, {
    fileId: photo.file_id,
    chatId,
  });

  if (!imageUrl) {
    await ctx
      .reply('The photo could not be uploaded. Try a smaller JPEG or PNG.')
      .catch(() => undefined);
    return true;
  }

  const result = await publishTelegramFlowItem({
    store,
    userId,
    chatId,
    messageId,
    mode,
    text: ctx.message?.caption ?? '',
    imageUrl,
    username: ctx.from?.username ?? null,
    firstName: ctx.from?.first_name ?? null,
  });

  if (result.ok) {
    await clearTelegramFlowMode(store, { userId, chatId }).catch(() => undefined);
  }

  await sendFlowPublishResult(ctx, result);
  return true;
}

async function notificationSettingsView(
  store: NonNullable<ReturnType<typeof createPierrotStore>>,
  userId: number
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const preferences = await getNotificationPreferences(store, userId);
  const keyboard = new InlineKeyboard();

  for (const entry of TELEGRAM_NOTIFICATION_CATEGORIES) {
    keyboard
      .text(
        `${preferences[entry.category] ? '✅' : '⬜'} ${entry.label}`,
        `notif:toggle:${entry.category}`
      )
      .row();
  }

  return {
    text: [
      '<b>Pierrot notifications</b>',
      '',
      'Only the owner account can receive administrative notifications.',
      'Tap a category to enable or disable it.',
    ].join('\n'),
    keyboard,
  };
}

async function handleSettingsCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;

  if (typeof userId !== 'number' || !isNotificationOwner(userId)) {
    await ctx
      .reply('Notification settings are available to the owner account.')
      .catch(() => undefined);
    return;
  }

  const store = createPierrotStore();

  if (!store) {
    await ctx.reply('Notification settings are temporarily unavailable.').catch(() => undefined);
    return;
  }

  const view = await notificationSettingsView(store, userId).catch(() => null);

  if (!view) {
    await ctx.reply('Notification settings are temporarily unavailable.').catch(() => undefined);
    return;
  }

  await ctx
    .reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard })
    .catch(() => undefined);
}

async function handleNotificationToggle(
  ctx: Context,
  category: TelegramNotificationCategory
): Promise<void> {
  const userId = ctx.from?.id;

  if (typeof userId !== 'number' || !isNotificationOwner(userId)) {
    await ctx.answerCallbackQuery({ text: 'Unauthorized' }).catch(() => undefined);
    return;
  }

  const store = createPierrotStore();

  if (!store) {
    await ctx.answerCallbackQuery({ text: 'Unavailable' }).catch(() => undefined);
    return;
  }

  const preferences = await getNotificationPreferences(store, userId).catch(() => null);

  if (!preferences) {
    await ctx.answerCallbackQuery({ text: 'Unavailable' }).catch(() => undefined);
    return;
  }

  const enabled = !preferences[category];

  try {
    await setNotificationPreference(store, { userId, category, enabled });
  } catch {
    await ctx.answerCallbackQuery({ text: 'Could not save' }).catch(() => undefined);
    return;
  }

  const view = await notificationSettingsView(store, userId).catch(() => null);

  await ctx.answerCallbackQuery({ text: enabled ? 'Enabled' : 'Disabled' }).catch(() => undefined);

  if (view) {
    await ctx
      .editMessageText(view.text, {
        parse_mode: 'HTML',
        reply_markup: view.keyboard,
      })
      .catch(() => undefined);
  }
}

bot.command('start', (ctx) => sendWelcome(ctx));
bot.command('help', (ctx) => sendWelcome(ctx));
bot.command('flow', (ctx) => handleFlowCommand(ctx));
bot.command('cancel', (ctx) => handleCancelCommand(ctx));
bot.command('end', (ctx) => handleEndCommand(ctx));
bot.command('status', (ctx) => handleStatusCommand(ctx));
bot.command('human', (ctx) => handleHumanHelpCommand(ctx));
bot.command('settings', (ctx) => handleSettingsCommand(ctx));

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

  const handledAsFlow = await handleFlowText(ctx, text);

  if (handledAsFlow) return;

  await handleText(ctx, text, String(ctx.message.message_id));
});

bot.on('message:photo', async (ctx) => {
  await handleFlowPhoto(ctx);
});

bot.on('message:voice', async (ctx) => {
  const voice = ctx.message?.voice;

  if (!voice?.file_id) return;

  const transcript = await transcribeTelegramVoice({
    fileId: voice.file_id,
    mime: voice.mime_type ?? null,
  });

  if (!transcript) {
    await ctx
      .reply('Voice transcription is not available right now. Send text instead.')
      .catch(() => undefined);
    return;
  }

  await ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => undefined);
  await handleText(ctx, transcript, String(ctx.message.message_id));
});

bot.on('message:document', async (ctx) => {
  const document = ctx.message?.document;
  const mime = document?.mime_type ?? '';
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const messageId = ctx.message?.message_id;
  const store = createPierrotStore();

  if (
    !document?.file_id ||
    !store ||
    typeof userId !== 'number' ||
    typeof chatId !== 'number' ||
    typeof messageId !== 'number'
  ) {
    return;
  }

  let mode: TelegramFlowMode | null = null;

  try {
    mode = await getTelegramFlowMode(store, { userId, chatId });
  } catch {
    return;
  }

  if (mode === 'media' && mime.startsWith('image/')) {
    const imageUrl = await uploadTelegramPhoto(store, {
      fileId: document.file_id,
      chatId,
      mime,
    });

    if (!imageUrl) {
      await ctx.reply('That image document could not be uploaded.').catch(() => undefined);
      return;
    }

    const result = await publishTelegramFlowItem({
      store,
      userId,
      chatId,
      messageId,
      mode,
      text: ctx.message?.caption ?? '',
      imageUrl,
      username: ctx.from?.username ?? null,
      firstName: ctx.from?.first_name ?? null,
    });

    if (result.ok) {
      await clearTelegramFlowMode(store, { userId, chatId }).catch(() => undefined);
    }

    await sendFlowPublishResult(ctx, result);
    return;
  }

  await ctx
    .reply('Only text, links, photos, voice and supported image documents are accepted here.')
    .catch(() => undefined);
});

bot.callbackQuery(/^flow:mode:(note|link|article|media)$/, async (ctx) => {
  const mode = ctx.match?.[1];

  if (!isTelegramFlowMode(mode)) {
    await ctx.answerCallbackQuery({ text: 'Invalid mode' }).catch(() => undefined);
    return;
  }

  await handleFlowModeSelection(ctx, mode);
});

bot.callbackQuery('flow:again', async (ctx) => {
  await ctx.answerCallbackQuery().catch(() => undefined);
  await handleFlowCommand(ctx);
});

bot.callbackQuery(/^notif:toggle:(human_requests|flow|art_engine|pierrot|system)$/, async (ctx) => {
  const category = ctx.match?.[1] as TelegramNotificationCategory | undefined;

  if (!category) {
    await ctx.answerCallbackQuery({ text: 'Invalid category' }).catch(() => undefined);
    return;
  }

  await handleNotificationToggle(ctx, category);
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

const telegramWebhook = webhookCallback(
  bot,
  'std/http',
  webhookSecret ? { secretToken: webhookSecret } : undefined
);

export async function POST(request: Request) {
  if (enforceWebhookSecret && !webhookSecret) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Telegram webhook secret is not configured.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }

  return telegramWebhook(request);
}
