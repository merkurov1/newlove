/**
 * Shared, side-effect-free contracts for server-side Pierrot conversation
 * storage. This module is imported by both the API routes and the browser
 * telemetry helper, so it must not contain secrets or Node-only imports.
 */

import { isPierrotSectionId } from '@/lib/pierrot/navigation';
import {
  getVerifiedOfferCta,
  isPierrotOfferId,
  isVerifiedPierrotInternalDestination,
} from '@/lib/pierrot/offers';

export const PIERROT_MAX_MESSAGE_LENGTH = 4000;
export const PIERROT_MAX_HISTORY_ITEMS = 24;
export const PIERROT_MAX_HISTORY_CHARS = 16000;
export const PIERROT_MAX_HISTORY_ITEM_CHARS = 4000;
export const PIERROT_RETENTION_DAYS = 90;
export const PIERROT_CONSENT_VERSION = '2026-10-29';

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const EVENT_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;

export type PierrotConsentState = 'pending' | 'granted' | 'denied';

export type PierrotConsent = {
  state: PierrotConsentState;
  version: string | null;
};

export const PIERROT_CLIENT_EVENTS = [
  'navigation_proposed',
  'navigation_completed',
  'action_clicked',
  'offer_action_clicked',
  'offer_viewed',
  'answer_feedback',
  'subscribe_cta_clicked',
  'conversation_ended',
] as const;

export const PIERROT_SERVER_EVENTS = [
  'conversation_started',
  'message_sent',
  'assistant_replied',
  'assistant_failed',
  'intent_classified',
  'brain_retrieval',
  'answer_corrected',
  'interest_detected',
  'offer_eligible',
  'offer_selected',
  'offer_shown',
  'cta_shown',
  'commercial_declined',
  'commercial_returned',
  'order_paid',
  'purchase_completed',
  'checkout_started',
  'service_inquiry_started',
  'service_need_selected',
  'service_inquiry_qualified',
  'service_contact_consent',
  'service_inquiry_submitted',
  'service_inquiry_received',
  'unframed_request_submitted',
  'unframed_purchase_confirmed',
  'human_requested',
  'human_request_duplicate',
  'human_accepted',
  'human_declined',
  'human_expired',
  'human_closed',
  'human_message_sent',
  'human_message_received',
  'human_notification_failed',
  'human_ai_blocked',
] as const;

export const PIERROT_EVENT_NAMES = [...PIERROT_CLIENT_EVENTS, ...PIERROT_SERVER_EVENTS] as const;

export type PierrotClientEventName = (typeof PIERROT_CLIENT_EVENTS)[number];
export type PierrotServerEventName = (typeof PIERROT_SERVER_EVENTS)[number];
export type PierrotEventName = (typeof PIERROT_EVENT_NAMES)[number];

export function isPierrotId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function isPierrotClientEventName(value: unknown): value is PierrotClientEventName {
  return typeof value === 'string' && (PIERROT_CLIENT_EVENTS as readonly string[]).includes(value);
}

export function isPierrotEventName(value: unknown): value is PierrotEventName {
  return typeof value === 'string' && (PIERROT_EVENT_NAMES as readonly string[]).includes(value);
}

export function normalizePierrotEventKey(value: unknown): string | null {
  return typeof value === 'string' && EVENT_KEY_PATTERN.test(value) ? value : null;
}

/**
 * Conversation start pages are routes, never full URLs. Query strings, hashes
 * and protocol-relative values are deliberately discarded.
 */
export function sanitizePierrotPathname(value: unknown): string {
  if (typeof value !== 'string') return '/';

  const trimmed = value.trim();

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';

  const withoutQuery = trimmed.split(/[?#]/, 1)[0];
  const normalized = withoutQuery.replace(/\/{2,}/g, '/').slice(0, 200);

  return normalized.startsWith('/') ? normalized || '/' : '/';
}

/**
 * Referrers can contain search terms and other personal data in their query
 * string. Keep only the origin and path, and only for http(s) URLs.
 */
export function sanitizePierrotReferrer(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    return null;
  }
}

/**
 * A deliberately small language heuristic. It is not used for authorisation
 * or routing; it only keeps a useful conversation-level language field.
 */
export function detectPierrotLanguage(text: string): 'ru' | 'en' | 'und' {
  const cyrillic = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;

  if (cyrillic === 0 && latin === 0) return 'und';
  if (cyrillic > latin) return 'ru';
  if (latin > cyrillic) return 'en';
  return 'und';
}

export function normalizePierrotConsent(value: unknown): PierrotConsent | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Record<string, unknown>;

  if (
    candidate.state !== 'pending' &&
    candidate.state !== 'granted' &&
    candidate.state !== 'denied'
  ) {
    return null;
  }

  const version =
    typeof candidate.version === 'string' && candidate.version.length <= 32
      ? candidate.version
      : null;

  return { state: candidate.state, version };
}

function positiveInteger(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

/**
 * Only event-specific, non-content metadata is accepted. In particular,
 * prompt text, message text, prices, statuses and outcomes can never be
 * supplied by the browser through this path.
 */
export function sanitizePierrotEventPayload(
  eventName: PierrotClientEventName,
  value: unknown
): Record<string, unknown> | null {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  switch (eventName) {
    case 'navigation_proposed':
    case 'navigation_completed': {
      if (!isPierrotSectionId(payload.section_id)) return null;

      return { section_id: payload.section_id };
    }

    case 'action_clicked': {
      if (payload.action_kind !== 'navigate' && payload.action_kind !== 'prompt') return null;

      const result: Record<string, unknown> = { action_kind: payload.action_kind };

      if (isPierrotSectionId(payload.section_id)) {
        result.section_id = payload.section_id;
      }

      const labelLength = positiveInteger(payload.label_length, 200);
      if (labelLength !== null) result.label_length = labelLength;

      return result;
    }

    case 'offer_action_clicked': {
      if (!isPierrotOfferId(payload.offer_id)) return null;

      const cta = getVerifiedOfferCta(payload.offer_id);

      if (!cta) return null;

      if (
        (payload.cta_kind !== 'internal' && payload.cta_kind !== 'external') ||
        payload.destination !== cta.href
      ) {
        return null;
      }

      if (cta.kind === 'internal' && !isVerifiedPierrotInternalDestination(payload.destination)) {
        return null;
      }

      return {
        offer_id: payload.offer_id,
        cta_kind: payload.cta_kind,
        destination: payload.destination,
      };
    }

    case 'offer_viewed': {
      if (!isPierrotOfferId(payload.offer_id)) return null;

      return { offer_id: payload.offer_id };
    }

    case 'answer_feedback': {
      if (payload.rating !== 'up' && payload.rating !== 'down') return null;

      const result: Record<string, unknown> = { rating: payload.rating };

      if (
        typeof payload.message_id === 'string' &&
        /^[A-Za-z0-9_-]{8,64}$/.test(payload.message_id)
      ) {
        result.message_id = payload.message_id;
      }

      return result;
    }

    case 'subscribe_cta_clicked': {
      if (payload.offer_id !== 'journal_flow') return null;

      return { offer_id: 'journal_flow' };
    }

    case 'conversation_ended': {
      const reasons = ['new_chat', 'user_closed', 'page_hidden'] as const;
      const reason =
        typeof payload.reason === 'string' &&
        (reasons as readonly string[]).includes(payload.reason)
          ? payload.reason
          : 'user_closed';

      return { reason };
    }

    default:
      return null;
  }
}
