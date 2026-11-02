/**
 * Server-side identity contract for Pierrot attribution.
 *
 * Owner is derived only from an already verified server credential. Visitor is
 * an anonymous first-party pseudonym. A missing or unproven signal is always
 * `unknown`; no route may infer identity from `/admin`, IP, user-agent, message
 * text or a client-provided flag.
 */

import { isPierrotId } from '@/lib/pierrot/conversation';

export type PierrotIdentityType = 'owner' | 'visitor' | 'unknown';

export type PierrotIdentitySource =
  | 'supabase_session'
  | 'bearer_jwt'
  | 'telegram_init_data'
  | 'telegram_owner'
  | 'visitor_local_storage'
  | 'anonymous';

export type PierrotIdentity = {
  type: PierrotIdentityType;
  userId: string | null;
  visitorId: string | null;
  source: PierrotIdentitySource | null;
  verifiedAt: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPierrotUserId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function normalizePierrotVisitorId(value: unknown): string | null {
  return isPierrotId(value) ? value : null;
}

export function resolvePierrotIdentity(input: {
  ownerAuthorized: boolean;
  ownerUserId?: string | null;
  ownerSource?: PierrotIdentitySource | null;
  visitorId?: string | null;
  visitorAllowed: boolean;
  now?: Date;
}): PierrotIdentity {
  if (input.ownerAuthorized) {
    return {
      type: 'owner',
      userId: isPierrotUserId(input.ownerUserId) ? input.ownerUserId : null,
      visitorId: null,
      source: input.ownerSource ?? 'supabase_session',
      verifiedAt: (input.now ?? new Date()).toISOString(),
    };
  }

  const visitorId = input.visitorAllowed ? normalizePierrotVisitorId(input.visitorId) : null;

  if (visitorId) {
    return {
      type: 'visitor',
      userId: null,
      visitorId,
      source: 'visitor_local_storage',
      verifiedAt: null,
    };
  }

  return {
    type: 'unknown',
    userId: null,
    visitorId: null,
    source: 'anonymous',
    verifiedAt: null,
  };
}

export function normalizeStoredIdentityType(value: unknown): PierrotIdentityType {
  return value === 'owner' || value === 'visitor' || value === 'unknown' ? value : 'unknown';
}

/**
 * Missing attribution columns are expected until the migration is applied
 * manually. The application must keep chatting; identity simply stays
 * `unknown` until the schema exists.
 */
export function isMissingIdentityColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';

  if (code !== '42703' && code !== 'PGRST204') return false;

  return /(identity_type|visitor_id|identity_verified_at|identity_source|user_id)/.test(message);
}
