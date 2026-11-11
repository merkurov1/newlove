import { detectContextQuery } from '@/lib/pierrot/context/intent';
import type { ContextQueryPlan } from '@/lib/pierrot/context/types';
import type { PierrotExecutionPlan } from '@/lib/pierrot/executionPlan';

/**
 * One deterministic decision point for a Pierrot turn.
 *
 * It does not replace retrieval or generation. It decides which existing
 * subsystem owns the request, so a historical question cannot silently fall
 * through to generic generation and an analytics question cannot be captured
 * by the Context Engine.
 */
export type PierrotTurnRoute = 'context' | 'owner_tool' | 'general';

export type PierrotTurnPlan = {
  route: PierrotTurnRoute;
  contextQuery: ContextQueryPlan | null;
  /** The message explicitly asks for a chart or diagram. */
  visualization: boolean;
  reasons: string[];
};

export function planPierrotTurn(input: {
  message: string;
  executionPlan?: Pick<PierrotExecutionPlan, 'ownerTool' | 'operation' | 'queryPlan'> | null;
  now?: Date;
  timezone?: string;
  timezoneKnown?: boolean;
}): PierrotTurnPlan {
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (!message) {
    return { route: 'general', contextQuery: null, visualization: false, reasons: ['empty'] };
  }

  const contextQuery = detectContextQuery(message, {
    now: input.now,
    timezone: input.timezone,
    timezoneKnown: input.timezoneKnown,
  });
  const visualization = Boolean(
    contextQuery?.signals?.includes('intent:visualization')
  );
  const reasons: string[] = [];

  if (contextQuery) {
    reasons.push(`context:${contextQuery.intent}`, `confidence:${contextQuery.confidence}`);
    if (visualization) reasons.push('visualization:requested');
    if (contextQuery.period) reasons.push(`period:${contextQuery.period.key}`);

    return { route: 'context', contextQuery, visualization, reasons };
  }

  const ownerTool = input.executionPlan?.ownerTool;
  if (ownerTool) {
    reasons.push(`owner_tool:${ownerTool.kind}`, `operation:${input.executionPlan?.operation}`);
    return { route: 'owner_tool', contextQuery: null, visualization, reasons };
  }

  reasons.push('general:model');
  return { route: 'general', contextQuery: null, visualization, reasons };
}
