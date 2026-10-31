import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/humanPresenceTelegram');

/**
 * Telegram presentation layer for PIERO HUMAN PRESENCE.
 *
 * This module uses the existing Piero bot token (via lib/telegram). It never
 * touches the database and never exposes credentials to the browser.
 */

import {
  editTelegramMessage,
  sendTelegramMessage,
  type TelegramSendResult,
} from '@/lib/telegram';
import type { HumanRequestRow } from '@/lib/pierrot/humanPresence';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseTelegramId(value: string | undefined): number | null {
  if (!value) return null;

  const parsed = Number(value.trim());

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The single authorized human-presence owner. Prefer the explicit variable;
 * fall back to the existing owner variables so an already-configured
 * deployment keeps working.
 */
export function getHumanOwnerTelegramId(): number | null {
  const explicit = parseTelegramId(process.env.PIERROT_OWNER_TELEGRAM_ID);

  if (explicit) return explicit;

  const legacy = parseTelegramId(process.env.MY_TELEGRAM_ID);

  if (legacy) return legacy;

  const allowed = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map((value) => parseTelegramId(value))
    .filter((value): value is number => value !== null);

  return allowed[0] ?? null;
}

export function isHumanOwnerTelegramUser(userId: unknown): boolean {
  const owner = getHumanOwnerTelegramId();

  return (
    typeof userId === 'number' &&
    Number.isSafeInteger(userId) &&
    owner !== null &&
    userId === owner
  );
}

export function isHumanPresenceConfigured(): boolean {
  const hasBotToken = Boolean(
    process.env.PIERROT_BOT_TOKEN ||
      process.env.OSIRIS_BOT_TOKEN ||
      process.env.TELEGRAM_BOT_TOKEN
  );

  return getHumanOwnerTelegramId() !== null && hasBotToken;
}

function requestNotificationText(request: {
  requestId?: string;
  visitorLabel: string;
  startPage: string;
  contextSummary?: string | null;
}): string {
  const lines = [
    '<b>PIEROT · HUMAN PRESENCE</b>',
    '',
    'Someone wants to speak with Anton.',
    '',
    `<b>Visitor:</b> ${escapeHtml(request.visitorLabel)}`,
    `<b>Page:</b> <code>${escapeHtml(request.startPage || '/')}</code>`,
  ];

  if (request.requestId) {
    lines.push(`<b>Ref:</b> <code>${escapeHtml(request.requestId.slice(0, 8))}</code>`);
  }

  if (request.contextSummary) {
    lines.push(`<b>Context:</b> ${escapeHtml(request.contextSummary)}`);
  }

  lines.push('', 'Accept to open the live conversation in this chat.');

  return lines.join('\n');
}

function requestKeyboard(requestId: string): unknown {
  return {
    inline_keyboard: [
      [{ text: 'Start conversation', callback_data: `hp:accept:${requestId}` }],
      [{ text: 'Decline', callback_data: `hp:decline:${requestId}` }],
    ],
  };
}

function activeKeyboard(requestId: string): unknown {
  return {
    inline_keyboard: [
      [{ text: 'End conversation', callback_data: `hp:end:${requestId}` }],
      [{ text: 'Status', callback_data: `hp:status:${requestId}` }],
    ],
  };
}

export async function notifyHumanRequest(
  request: Pick<
    HumanRequestRow,
    'id' | 'visitor_label' | 'start_page' | 'context_summary'
  >,
): Promise<TelegramSendResult | null> {
  const owner = getHumanOwnerTelegramId();

  if (!owner) return null;

  return sendTelegramMessage(owner, requestNotificationText({
    requestId: request.id,
    visitorLabel: request.visitor_label,
    startPage: request.start_page,
    contextSummary: request.context_summary,
  }), {
    replyMarkup: requestKeyboard(request.id),
    disableLinkPreview: true,
    timeoutMs: 8000,
  });
}

export async function editHumanRequestNotification(
  chatId: number,
  messageId: number,
  text: string,
  requestId?: string,
  keepActiveControls = false,
): Promise<boolean> {
  return editTelegramMessage(
    chatId,
    messageId,
    text,
    requestId && keepActiveControls ? activeKeyboard(requestId) : undefined,
  );
}

export function acceptedNotificationText(visitorLabel: string): string {
  return [
    '<b>PIEROT · HUMAN PRESENCE</b>',
    '',
    `Conversation <b>${escapeHtml(visitorLabel)}</b> is active.`,
    'Write here; every message goes to the visitor on merkurov.love.',
    '',
    'Use /end when the conversation is finished.',
  ].join('\n');
}

export function closedNotificationText(visitorLabel: string, by: string): string {
  return [
    '<b>PIEROT · HUMAN PRESENCE</b>',
    '',
    `Conversation <b>${escapeHtml(visitorLabel)}</b> is closed (${escapeHtml(by)}).`,
    'Piero has resumed the AI conversation. You can return to Piero here.',
  ].join('\n');
}

export function declinedNotificationText(visitorLabel: string, by: string): string {
  return [
    '<b>PIEROT · HUMAN PRESENCE</b>',
    '',
    `Conversation <b>${escapeHtml(visitorLabel)}</b> was declined (${escapeHtml(by)}).`,
    'Piero remains in the conversation.',
  ].join('\n');
}

export function expiredNotificationText(visitorLabel: string): string {
  return [
    '<b>PIEROT · HUMAN PRESENCE</b>',
    '',
    `Conversation <b>${escapeHtml(visitorLabel)}</b> expired before it was accepted.`,
    'Piero remains in the conversation.',
  ].join('\n');
}

export async function sendVisitorMessageToOwner(
  input: {
    ownerTelegramId: number;
    visitorLabel: string;
    requestId?: string;
    content: string;
    replyToMessageId?: number | null;
  },
): Promise<TelegramSendResult | null> {
  const ref = input.requestId
    ? ` · <code>${escapeHtml(input.requestId.slice(0, 8))}</code>`
    : '';
  const body = [
    `<b>${escapeHtml(input.visitorLabel)}</b> · visitor${ref}`,
    '',
    escapeHtml(input.content),
  ].join('\n');

  return sendTelegramMessage(input.ownerTelegramId, body, {
    replyToMessageId: input.replyToMessageId ?? undefined,
    disableLinkPreview: true,
    timeoutMs: 8000,
  });
}

export async function sendOwnerConfirmation(
  ownerTelegramId: number,
  text: string,
): Promise<TelegramSendResult | null> {
  return sendTelegramMessage(ownerTelegramId, text, {
    disableLinkPreview: true,
  });
}
