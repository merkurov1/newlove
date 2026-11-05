import { assertServerOnly } from '@/lib/serverOnly';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DecisionObservation,
  DecisionObservatoryReport,
  DecisionObservatoryRun,
  ObservationConfidence,
} from './types';

assertServerOnly('lib/pierrot/observatory/store');

const DECISIONS_TABLE = 'pierrot_decisions';
const EVENTS_TABLE = 'pierrot_decision_events';
const RUNS_TABLE = 'pierrot_decision_observatory_runs';

function isMissingRelation(error: { code?: unknown; message?: unknown } | null): boolean {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('pierrot_decision_observatory_runs')
  );
}

type DecisionRow = Record<string, unknown>;
type EventRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function confidenceLabel(value: number): ObservationConfidence {
  if (value >= 0.7) return 'confirmed';
  if (value >= 0.5) return 'supported';
  if (value >= 0.3) return 'temporal_only';
  return 'insufficient';
}

function eventLabel(event: EventRow): string {
  const type = text(event.event_type) || 'event';
  const from = text(event.from_status);
  const to = text(event.to_status);
  const date = text(event.created_at)?.slice(0, 10) || 'unknown date';

  if (type === 'status_changed') {
    return `${date}: status changed${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''}`;
  }
  if (type === 'created') return `${date}: record created`;
  return `${date}: ${type}${to ? ` → ${to}` : ''}`;
}

function metadataOutcome(event: EventRow): string | null {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>).outcome;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : null;
}

function observeDecision(decision: DecisionRow, events: EventRow[]): DecisionObservation {
  const sorted = [...events].sort((left, right) =>
    String(left.created_at || '').localeCompare(String(right.created_at || ''))
  );

  const confirmations: string[] = [];
  const discrepancies: string[] = [];
  const conclusions: string[] = [];
  let confidence = 0.2;

  for (const event of sorted) {
    const type = text(event.event_type);
    const to = text(event.to_status);
    const outcome = metadataOutcome(event);

    if (outcome) {
      confirmations.push(`${eventLabel(event)}: ${outcome}`);
      confidence = Math.max(confidence, 0.75);
    }

    if (to === 'completed' && type === 'status_changed') {
      confirmations.push(eventLabel(event));
      confidence = Math.max(confidence, 0.7);
    }

    if (to === 'rejected' && type === 'status_changed') {
      discrepancies.push(eventLabel(event));
      confidence = Math.max(confidence, 0.65);
    }

    if (to === 'superseded' && type === 'status_changed') {
      const replacement =
        event.metadata && typeof event.metadata === 'object'
          ? text((event.metadata as Record<string, unknown>).superseded_by)
          : null;
      confirmations.push(
        `${eventLabel(event)}${replacement ? ` by ${replacement.slice(0, 8)}` : ''}`
      );
      confidence = Math.max(confidence, 0.55);
    }
  }

  const status = text(decision.status) || 'unknown';
  const rationale = text(decision.rationale);

  if (!rationale) {
    conclusions.push(
      'The original assumption was not recorded; it cannot be reconstructed reliably.'
    );
  }

  if (confirmations.length === 0 && discrepancies.length === 0) {
    conclusions.push(
      'No later outcome is recorded. This is absence of evidence, not evidence of failure.'
    );
  }

  if (status === 'completed') {
    confirmations.push('Current record status is completed.');
    confidence = Math.max(confidence, 0.7);
  }

  if (status === 'rejected') {
    discrepancies.push('Current record status is rejected.');
    confidence = Math.max(confidence, 0.65);
  }

  if (status === 'superseded') {
    confirmations.push('Current record status is superseded by a later decision.');
    confidence = Math.max(confidence, 0.55);
  }

  if (status === 'current' && confirmations.length === 0) {
    conclusions.push('The decision remains current; no outcome has been confirmed yet.');
  }

  conclusions.push('Temporal sequence is not treated as proof of causality.');

  let observedResult = 'No later observable result is recorded.';
  if (discrepancies.length > 0) observedResult = discrepancies[discrepancies.length - 1];
  else if (confirmations.length > 0) observedResult = confirmations[confirmations.length - 1];

  const title = text(decision.title) || 'Untitled decision';
  const content = text(decision.content);

  return {
    decisionId: String(decision.id),
    title,
    kind: text(decision.kind) || 'decision',
    status,
    createdAt: text(decision.created_at) || new Date().toISOString(),
    updatedAt: text(decision.updated_at) || new Date().toISOString(),
    project: text(decision.project),
    assumption: rationale,
    assumptionSource: rationale ? 'rationale' : 'not_recorded',
    expectedResult: content
      ? `Expected outcome is inferred from the decision text: ${content.slice(0, 300)}`
      : 'No expected result was recorded.',
    expectedSource: content ? 'inferred_from_decision' : 'not_recorded',
    observedResult,
    confirmations,
    discrepancies,
    confidence: Number(confidence.toFixed(2)),
    confidenceLabel: confidenceLabel(confidence),
    causality: 'not_established',
    conclusions,
  };
}

function buildReport(decisions: DecisionRow[], events: EventRow[]): DecisionObservatoryReport {
  const byDecision = new Map<string, EventRow[]>();

  for (const event of events) {
    const id = text(event.decision_id);
    if (!id) continue;
    const bucket = byDecision.get(id) || [];
    bucket.push(event);
    byDecision.set(id, bucket);
  }

  const observations = decisions.map((decision) =>
    observeDecision(decision, byDecision.get(String(decision.id)) || [])
  );

  const summary = {
    confirmed: observations.filter((item) => item.confidenceLabel === 'confirmed').length,
    supported: observations.filter((item) => item.confidenceLabel === 'supported').length,
    temporalOnly: observations.filter((item) => item.confidenceLabel === 'temporal_only').length,
    insufficient: observations.filter((item) => item.confidenceLabel === 'insufficient').length,
    current: decisions.filter((decision) => decision.status === 'current').length,
    completed: decisions.filter((decision) => decision.status === 'completed').length,
    superseded: decisions.filter((decision) => decision.status === 'superseded').length,
    rejected: decisions.filter((decision) => decision.status === 'rejected').length,
  };

  const limitations = [
    'The observatory reads stored decisions, their status events and their explicit metadata. It has no access to external outcomes that were never recorded.',
    'A later status change is a temporal association, not proof that the decision caused the result.',
    'Expected results are often inferred from the decision text because the current schema has no dedicated expected-outcome field.',
  ];

  if (events.length === 0) {
    limitations.unshift(
      'No decision events were found. Conclusions are therefore mostly insufficient.'
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    decisionCount: decisions.length,
    eventCount: events.length,
    observations,
    summary,
    limitations,
    dataSources: ['pierrot_decisions', 'pierrot_decision_events'],
    insufficientData: decisions.length < 3 || events.length === 0,
  };
}

export async function runDecisionObservatory(
  store: SupabaseClient,
  userId: string
): Promise<DecisionObservatoryRun> {
  const { data: decisionData, error: decisionError } = await store
    .from(DECISIONS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .in('kind', [
      'decision',
      'position',
      'rejected_recommendation',
      'task',
      'memory',
      'preference',
      'constraint',
    ])
    .order('created_at', { ascending: false })
    .limit(200);

  if (decisionError) throw decisionError;

  const decisions = (decisionData ?? []) as DecisionRow[];
  const ids = decisions
    .map((decision) => (typeof decision.id === 'string' ? decision.id : null))
    .filter((id): id is string => Boolean(id));

  let events: EventRow[] = [];

  if (ids.length > 0) {
    const eventResult = await store
      .from(EVENTS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .in('decision_id', ids)
      .order('created_at', { ascending: true })
      .limit(1_000);

    if (eventResult.error && !isMissingRelation(eventResult.error)) throw eventResult.error;
    events = (eventResult.data ?? []) as EventRow[];
  }

  const report = buildReport(decisions, events);
  const generatedAt = report.generatedAt;
  const runId = randomUUID();

  const { error: runError } = await store.from(RUNS_TABLE).insert({
    id: runId,
    user_id: userId,
    generated_at: generatedAt,
    decision_count: report.decisionCount,
    event_count: report.eventCount,
    report,
    created_at: generatedAt,
  });

  if (runError) {
    if (isMissingRelation(runError)) throw new Error('observatory_migration_required');
    throw runError;
  }

  return {
    id: runId,
    generatedAt,
    decisionCount: report.decisionCount,
    eventCount: report.eventCount,
    report,
  };
}

function parseRun(row: DecisionRow): DecisionObservatoryRun | null {
  if (typeof row.id !== 'string') return null;
  const report = row.report;

  if (!report || typeof report !== 'object') return null;

  return {
    id: row.id,
    generatedAt: typeof row.generated_at === 'string' ? row.generated_at : '',
    decisionCount: typeof row.decision_count === 'number' ? row.decision_count : 0,
    eventCount: typeof row.event_count === 'number' ? row.event_count : 0,
    report: report as DecisionObservatoryReport,
  };
}

export async function getLatestObservatoryRun(
  store: SupabaseClient,
  userId: string
): Promise<DecisionObservatoryRun | null> {
  const { data, error } = await store
    .from(RUNS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  if (!data) return null;

  return parseRun(data as DecisionRow);
}

export async function listObservatoryRuns(
  store: SupabaseClient,
  userId: string,
  limit = 10
): Promise<DecisionObservatoryRun[]> {
  const { data, error } = await store
    .from(RUNS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 30));

  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }

  return (data ?? [])
    .map((row) => parseRun(row as DecisionRow))
    .filter((run): run is DecisionObservatoryRun => run !== null);
}
