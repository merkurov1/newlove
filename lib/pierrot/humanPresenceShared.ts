/**
 * Shared, side-effect-free contracts for PIERO HUMAN PRESENCE.
 *
 * This module is imported by both browser components and server routes. It
 * must never contain secrets, Node-only imports or database access.
 */

export const HUMAN_REQUEST_STATUSES = [
  'pending',
  'active',
  'closed',
  'declined',
  'expired',
] as const;

export type HumanRequestStatus = (typeof HUMAN_REQUEST_STATUSES)[number];

export const HUMAN_REQUEST_TTL_MINUTES = 20;
export const HUMAN_REQUEST_TTL_SECONDS = HUMAN_REQUEST_TTL_MINUTES * 60;
export const HUMAN_MAX_MESSAGE_LENGTH = 4000;
export const HUMAN_MAX_MESSAGES_PER_STATE = 100;

export type HumanLanguage = 'ru' | 'en' | 'und';

export type HumanPresencePublicState = {
  requestId: string;
  status: HumanRequestStatus;
  visitorLabel: string;
  startPage: string;
  language: HumanLanguage;
  createdAt: string | null;
  expiresAt: string | null;
  acceptedAt: string | null;
  closedAt: string | null;
  resolvedBy: 'owner' | 'visitor' | 'system' | null;
};

export type HumanPresenceSessionState = {
  id: string;
  status: 'active' | 'closed';
  openedAt: string | null;
  closedAt: string | null;
};

export type HumanPresenceMessage = {
  id: string;
  role: 'user' | 'human';
  content: string;
  createdAt: string | null;
  sequence: number;
};

export type HumanPresenceStateResponse = {
  request: HumanPresencePublicState | null;
  session: HumanPresenceSessionState | null;
  conversationId: string | null;
  sessionId: string | null;
  messages: HumanPresenceMessage[];
  serverTime: string;
};

export type HumanPresenceMessageResponse = {
  request: HumanPresencePublicState;
  session: HumanPresenceSessionState | null;
  message: {
    id: string;
    createdAt: string | null;
    sequence: number;
  };
  delivery: 'sent' | 'failed';
};

export function isHumanRequestStatus(value: unknown): value is HumanRequestStatus {
  return (
    typeof value === 'string' &&
    (HUMAN_REQUEST_STATUSES as readonly string[]).includes(value)
  );
}

export function isHumanAccessToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function isHumanMessageId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

export function humanLanguageFromDetected(
  value: string | null | undefined,
): Exclude<HumanLanguage, 'und'> {
  return value === 'en' ? 'en' : 'ru';
}

export type HumanCopy = {
  pending: string;
  pendingRepeated: string;
  unavailable: string;
  here: string;
  waiting: string;
  cancel: string;
  cancelled: string;
  declined: string;
  expired: string;
  closed: string;
  ended: string;
  sendFailed: string;
  sessionLost: string;
  composerPlaceholder: string;
  activeLabel: string;
  pendingLabel: string;
};

const COPY: Record<'ru' | 'en', HumanCopy> = {
  ru: {
    pending: 'Разумеется. Попробуем его найти.',
    pendingRepeated: 'Я уже ищу Антона. Он получил сигнал.',
    unavailable: 'Антон сейчас недоступен. Пьеро остаётся рядом.',
    here: 'Антон здесь.',
    waiting: 'Пьеро ищет Антона…',
    cancel: 'Отменить',
    cancelled: 'Запрос отменён. Пьеро снова рядом.',
    declined: 'Антон сейчас не может ответить. Пьеро продолжит разговор.',
    expired: 'Антон не ответил вовремя. Пьеро снова рядом.',
    closed: 'Антон завершил разговор. Пьеро снова рядом.',
    ended: 'Разговор завершён.',
    sendFailed: 'Сообщение не доставлено. Попробуйте ещё раз.',
    sessionLost: 'Связь с разговором потеряна. Пьеро снова рядом.',
    composerPlaceholder: 'Написать Антону…',
    activeLabel: 'Разговор с Антоном',
    pendingLabel: 'Ожидание Антона',
  },
  en: {
    pending: 'Of course. Let us try to find him.',
    pendingRepeated: 'I am already looking for Anton. He has the signal.',
    unavailable: 'Anton is unavailable right now. Pierrot remains here.',
    here: 'Anton is here.',
    waiting: 'Pierrot is looking for Anton…',
    cancel: 'Cancel',
    cancelled: 'Request cancelled. Pierrot is back.',
    declined: 'Anton cannot answer right now. Pierrot will continue.',
    expired: 'Anton did not answer in time. Pierrot is back.',
    closed: 'Anton has ended the conversation. Pierrot is back.',
    ended: 'Conversation ended.',
    sendFailed: 'The message was not delivered. Please try again.',
    sessionLost: 'The conversation connection was lost. Pierrot is back.',
    composerPlaceholder: 'Write to Anton…',
    activeLabel: 'Conversation with Anton',
    pendingLabel: 'Waiting for Anton',
  },
};

export function getHumanCopy(language: 'ru' | 'en'): HumanCopy {
  return COPY[language];
}
