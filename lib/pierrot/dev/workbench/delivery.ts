/**
 * Pure delivery-lifecycle rules for Pierrot Dev.
 *
 * A task is delivered only after its authoritative pull request has passed
 * real checks, been merged into the default branch, and that exact commit has
 * been observed in the production deployment. These helpers contain no I/O so
 * the ordering, duplicate-PR and deployment rules can be unit tested without
 * GitHub, Supabase or Vercel.
 */

import type { DevDeploymentStatus } from './types';

export function parsePullRequestNumber(url: string): number | null {
  const match = String(url || '').match(/\/pull\/(\d+)(?:\b|$)/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export type DeliveryPullRequestRef = {
  taskId: string;
  url: string;
  number: number | null;
  state: string;
  merged: boolean;
  /** Immutable attempt sequence that produced this head, when known. */
  attemptNumber?: number | null;
  headSha?: string | null;
  headRef?: string | null;
  baseRef?: string | null;
  updatedAt?: string | null;
};

export type AuthoritativePullRequestSelection<T extends DeliveryPullRequestRef> = {
  /** The one PR that may be updated, waited on and merged. */
  authoritative: T | null;
  /** Pull requests that are not authoritative. Closed/merged ones need no action. */
  obsolete: T[];
  /** Open obsolete PRs that cannot be retired until redundancy is proven. */
  ambiguous: T[];
};

function prRank(pr: DeliveryPullRequestRef): number {
  if (pr.merged) return 2;
  if (String(pr.state || '').toLowerCase() === 'open') return 3;
  return 1;
}

function comparePullRequests(a: DeliveryPullRequestRef, b: DeliveryPullRequestRef): number {
  const rank = prRank(b) - prRank(a);
  if (rank !== 0) return rank;
  const attempt = (b.attemptNumber ?? -1) - (a.attemptNumber ?? -1);
  if (attempt !== 0) return attempt;
  const number = (b.number ?? -1) - (a.number ?? -1);
  if (number !== 0) return number;
  return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
}

/**
 * Supersession by the immutable attempt sequence is stronger evidence than PR
 * age: a retry always supersedes an older attempt even when the new branch is
 * not a strict ancestor (for example after a clean rebase onto main).
 */
export function isSupersededByAttempt(
  obsolete: DeliveryPullRequestRef,
  authoritative: DeliveryPullRequestRef
): boolean {
  return (
    typeof obsolete.attemptNumber === 'number' &&
    typeof authoritative.attemptNumber === 'number' &&
    authoritative.attemptNumber > obsolete.attemptNumber
  );
}

/**
 * Close/retire an obsolete PR only when its work is provably redundant:
 * - it is already closed or merged (nothing to close), or
 * - it belongs to an older attempt of the same task, or
 * - GitHub comparison proves the authoritative head contains its head.
 */
export function canRetirePullRequest(input: {
  obsolete: DeliveryPullRequestRef;
  authoritative: DeliveryPullRequestRef;
  containsObsoleteHead?: boolean | null;
}): boolean {
  const { obsolete, authoritative } = input;
  if (obsolete.url === authoritative.url) return false;
  if (obsolete.merged) return true;
  if (String(obsolete.state || '').toLowerCase() !== 'open') return true;
  if (isSupersededByAttempt(obsolete, authoritative)) return true;
  return input.containsObsoleteHead === true;
}

/**
 * Choose exactly one authoritative PR per task. Open PRs win over merged and
 * closed history; within the same state the newest attempt wins. Every other
 * PR is returned as obsolete so the caller can prove redundancy before closing
 * it or block instead of merging ambiguously.
 */
export function selectAuthoritativePullRequest<T extends DeliveryPullRequestRef>(
  pullRequests: T[]
): AuthoritativePullRequestSelection<T> {
  const unique: T[] = [];
  const seen = new Set<string>();
  for (const pr of pullRequests) {
    if (!pr || !pr.taskId || !pr.url || seen.has(pr.url)) continue;
    seen.add(pr.url);
    unique.push(pr);
  }
  if (unique.length === 0) return { authoritative: null, obsolete: [], ambiguous: [] };

  const sorted = [...unique].sort(comparePullRequests);
  const authoritative = sorted[0];
  const obsolete = sorted.slice(1);
  const ambiguous = obsolete.filter(
    (pr) =>
      String(pr.state || '').toLowerCase() === 'open' &&
      !pr.merged &&
      !isSupersededByAttempt(pr, authoritative)
  );
  return { authoritative, obsolete, ambiguous };
}

export type ProductionVerificationStatus =
  | 'verified'
  | 'pending'
  | 'failed'
  | 'unavailable'
  | 'not_configured';

export type ProductionVerification = {
  status: ProductionVerificationStatus;
  reason: string;
  deployment: DevDeploymentStatus | null;
  /** The deployed commit that matched, or null when nothing matched. */
  matchedSha: string | null;
};

function normalizedSha(value: string | null | undefined): string | null {
  const sha = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
}

/**
 * Match the live production deployment against the exact commits that landed
 * for this finalization pass. `ready` alone is not enough: production must be
 * serving one of the integrated merge SHAs or the current main head.
 */
export function verifyProductionDeployment(input: {
  deployment: DevDeploymentStatus | null | undefined;
  landedShas: Array<string | null | undefined>;
}): ProductionVerification {
  const deployment = input.deployment || null;
  if (!deployment) {
    return {
      status: 'not_configured',
      reason:
        'Production deployment status is not configured. A merged PR is not treated as delivered until the live deployment can be verified.',
      deployment: null,
      matchedSha: null,
    };
  }
  if (deployment.state === 'unavailable' || deployment.state === 'unknown') {
    return {
      status: 'unavailable',
      reason:
        deployment.reason ||
        'The production deployment commit is unavailable, so delivery cannot be verified.',
      deployment,
      matchedSha: null,
    };
  }
  if (deployment.state === 'error') {
    return {
      status: 'failed',
      reason: deployment.reason || 'The production deployment failed.',
      deployment,
      matchedSha: null,
    };
  }
  const deployed = normalizedSha(deployment.commitSha);
  if (!deployed) {
    return {
      status: 'unavailable',
      reason:
        deployment.reason ||
        'Production is deployed but its commit SHA is unknown; delivery cannot be verified.',
      deployment,
      matchedSha: null,
    };
  }
  const candidates = new Set(
    input.landedShas.map(normalizedSha).filter((sha): sha is string => Boolean(sha))
  );
  const matched = [...candidates].find(
    (sha) => sha === deployed || sha.startsWith(deployed) || deployed.startsWith(sha)
  );
  if (deployment.state === 'ready' && matched) {
    return {
      status: 'verified',
      reason: `Production is ready at ${deployed.slice(0, 7)}, which matches the landed commit.`,
      deployment,
      matchedSha: matched,
    };
  }
  if (deployment.state === 'building' || deployment.state === 'queued') {
    return {
      status: 'pending',
      reason: `Production is ${deployment.state}; waiting for the landed commit to become ready.`,
      deployment,
      matchedSha: null,
    };
  }
  return {
    status: 'pending',
    reason:
      deployment.reason ||
      `Production is ${deployment.state} at ${deployed.slice(0, 7)}, which is not one of this pass's landed commits yet.`,
    deployment,
    matchedSha: null,
  };
}
