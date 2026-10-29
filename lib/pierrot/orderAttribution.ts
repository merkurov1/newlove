/**
 * Safe, opaque attribution between a Pierrot conversation and the existing
 * postcard checkout.
 *
 * The reference is derived from the random conversation id. It carries no PII
 * and is never used for authorisation or to read a conversation: it only lets
 * the existing Stripe metadata and the trusted payment webhook link an order
 * back to the conversation that suggested it.
 */

export const PIERROT_POSTCARD_REF_PARAM = 'pierrot';

const REF_PREFIX = 'pcard_';
const SUBSCRIPTION_REF_PREFIX = 'psub_';
const UNFRAMED_REF_PREFIX = 'punf_';
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const REF_PATTERN = /^pcard_[A-Za-z0-9_-]{8,64}$/;
const SUBSCRIPTION_REF_PATTERN = /^psub_[A-Za-z0-9_-]{8,64}$/;
const UNFRAMED_REF_PATTERN = /^punf_[A-Za-z0-9_-]{8,64}$/;
const MAX_REF_LENGTH = REF_PREFIX.length + 64;

export function createPierrotPostcardRef(conversationId: unknown): string | null {
  if (typeof conversationId !== 'string' || !ID_PATTERN.test(conversationId)) {
    return null;
  }

  return `${REF_PREFIX}${conversationId}`;
}

export function normalizePierrotPostcardRef(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (trimmed.length > MAX_REF_LENGTH || !REF_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function pierrotConversationIdFromRef(value: unknown): string | null {
  const ref = normalizePierrotPostcardRef(value);

  return ref ? ref.slice(REF_PREFIX.length) : null;
}

export function createPierrotSubscriptionRef(conversationId: unknown): string | null {
  if (typeof conversationId !== 'string' || !ID_PATTERN.test(conversationId)) {
    return null;
  }

  return `${SUBSCRIPTION_REF_PREFIX}${conversationId}`;
}

export function normalizePierrotSubscriptionRef(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (trimmed.length > MAX_REF_LENGTH || !SUBSCRIPTION_REF_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function pierrotConversationIdFromSubscriptionRef(value: unknown): string | null {
  const ref = normalizePierrotSubscriptionRef(value);

  return ref ? ref.slice(SUBSCRIPTION_REF_PREFIX.length) : null;
}

export function createPierrotUnframedRef(conversationId: unknown): string | null {
  if (typeof conversationId !== 'string' || !ID_PATTERN.test(conversationId)) {
    return null;
  }

  return `${UNFRAMED_REF_PREFIX}${conversationId}`;
}

export function normalizePierrotUnframedRef(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (trimmed.length > MAX_REF_LENGTH || !UNFRAMED_REF_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function pierrotConversationIdFromUnframedRef(value: unknown): string | null {
  const ref = normalizePierrotUnframedRef(value);

  return ref ? ref.slice(UNFRAMED_REF_PREFIX.length) : null;
}

export function appendPierrotSubscriptionAttribution(href: string, ref: unknown): string {
  const normalizedRef = normalizePierrotSubscriptionRef(ref);

  if (!normalizedRef) return href;

  if (!href.startsWith('/') || href.startsWith('//')) return href;

  const hashIndex = href.indexOf('#');
  const base = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
  const separator = base.includes('?') ? '&' : '?';

  return `${base}${separator}${PIERROT_POSTCARD_REF_PARAM}=${encodeURIComponent(
    normalizedRef
  )}${hash}`;
}

/**
 * Adds the attribution reference to an already verified internal CTA. Query
 * parameters are never accepted from the model or the browser as a route.
 */
export function appendPierrotPostcardAttribution(href: string, ref: unknown): string {
  const normalizedRef = normalizePierrotPostcardRef(ref);

  if (!normalizedRef) return href;

  if (!href.startsWith('/') || href.startsWith('//')) return href;

  const hashIndex = href.indexOf('#');
  const base = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
  const separator = base.includes('?') ? '&' : '?';

  return `${base}${separator}${PIERROT_POSTCARD_REF_PARAM}=${encodeURIComponent(
    normalizedRef
  )}${hash}`;
}

export function readPierrotPostcardAttribution(search: string | null | undefined): string | null {
  if (!search) return null;

  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

    return normalizePierrotPostcardRef(params.get(PIERROT_POSTCARD_REF_PARAM));
  } catch {
    return null;
  }
}

export function appendPierrotUnframedAttribution(href: string, ref: unknown): string {
  const normalizedRef = normalizePierrotUnframedRef(ref);

  if (!normalizedRef) return href;

  if (!href.startsWith('/') || href.startsWith('//')) return href;

  const hashIndex = href.indexOf('#');
  const base = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex);
  const separator = base.includes('?') ? '&' : '?';

  return `${base}${separator}${PIERROT_POSTCARD_REF_PARAM}=${encodeURIComponent(
    normalizedRef
  )}${hash}`;
}
