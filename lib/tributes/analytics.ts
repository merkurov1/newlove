import { GA_EVENTS, trackGaEvent } from '@/lib/analytics/ga4';

const CONFIRMED_SESSION_KEY = 'temple:tribute:confirmed-sessions';
const MAX_REMEMBERED_SESSIONS = 25;

function readConfirmedSessions(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.sessionStorage.getItem(CONFIRMED_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Confirmation can be observed more than once (focus, pageshow, manual
 * re-check). Only the first observation per checkout session is reported.
 */
export function markTributeConfirmedOnce(sessionId: string): boolean {
  if (!sessionId || typeof window === 'undefined') return false;

  const seen = readConfirmedSessions();

  if (seen.includes(sessionId)) return false;

  try {
    window.sessionStorage.setItem(
      CONFIRMED_SESSION_KEY,
      JSON.stringify(
        [sessionId, ...seen].slice(0, MAX_REMEMBERED_SESSIONS)
      )
    );
  } catch {
    // Deduplication is best effort; analytics must never break a payment.
  }

  return true;
}

export function clearTributeConfirmedSessionsForTests(): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(CONFIRMED_SESSION_KEY);
  } catch {
    // Ignore.
  }
}

export function trackTributeSupportView(source: string): void {
  trackGaEvent(GA_EVENTS.tributeSupportView, { source });
}

export function trackTributeAmountSelected(
  amount: number,
  preset: boolean
): void {
  if (!Number.isFinite(amount) || amount <= 0) return;

  trackGaEvent(GA_EVENTS.tributeAmountSelected, {
    amount,
    currency: 'usd',
    preset,
  });
}

export function trackTributeCheckoutCreated(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;

  trackGaEvent(GA_EVENTS.tributeCheckoutCreated, {
    amount,
    currency: 'usd',
  });
}

export function trackTributeCheckoutReturned(status: string): void {
  trackGaEvent(GA_EVENTS.tributeCheckoutReturned, {
    status: status.slice(0, 32),
  });
}

export function trackTributePaymentConfirmed(amount: number | null): void {
  trackGaEvent(GA_EVENTS.tributePaymentConfirmed, {
    amount: typeof amount === 'number' && amount > 0 ? amount : undefined,
    currency: 'usd',
  });
}

export function trackTributePaymentFailed(reason: string): void {
  trackGaEvent(GA_EVENTS.tributePaymentFailed, {
    reason: reason.slice(0, 40),
  });
}

export function trackTributePaymentAbandoned(reason: string): void {
  trackGaEvent(GA_EVENTS.tributePaymentAbandoned, {
    reason: reason.slice(0, 40),
  });
}
