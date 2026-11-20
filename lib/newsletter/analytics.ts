export type NewsletterSubscriberMetricRow = {
  isActive: boolean | null;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
};

export type NewsletterEventMetricRow = {
  event_name: string | null;
  event_key?: string | null;
  subscriber_id?: string | null;
  payload?: unknown;
  created_at?: string | null;
};

export type NewsletterAudienceMetrics = {
  total: number;
  /** Only double-opt-in confirmed records count as audience. */
  confirmed: number;
  active: number;
  pending: number;
  unsubscribed: number;
  deliveryFailures: number;
  suspectedAutomated: number;
  rateLimited: number;
  blockedReasons: Record<string, number>;
};

const BOT_REASONS = new Set([
  'honeypot',
  'timing_missing',
  'timing_too_fast',
  'timing_expired',
  'turnstile_missing',
  'turnstile_invalid',
  'turnstile_expired',
]);

const RATE_LIMIT_REASONS = new Set(['rate_limited_ip', 'rate_limited_email']);

const DELIVERY_FAILURE_REASONS = new Set(['email_send', 'email_not_configured']);

function eventReason(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const reason = (payload as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason.slice(0, 80) : null;
}

/**
 * Classify newsletter lifecycle data without touching subscriber records.
 * Bot suspicion is derived only from server-side challenge failures, never
 * from email formatting, mail domain or confirmation speed.
 */
export function classifyNewsletterAudience(
  subscribers: NewsletterSubscriberMetricRow[],
  events: NewsletterEventMetricRow[] = []
): NewsletterAudienceMetrics {
  const confirmedRows = subscribers.filter(
    (row) => row.isActive === true && Boolean(row.confirmedAt)
  );
  const unsubscribedRows = subscribers.filter((row) => Boolean(row.unsubscribedAt));
  const pendingRows = subscribers.filter(
    (row) => row.isActive !== true && !row.confirmedAt && !row.unsubscribedAt
  );

  const deliveryFailureKeys = new Set<string>();
  const blockedReasons: Record<string, number> = {};
  let suspectedAutomated = 0;
  let rateLimited = 0;

  events.forEach((event, index) => {
    if (event.event_name !== 'subscription_failed') return;

    const reason = eventReason(event.payload);
    if (!reason) return;

    if (DELIVERY_FAILURE_REASONS.has(reason)) {
      deliveryFailureKeys.add(
        event.subscriber_id ? `subscriber:${event.subscriber_id}` : `event:${event.event_key || index}`
      );
      return;
    }

    if (BOT_REASONS.has(reason)) {
      suspectedAutomated += 1;
      blockedReasons[reason] = (blockedReasons[reason] ?? 0) + 1;
      return;
    }

    if (RATE_LIMIT_REASONS.has(reason)) {
      rateLimited += 1;
      blockedReasons[reason] = (blockedReasons[reason] ?? 0) + 1;
    }
  });

  return {
    total: subscribers.length,
    confirmed: confirmedRows.length,
    active: confirmedRows.length,
    pending: pendingRows.length,
    unsubscribed: unsubscribedRows.length,
    deliveryFailures: deliveryFailureKeys.size,
    suspectedAutomated,
    rateLimited,
    blockedReasons,
  };
}
