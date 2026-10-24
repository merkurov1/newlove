import type {
  ForwardMetadata,
  MediaMetadata,
  NormalizedMessage,
  ReplyMetadata,
  SenderInfo,
} from './types';
import { TELEGRAM_RESEARCH_SCHEMA_VERSION } from './types';
import { asArray, asNumber, asRecord, asString, isoTimestamp, unixSeconds } from './util';

export interface NormalizeContext {
  chatId: number;
  chatType: string;
  selfId: number | null;
  page: number | null;
}

export interface NormalizedPage {
  messages: NormalizedMessage[];
  emptyRecords: number;
  skippedRecords: number;
  unsupportedKinds: Record<string, number>;
  minMessageId: number | null;
  maxMessageId: number | null;
}

interface UserLookup {
  byId: Map<number, { username: string | null; displayName: string | null }>;
}

export function messageKey(message: Pick<NormalizedMessage, 'chatId' | 'id'>): string {
  return `${message.chatId}:${message.id}`;
}

/** Marked peer ID, matching telegram-sync-cli's cache convention. */
export function peerToMarkedId(peer: unknown): number | null {
  const record = asRecord(peer);
  if (!record) return null;

  switch (record._) {
    case 'peerUser':
      return asNumber(record.userId);
    case 'peerChat': {
      const id = asNumber(record.chatId);
      return id === null ? null : -id;
    }
    case 'peerChannel':
    case 'peerCommunity': {
      const id = asNumber(record.channelId);
      return id === null ? null : -(1_000_000_000_000 + id);
    }
    default: {
      const user = asNumber(record.userId);
      if (user !== null) return user;
      const channel = asNumber(record.channelId);
      if (channel !== null) return -(1_000_000_000_000 + channel);
      return null;
    }
  }
}

export function buildUserLookup(users: unknown[], chats: unknown[] = []): UserLookup {
  const byId = new Map<number, { username: string | null; displayName: string | null }>();
  for (const raw of users) {
    const user = asRecord(raw);
    const id = asNumber(user?.id);
    if (id === null) continue;
    const firstName = asString(user?.firstName);
    const lastName = asString(user?.lastName);
    byId.set(id, {
      username: asString(user?.username),
      displayName: [firstName, lastName].filter(Boolean).join(' ').trim() || null,
    });
  }
  for (const raw of chats) {
    const chat = asRecord(raw);
    const id = asNumber(chat?.id);
    if (id === null) continue;
    const kind = asString(chat?._);
    const marked =
      kind === 'chat'
        ? -id
        : kind === 'channel' || kind === 'channelForbidden' || kind === 'community'
          ? -(1_000_000_000_000 + id)
          : null;
    if (marked === null) continue;
    byId.set(marked, {
      username: asString(chat?.username),
      displayName: asString(chat?.title),
    });
  }
  return { byId };
}

function senderInfo(
  message: Record<string, unknown>,
  lookup: UserLookup,
  context: NormalizeContext
): SenderInfo {
  const fromId = peerToMarkedId(message.fromId);
  const outgoing = message.out === true;

  let id = fromId;
  if (id === null) {
    if (context.chatType === 'private' && outgoing && context.selfId !== null) {
      id = context.selfId;
    } else {
      id = context.chatId;
    }
  }

  const user = id === null ? null : (lookup.byId.get(id) ?? null);
  return {
    id,
    username: user?.username ?? null,
    displayName: user?.displayName ?? null,
    isSelf: context.selfId !== null ? id !== null && id === context.selfId : outgoing,
  };
}

export function normalizeMessage(
  raw: unknown,
  lookup: UserLookup,
  context: NormalizeContext
): NormalizedMessage | null {
  const message = asRecord(raw);
  if (!message) return null;

  const kind = asString(message._) ?? 'unknown';
  if (kind === 'messageEmpty') return null;

  const id = asNumber(message.id);
  const dateUnix = unixSeconds(asNumber(message.date));
  if (id === null || id <= 0 || dateUnix === null) return null;

  const text = asString(message.message);
  const media = extractMedia(message.media, text);
  const isService = kind === 'messageService';
  const sender = senderInfo(message, lookup, context);
  const links = extractLinks(text, message.entities);
  const reply = extractReply(message.replyTo);
  const forward = extractForward(message.fwdFrom, lookup);
  const editUnix = unixSeconds(asNumber(message.editDate));

  return {
    schemaVersion: TELEGRAM_RESEARCH_SCHEMA_VERSION,
    id,
    chatId: context.chatId,
    date: new Date(dateUnix * 1000).toISOString(),
    dateUnix,
    dateMs: dateUnix * 1000,
    sender,
    text,
    isCaption: Boolean(media && text !== null && text.length > 0),
    textLength: text === null ? 0 : Array.from(text).length,
    wordCount: countWords(text),
    links,
    media,
    hasMedia: media !== null,
    reply,
    forward,
    isOutgoing: message.out === true,
    isService,
    isEdited: editUnix !== null && message.editDate !== undefined,
    editDate: isoTimestamp(editUnix),
    editUnix,
    isDeleted: message.isDeleted === true || message.deleted === true,
    rawKind: kind,
    sourcePage: context.page,
  };
}

export function normalizeHistoryPage(
  response: { messages: unknown[]; users?: unknown[]; chats?: unknown[] },
  context: NormalizeContext
): NormalizedPage {
  const lookup = buildUserLookup(response.users ?? [], response.chats ?? []);
  const messages: NormalizedMessage[] = [];
  const unsupportedKinds: Record<string, number> = {};
  let emptyRecords = 0;
  let skippedRecords = 0;
  let minMessageId: number | null = null;
  let maxMessageId: number | null = null;

  for (const raw of response.messages) {
    const record = asRecord(raw);
    const kind = asString(record?._) ?? 'unknown';
    if (kind === 'messageEmpty') {
      emptyRecords += 1;
      const id = asNumber(record?.id);
      if (id !== null && id > 0) {
        minMessageId = minMessageId === null ? id : Math.min(minMessageId, id);
        maxMessageId = maxMessageId === null ? id : Math.max(maxMessageId, id);
      }
      continue;
    }

    const normalized = normalizeMessage(raw, lookup, context);
    if (!normalized) {
      skippedRecords += 1;
      continue;
    }

    if (!['message', 'messageService', 'messageEmpty'].includes(kind)) {
      unsupportedKinds[kind] = (unsupportedKinds[kind] ?? 0) + 1;
    }

    messages.push(normalized);
    minMessageId = minMessageId === null ? normalized.id : Math.min(minMessageId, normalized.id);
    maxMessageId = maxMessageId === null ? normalized.id : Math.max(maxMessageId, normalized.id);
  }

  return { messages, emptyRecords, skippedRecords, unsupportedKinds, minMessageId, maxMessageId };
}

export function mergeMessages(
  target: Map<string, NormalizedMessage>,
  messages: NormalizedMessage[]
): number {
  let duplicates = 0;
  for (const message of messages) {
    const key = messageKey(message);
    if (target.has(key)) duplicates += 1;
    target.set(key, message);
  }
  return duplicates;
}

export function sortMessages(messages: Iterable<NormalizedMessage>): NormalizedMessage[] {
  return [...messages].sort((a, b) => {
    if (a.dateMs === b.dateMs) return a.id - b.id;
    return a.dateMs - b.dateMs;
  });
}

export function toJsonLines(messages: NormalizedMessage[]): string {
  return (
    messages.map((message) => JSON.stringify(message)).join('\n') + (messages.length ? '\n' : '')
  );
}

export function parseJsonLines(value: string): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];
  for (const line of value.split('\n')) {
    if (!line.trim()) continue;
    messages.push(JSON.parse(line) as NormalizedMessage);
  }
  return messages;
}

function countWords(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function extractReply(value: unknown): ReplyMetadata | null {
  const reply = asRecord(value);
  if (!reply) return null;

  const toMessageId = asNumber(reply.replyToMsgId);
  const threadId = asNumber(reply.replyToTopId) ?? toMessageId;
  const quote = asString(reply.quoteText);
  if (toMessageId === null && threadId === null && quote === null) return null;

  return { toMessageId, threadId, quote };
}

function extractForward(value: unknown, lookup: UserLookup): ForwardMetadata | null {
  const forward = asRecord(value);
  if (!forward) return null;

  const fromId = peerToMarkedId(forward.fromId);
  const user = fromId === null ? null : (lookup.byId.get(fromId) ?? null);
  const savedFromId = peerToMarkedId(forward.savedFromPeer);
  const dateUnix = unixSeconds(asNumber(forward.date));

  return {
    fromId,
    fromName: asString(forward.fromName) ?? user?.displayName ?? null,
    fromUsername: user?.username ?? null,
    date: isoTimestamp(dateUnix),
    channelPostId: asNumber(forward.channelPost),
    postAuthor: asString(forward.postAuthor),
    savedFromId,
    savedFromMessageId: asNumber(forward.savedFromMsgId),
  };
}

function extractMedia(value: unknown, caption: string | null): MediaMetadata | null {
  const media = asRecord(value);
  if (!media) return null;

  const kind = asString(media._) ?? 'unknown';
  const result: MediaMetadata = { kind, caption };

  const photo = asRecord(media.photo);
  const photoId = asNumber(photo?.id);
  if (photoId !== null) result.photoId = String(photoId);

  const document = asRecord(media.document);
  if (document) {
    const documentId = asNumber(document.id);
    if (documentId !== null) result.documentId = String(documentId);
    const mimeType = asString(document.mimeType);
    if (mimeType) result.mimeType = mimeType;
    const size = asNumber(document.size);
    if (size !== null) result.sizeBytes = size;

    for (const attributeRaw of asArray(document.attributes)) {
      const attribute = asRecord(attributeRaw);
      const attributeKind = asString(attribute?._);
      if (attributeKind === 'documentAttributeFilename') {
        const fileName = asString(attribute?.fileName);
        if (fileName) result.fileName = fileName;
      }
      if (attributeKind === 'documentAttributeVideo') {
        const width = asNumber(attribute?.w);
        const height = asNumber(attribute?.h);
        const duration = asNumber(attribute?.duration);
        if (width !== null) result.width = width;
        if (height !== null) result.height = height;
        if (duration !== null) result.durationSeconds = duration;
        if (attribute?.roundMessage === true) result.round = true;
      }
      if (attributeKind === 'documentAttributeAudio') {
        const duration = asNumber(attribute?.duration);
        if (duration !== null) result.durationSeconds = duration;
        if (attribute?.voice === true) result.voice = true;
      }
      if (attributeKind === 'documentAttributeImageSize') {
        const width = asNumber(attribute?.w);
        const height = asNumber(attribute?.h);
        if (width !== null) result.width = width;
        if (height !== null) result.height = height;
      }
    }
  }

  const webpage = asRecord(media.webpage);
  if (webpage) {
    result.webpage = {
      url: asString(webpage.url) ?? undefined,
      displayUrl: asString(webpage.displayUrl) ?? undefined,
      title: asString(webpage.title) ?? undefined,
      description: asString(webpage.description) ?? undefined,
      siteName: asString(webpage.siteName) ?? undefined,
      type: asString(webpage.type) ?? undefined,
    };
  }

  const poll = asRecord(media.poll);
  if (poll) {
    result.poll = {
      id: asNumber(poll.id) === null ? undefined : String(asNumber(poll.id)),
      question: asString(poll.question) ?? undefined,
      closed: poll.closed === true,
      multipleChoice: poll.multipleChoice === true,
      quiz: poll.quiz === true,
    };
  }

  const geo = asRecord(media.geo);
  if (geo) {
    result.geo = {
      latitude: asNumber(geo.lat) ?? undefined,
      longitude: asNumber(geo.long) ?? undefined,
      accuracyRadius: asNumber(geo.accuracyRadius) ?? undefined,
    };
  }

  if (kind === 'messageMediaSticker' || kind === 'messageMediaDice') {
    result.sticker = {
      emoji: asString(media.emoticon) ?? asString(media.emoticon) ?? undefined,
      setName: asString(asRecord(media.stickerSet)?.shortName) ?? undefined,
    };
  }

  return result;
}

/** Extract URLs from plain text and Telegram text entities, de-duplicated. */
export function extractLinks(text: string | null, entities: unknown): string[] {
  const links = new Set<string>();

  if (text) {
    const regex = /https?:\/\/[^\s<>"')\]]+/giu;
    for (const match of text.matchAll(regex)) {
      const value = trimTrailingPunctuation(match[0]);
      if (value) links.add(value);
    }
  }

  for (const raw of asArray(entities)) {
    const entity = asRecord(raw);
    if (!entity) continue;
    const kind = asString(entity._);
    if (kind === 'messageEntityTextUrl') {
      const url = asString(entity.url);
      if (url) links.add(url);
    }
    if (kind === 'messageEntityUrl' && text) {
      const offset = asNumber(entity.offset);
      const length = asNumber(entity.length);
      if (offset !== null && length !== null) {
        const value = trimTrailingPunctuation(text.slice(offset, offset + length));
        if (value) links.add(value);
      }
    }
  }

  return [...links];
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?]+$/u, '');
}
