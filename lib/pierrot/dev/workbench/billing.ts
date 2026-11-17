import { assertServerOnly } from '@/lib/serverOnly';
import { getGitHubToken } from '@/lib/github';
import { getDevRepositoryConfig } from '../repositories';
import type { DevCodespaceBillingSnapshot } from './types';

assertServerOnly('lib/pierrot/dev/workbench/billing');

const CACHE_SUCCESS_MS = 10 * 60_000;
const CACHE_FAILURE_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 5_000;

let cache: { expiresAt: number; value: DevCodespaceBillingSnapshot } | null = null;

function number(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function breakdown(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const parsed = number(raw);
    if (parsed !== null) result[key.slice(0, 40)] = parsed;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function unavailable(reason: string, checkedAt: string): DevCodespaceBillingSnapshot {
  return {
    status: 'unavailable',
    source: 'github-billing-api',
    checkedAt,
    reason: reason.slice(0, 300),
    totalMinutesUsed: null,
    totalPaidMinutesUsed: null,
    includedMinutes: null,
    minutesUsedBreakdown: null,
  };
}

/**
 * Best-effort account-level Codespaces usage. This is optional evidence, never
 * a blocker: a fine-grained token without billing access simply returns
 * `unavailable`, and task-level costs stay labelled as estimates. No private
 * prompts or credentials are read or logged.
 */
export async function getCodespacesBillingSnapshot(): Promise<DevCodespaceBillingSnapshot> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const checkedAt = new Date().toISOString();
  const token = getGitHubToken();
  if (!token) {
    const value = unavailable('GITHUB_TOKEN is not configured on the server.', checkedAt);
    cache = { expiresAt: Date.now() + CACHE_FAILURE_MS, value };
    return value;
  }

  const owner = getDevRepositoryConfig('newlove').owner;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(owner)}/settings/billing/codespaces`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'pierrot-dev-workbench/1.0',
        },
        signal: controller.signal,
        cache: 'no-store',
      }
    );
    if (!response.ok) {
      const reason =
        response.status === 403 || response.status === 404
          ? `GitHub billing API is not available to this token (${response.status}). Grant billing/Codespaces read access if confirmed account totals are required.`
          : `GitHub billing API returned ${response.status}.`;
      const value = unavailable(reason, checkedAt);
      cache = { expiresAt: Date.now() + CACHE_FAILURE_MS, value };
      return value;
    }
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      const value = unavailable('GitHub billing API returned an empty body.', checkedAt);
      cache = { expiresAt: Date.now() + CACHE_FAILURE_MS, value };
      return value;
    }
    const value: DevCodespaceBillingSnapshot = {
      status: 'confirmed',
      source: 'github-billing-api',
      checkedAt,
      reason: null,
      totalMinutesUsed: number(body.total_minutes_used),
      totalPaidMinutesUsed: number(body.total_paid_minutes_used),
      includedMinutes: number(body.included_minutes),
      minutesUsedBreakdown: breakdown(body.minutes_used_breakdown),
    };
    cache = { expiresAt: Date.now() + CACHE_SUCCESS_MS, value };
    return value;
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError'
        ? 'GitHub billing API timed out.'
        : 'GitHub billing API is unreachable.';
    const value = unavailable(reason, checkedAt);
    cache = { expiresAt: Date.now() + CACHE_FAILURE_MS, value };
    return value;
  } finally {
    clearTimeout(timer);
  }
}

export function resetBillingCacheForTests(): void {
  cache = null;
}
