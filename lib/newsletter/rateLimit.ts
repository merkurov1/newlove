import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/newsletter/rateLimit');

import { NextResponse } from 'next/server';
import { checkPierrotRateLimit } from '@/lib/pierrot/rateLimit';

export type NewsletterRateLimitConfig = {
  intervalMs: number;
  maxRequests: number;
  keyPrefix: string;
};

export type NewsletterRateLimitDecision =
  | { allowed: true }
  | { allowed: false; layer: 'ip' | 'email'; retryAfter: number; maxRequests: number };

/**
 * Layered signup limits. The IP window is deliberately generous because
 * offices, universities, mobile carriers and corporate mail scanners share
 * addresses; the email window is the tighter anti-bulk signal.
 */
export const NEWSLETTER_IP_LIMIT: NewsletterRateLimitConfig = {
  intervalMs: 15 * 60 * 1000,
  maxRequests: 40,
  keyPrefix: 'newsletter-ip',
};

export const NEWSLETTER_EMAIL_LIMIT: NewsletterRateLimitConfig = {
  intervalMs: 60 * 60 * 1000,
  maxRequests: 5,
  keyPrefix: 'newsletter-email',
};

export const NEWSLETTER_EMAIL_DAILY_LIMIT: NewsletterRateLimitConfig = {
  intervalMs: 24 * 60 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'newsletter-email-day',
};

export const NEWSLETTER_CONFIRM_IP_LIMIT: NewsletterRateLimitConfig = {
  intervalMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'newsletter-confirm-ip',
};

async function evaluate(
  identifier: string,
  config: NewsletterRateLimitConfig
): Promise<{ allowed: true } | { allowed: false; retryAfter: number }> {
  const response = await checkPierrotRateLimit({
    identifier,
    intervalMs: config.intervalMs,
    maxRequests: config.maxRequests,
    keyPrefix: config.keyPrefix,
  });

  if (!response) return { allowed: true };

  const retryAfter = Number(response.headers.get('Retry-After') || 0);

  return {
    allowed: false,
    retryAfter:
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : Math.ceil(config.intervalMs / 1000),
  };
}

/**
 * Durable, cross-instance limits for the public newsletter endpoints.
 * Identifiers are hashed by the shared Pierrot limiter before persistence;
 * raw IPs and raw email addresses are never stored in rate-limit rows.
 */
export async function checkNewsletterRateLimit(input: {
  ip: string;
  email?: string | null;
  ipLimit?: NewsletterRateLimitConfig;
  emailLimit?: NewsletterRateLimitConfig;
  emailDailyLimit?: NewsletterRateLimitConfig;
}): Promise<NewsletterRateLimitDecision> {
  const ip = (input.ip || 'unknown').trim();
  const ipLimit = input.ipLimit ?? NEWSLETTER_IP_LIMIT;

  const ipDecision = await evaluate(ip, ipLimit);
  if (!ipDecision.allowed) {
    return {
      allowed: false,
      layer: 'ip',
      retryAfter: ipDecision.retryAfter,
      maxRequests: ipLimit.maxRequests,
    };
  }

  const email = (input.email || '').trim().toLowerCase();
  if (!email) return { allowed: true };

  const emailLimit = input.emailLimit ?? NEWSLETTER_EMAIL_LIMIT;
  const emailDecision = await evaluate(email, emailLimit);
  if (!emailDecision.allowed) {
    return {
      allowed: false,
      layer: 'email',
      retryAfter: emailDecision.retryAfter,
      maxRequests: emailLimit.maxRequests,
    };
  }

  const dailyLimit = input.emailDailyLimit ?? NEWSLETTER_EMAIL_DAILY_LIMIT;
  const dailyDecision = await evaluate(email, dailyLimit);
  if (!dailyDecision.allowed) {
    return {
      allowed: false,
      layer: 'email',
      retryAfter: dailyDecision.retryAfter,
      maxRequests: dailyLimit.maxRequests,
    };
  }

  return { allowed: true };
}

export async function checkNewsletterIpRateLimit(
  ip: string,
  config: NewsletterRateLimitConfig = NEWSLETTER_CONFIRM_IP_LIMIT
): Promise<{ allowed: true } | { allowed: false; retryAfter: number; maxRequests: number }> {
  const decision = await evaluate((ip || 'unknown').trim(), config);

  return decision.allowed
    ? decision
    : { ...decision, maxRequests: config.maxRequests };
}

export function newsletterRateLimitResponse(
  decision: { retryAfter: number; maxRequests: number }
): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests',
      message: `Rate limit exceeded. Please try again in ${decision.retryAfter} seconds.`,
      retryAfter: decision.retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(decision.retryAfter),
        'X-RateLimit-Limit': String(decision.maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Date.now() + decision.retryAfter * 1000),
      },
    }
  );
}
