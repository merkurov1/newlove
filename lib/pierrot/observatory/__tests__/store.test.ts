/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { FakeSupabase, OWNER_ID } from '@/lib/pierrot/memory/testSupport/fakeSupabase';
import { getLatestObservatoryRun, listObservatoryRuns, runDecisionObservatory } from '../store';

const now = new Date().toISOString();

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    user_id: OWNER_ID,
    kind: 'decision',
    title: 'Решения',
    content: 'Ожидаемый результат.',
    rationale: 'Предположение, на котором основано решение.',
    status: 'current',
    tags: [],
    source_refs: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('Decision Observatory', () => {
  it('does not run on read and stores one manual report', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();
    db.seed('pierrot_decisions', [decision()]);

    expect(await getLatestObservatoryRun(store, OWNER_ID)).toBeNull();
    expect(db.all('pierrot_decision_observatory_runs')).toHaveLength(0);

    const run = await runDecisionObservatory(store, OWNER_ID);
    expect(run.decisionCount).toBe(1);
    expect(db.all('pierrot_decision_observatory_runs')).toHaveLength(1);

    const latest = await getLatestObservatoryRun(store, OWNER_ID);
    expect(latest?.id).toBe(run.id);
    expect(db.all('pierrot_decision_observatory_runs')).toHaveLength(1);

    const history = await listObservatoryRuns(store, OWNER_ID);
    expect(history).toHaveLength(1);
  });

  it('separates confirmed outcomes from temporal sequence and absence of evidence', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();

    const confirmed = decision({
      title: 'Сменить формат ответов',
      status: 'completed',
    });
    const unresolved = decision({
      title: 'Попробовать новый канал',
      status: 'current',
    });

    db.seed('pierrot_decisions', [confirmed, unresolved]);
    db.seed('pierrot_decision_events', [
      {
        id: crypto.randomUUID(),
        user_id: OWNER_ID,
        decision_id: confirmed.id,
        event_type: 'status_changed',
        from_status: 'current',
        to_status: 'completed',
        metadata: {},
        created_at: now,
      },
    ]);

    const run = await runDecisionObservatory(store, OWNER_ID);
    const confirmedObservation = run.report.observations.find(
      (item) => item.decisionId === confirmed.id
    );
    const unresolvedObservation = run.report.observations.find(
      (item) => item.decisionId === unresolved.id
    );

    expect(confirmedObservation?.confidenceLabel).toBe('confirmed');
    expect(confirmedObservation?.confirmations.length).toBeGreaterThan(0);
    expect(confirmedObservation?.causality).toBe('not_established');

    expect(unresolvedObservation?.confidenceLabel).toBe('insufficient');
    expect(unresolvedObservation?.observedResult).toContain('No later observable result');
    expect(unresolvedObservation?.conclusions.join(' ')).toContain('absence of evidence');
  });

  it('marks insufficient data honestly when there are no events', async () => {
    const db = new FakeSupabase();
    const store = db.asClient();
    db.seed('pierrot_decisions', [decision(), decision(), decision()]);

    const run = await runDecisionObservatory(store, OWNER_ID);
    expect(run.report.insufficientData).toBe(true);
    expect(run.report.limitations.join(' ')).toContain('No decision events');
  });
});
