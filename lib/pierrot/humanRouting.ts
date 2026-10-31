import type { HumanPresenceRecord } from '@/lib/pierrot/humanPresence';

/**
 * Deterministic routing for Anton's plain Telegram text.
 *
 * Priority:
 *   1. the request/session anchored by Telegram Reply;
 *   2. the single active session for this owner;
 *   3. the single unambiguous pending request for this owner.
 *
 * A pending target becomes an explicit acceptance. A closed target is
 * returned as-is so the bot can tell Anton that the conversation ended
 * instead of silently falling through to Piero.
 */
export type HumanRoutingSource = 'reply' | 'active' | 'pending';

export type HumanRoutingPlan = {
  target: HumanPresenceRecord;
  source: HumanRoutingSource;
  autoAccept: boolean;
};

export function planOwnerHumanRouting(input: {
  replyTarget?: HumanPresenceRecord | null;
  activeTarget?: HumanPresenceRecord | null;
  pendingTarget?: HumanPresenceRecord | null;
}): HumanRoutingPlan | null {
  const target = input.replyTarget ?? input.activeTarget ?? input.pendingTarget;

  if (!target) return null;

  const source: HumanRoutingSource = input.replyTarget
    ? 'reply'
    : input.activeTarget
      ? 'active'
      : 'pending';

  return {
    target,
    source,
    autoAccept: target.request.status === 'pending',
  };
}
