import type { ChatIdentity, NormalizedMessage } from './types';
import { TELEGRAM_RESEARCH_SCHEMA_VERSION } from './types';

export function makeChat(overrides: Partial<ChatIdentity> = {}): ChatIdentity {
  return {
    id: 42,
    type: 'private',
    title: 'Test Contact',
    username: 'test_contact',
    firstName: 'Test',
    lastName: 'Contact',
    source: 'api',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export interface MessageOverrides {
  id: number;
  dateMs: number;
  senderId?: number | null;
  text?: string | null;
  replyToId?: number | null;
  hasMedia?: boolean;
  mediaKind?: string;
  isOutgoing?: boolean;
  isService?: boolean;
  isEdited?: boolean;
  links?: string[];
}

export function makeMessage(overrides: MessageOverrides): NormalizedMessage {
  const text = overrides.text === undefined ? `message ${overrides.id}` : overrides.text;
  const date = new Date(overrides.dateMs).toISOString();
  const senderId = overrides.senderId === undefined ? 42 : overrides.senderId;
  return {
    schemaVersion: TELEGRAM_RESEARCH_SCHEMA_VERSION,
    id: overrides.id,
    chatId: 42,
    date,
    dateUnix: Math.floor(overrides.dateMs / 1000),
    dateMs: overrides.dateMs,
    sender: {
      id: senderId,
      username: senderId === 1 ? 'me' : 'test_contact',
      displayName: senderId === 1 ? 'Me' : 'Test Contact',
      isSelf: senderId === 1,
    },
    text,
    isCaption: false,
    textLength: text === null ? 0 : Array.from(text).length,
    wordCount: text ? text.trim().split(/\s+/u).filter(Boolean).length : 0,
    links: overrides.links ?? [],
    media: overrides.hasMedia ? { kind: overrides.mediaKind ?? 'photo', caption: text } : null,
    hasMedia: overrides.hasMedia === true,
    reply:
      overrides.replyToId === undefined || overrides.replyToId === null
        ? null
        : { toMessageId: overrides.replyToId, threadId: overrides.replyToId },
    forward: null,
    isOutgoing: overrides.isOutgoing ?? senderId === 1,
    isService: overrides.isService === true,
    isEdited: overrides.isEdited === true,
    editDate: overrides.isEdited ? date : null,
    editUnix: overrides.isEdited ? Math.floor(overrides.dateMs / 1000) : null,
    isDeleted: false,
    rawKind: overrides.isService ? 'messageService' : 'message',
    sourcePage: 1,
  };
}

export function rawMessage(
  id: number,
  dateUnix: number,
  text: string | null,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    _: 'message',
    id,
    date: dateUnix,
    message: text,
    peerId: { _: 'peerUser', userId: 42 },
    fromId: { _: 'peerUser', userId: 42 },
    ...extra,
  };
}
