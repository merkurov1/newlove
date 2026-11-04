/**
 * Pure Flow publication state machine.
 *
 * The server has no "schedule publish" endpoint. The only safe undo is:
 *   create draft -> wait in the browser -> PATCH to published.
 * If the tab closes during the wait, the item stays an unpublished draft.
 * The state machine makes that limitation explicit and testable.
 */

export const FLOW_UNDO_WINDOW_MS = 10_000;

export type FlowPublishPhase =
  | 'idle'
  | 'creating_draft'
  | 'undo'
  | 'publishing'
  | 'published'
  | 'cancelled'
  | 'failed';

export type FlowPublishLifecycle = {
  phase: FlowPublishPhase;
  draftId: string | null;
  deadline: number | null;
  error: string | null;
};

export function initialPublishLifecycle(): FlowPublishLifecycle {
  return { phase: 'idle', draftId: null, deadline: null, error: null };
}

export function beginDraftCreation(): FlowPublishLifecycle {
  return { phase: 'creating_draft', draftId: null, deadline: null, error: null };
}

export function draftCreated(
  draftId: string,
  now: number,
  windowMs = FLOW_UNDO_WINDOW_MS
): FlowPublishLifecycle {
  return {
    phase: 'undo',
    draftId,
    deadline: now + windowMs,
    error: null,
  };
}

export function draftCreationFailed(error: string): FlowPublishLifecycle {
  return { phase: 'failed', draftId: null, deadline: null, error };
}

export function canExpire(lifecycle: FlowPublishLifecycle, now: number): boolean {
  return lifecycle.phase === 'undo' && lifecycle.deadline !== null && now >= lifecycle.deadline;
}

export function beginPublishing(lifecycle: FlowPublishLifecycle): FlowPublishLifecycle {
  if (lifecycle.phase !== 'undo' || !lifecycle.draftId) return lifecycle;
  return { ...lifecycle, phase: 'publishing', deadline: null };
}

export function publishingSucceeded(lifecycle: FlowPublishLifecycle): FlowPublishLifecycle {
  if (lifecycle.phase !== 'publishing') return lifecycle;
  return { ...lifecycle, phase: 'published', deadline: null };
}

export function publishingFailed(
  lifecycle: FlowPublishLifecycle,
  error: string
): FlowPublishLifecycle {
  if (lifecycle.phase !== 'publishing') return lifecycle;
  return { ...lifecycle, phase: 'failed', deadline: null, error };
}

export function cancelPublishing(lifecycle: FlowPublishLifecycle): FlowPublishLifecycle {
  if (lifecycle.phase !== 'undo' || !lifecycle.draftId) return lifecycle;
  return { ...lifecycle, phase: 'cancelled', deadline: null };
}

export function resetPublishing(): FlowPublishLifecycle {
  return initialPublishLifecycle();
}

export function remainingMs(lifecycle: FlowPublishLifecycle, now: number): number {
  if (lifecycle.phase !== 'undo' || lifecycle.deadline === null) return 0;
  return Math.max(0, lifecycle.deadline - now);
}
