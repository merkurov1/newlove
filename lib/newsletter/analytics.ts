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
  /** confirmed / (confirmed + pending), or null when there is no cohort. */
  confirmationRate: number | null;
  deliveryFailures: number;
  suspectedAutomated: number;
  rateLimited: number;
  blockedReasons: Record<string, number>;
  signupSpike: NewsletterSignupSpike;
};

export type NewsletterSignupSpike = {
  detected: boolean;
  windowHours: number;
  latestHourCount: number;
  baselineHourlyAverage: number;
  threshold: number;
  minCount: number;
};

const BOT_REASONS = new Set([
  'honeypot',
  'timing_missing',
  'timing_too_fast',
  'timing_expired',
  'turnstile_missing',
  'turnstile_invalid',
  'turnstile_expired',
  'turnstile_not_configured',
]);

const RATE_LIMIT_REASONS = new Set(['rate_limited_ip', 'rate_limited_email']);

const DELIVERY_FAILURE_REASONS = new Set(['email_send', 'email_not_configured']);

function eventReason(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const reason = (payload as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason.slice(0, 80) : null;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Detect an unusual burst of public signup submissions. It only uses
 * `subscription_submitted` timestamps and aggregate counts; no email, IP or
 * payload content is inspected.
 */
export function detectNewsletterSignupSpike(
  events: NewsletterEventMetricRow[],
  options: { now?: Date; windowHours?: number; minCount?: number; multiplier?: number } = {}
): NewsletterSignupSpike {
  const windowHours = Math.max(1, Math.min(options.windowHours ?? 24, 24 * 14));
  const minCount = Math.max(1, options.minCount ?? 10);
  const multiplier = Math.max(1, options.multiplier ?? 3);
  const now = options.now ?? new Date();
  const latestHour = Math.floor(now.getTime() / HOUR_MS);

  const buckets = new Map<number, number>();

  for (const event of events) {
    if (event.event_name !== 'subscription_submitted') continue;
    if (!event.created_at) continue;

    const timestamp = new Date(event.created_at).getTime();
    if (!Number.isFinite(timestamp)) continue;

    const hour = Math.floor(timestamp / HOUR_MS);
    if (hour < latestHour - windowHours + 1 || hour > latestHour) continue;

    buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
  }

  const latestHourCount = buckets.get(latestHour) ?? 0;
  const baselineHours = windowHours - 1;
  const baselineTotal = Array.from(buckets.entries())
    .filter(([hour]) => hour !== latestHour)
    .reduce((sum, [, count]) => sum + count, 0);
  const baselineHourlyAverage = baselineHours > 0 ? baselineTotal / baselineHours : 0;
  const threshold = Math.max(minCount, baselineHourlyAverage * multiplier);

  return {
    detected: latestHourCount >= minCount && latestHourCount >= threshold,
    windowHours,
    latestHourCount,
    baselineHourlyAverage,
    threshold,
    minCount,
  };
}

/**
 * Classify newsletter lifecycle data without touching subscriber records.
 * Bot suspicion is derived only from server-side challenge failures, never
 * from email formatting, mail domain or confirmation speed.
 */
export function classifyNewsletterAudience(
  subscribers: NewsletterSubscriberMetricRow[],
  events: NewsletterEventMetricRow[] = [],
  now: Date = new Date()
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
    confirmationRate:
      confirmedRows.length + pendingRows.length > 0
        ? confirmedRows.length / (confirmedRows.length + pendingRows.length)
        : null,
    deliveryFailures: deliveryFailureKeys.size,
    suspectedAutomated,
    rateLimited,
    blockedReasons,
    signupSpike: detectNewsletterSignupSpike(events, { now }),
  };
}
