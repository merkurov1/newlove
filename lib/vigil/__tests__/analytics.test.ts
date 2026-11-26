/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import {
  EMPTY_VIGIL_METRICS,
  buildVigilMetrics,
  computeVigilRepeatRate,
  formatVigilLifetimeLabel,
  parseVigilMetrics,
} from '@/lib/vigil/analytics';

const ROOT = process.cwd();

describe('Vigil aggregate analytics', () => {
  it('maps one aggregate view row to the public contract', () => {
    const metrics = buildVigilMetrics({
      lifetime_total: '314',
      unique_participants: '120',
      returning_participants: '30',
      telegram_participants: '80',
      supabase_participants: '40',
      reliable_since: '2026-11-16T09:00:00.000Z',
    });

    expect(metrics).toEqual({
      lifetimeTotal: 314,
      uniqueParticipants: 120,
      returningParticipants: 30,
      repeatRate: 0.25,
      telegramParticipants: 80,
      supabaseParticipants: 40,
      analyticsSince: '2026-11-16T09:00:00.000Z',
      analyticsAvailable: true,
    });
  });

  it('keeps lifetime total separate from unique and returning participants', () => {
    const metrics = buildVigilMetrics({
      lifetime_total: 500,
      unique_participants: 100,
      returning_participants: 25,
    });

    expect(metrics.lifetimeTotal).toBe(500);
    expect(metrics.uniqueParticipants).toBe(100);
    expect(metrics.returningParticipants).toBe(25);
    expect(metrics.repeatRate).toBe(0.25);
  });

  it('never reports a returning rate without unique identities or above 1', () => {
    expect(computeVigilRepeatRate(0, 0)).toBeNull();
    expect(computeVigilRepeatRate(5, 0)).toBeNull();
    expect(computeVigilRepeatRate(99, 10)).toBe(1);
    expect(computeVigilRepeatRate(-2, 10)).toBe(0);
  });

  it('fails closed for legacy or malformed analytics payloads', () => {
    expect(parseVigilMetrics({})).toEqual(EMPTY_VIGIL_METRICS);
    expect(
      parseVigilMetrics({ analyticsAvailable: true, lifetimeTotal: -1 })
    ).toMatchObject({
      lifetimeTotal: null,
      analyticsAvailable: true,
    });
    expect(
      parseVigilMetrics({
        analyticsAvailable: true,
        lifetimeTotal: 8,
        uniqueParticipants: 4,
        returningParticipants: 1,
        analyticsSince: 'not-a-date',
      })
    ).toMatchObject({
      lifetimeTotal: 8,
      uniqueParticipants: 4,
      returningParticipants: 1,
      repeatRate: 0.25,
      analyticsSince: null,
    });
  });

  it('formats the lifetime counter without inventing numbers', () => {
    expect(formatVigilLifetimeLabel(1)).toBe('1 spark offered');
    expect(formatVigilLifetimeLabel(7)).toBe('7 sparks offered');
    expect(formatVigilLifetimeLabel(null)).toBe('');
    expect(formatVigilLifetimeLabel(undefined)).toBe('');
  });
});

describe('Vigil metrics migration', () => {
  const migration = fs.readFileSync(
    path.join(
      ROOT,
      'migrations/2026-11-26_vigil_lifetime_metrics.sql'
    ),
    'utf8'
  );

  it('adds only additive identity counters and keeps the private table private', () => {
    expect(migration).toContain('add column if not exists spark_count');
    expect(migration).toContain('add column if not exists first_spark_at');
    expect(migration).toContain(
      'create or replace function public.record_vigil_spark_count()'
    );
    expect(migration).not.toMatch(/delete\s+from\s+public\.vigil_spark_claims/i);
    expect(migration).not.toMatch(/update\s+public\.temple_log/i);
  });

  it('increments only when the 24h window advances', () => {
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toContain(
      'before update of last_spark_at on public.vigil_spark_claims'
    );
  });

  it('keeps the lifetime counter atomic with the successful claim', () => {
    expect(migration).toContain(
      'create table if not exists public.vigil_spark_stats'
    );
    expect(migration).toContain('lifetime_total = lifetime_total + 1');
    expect(migration).toContain(
      'revoke all on public.vigil_spark_stats from public, anon, authenticated'
    );
    expect(migration).toContain(
      'grant all on public.vigil_spark_stats to service_role'
    );
  });

  it('exposes aggregate-only metrics through a service-role view', () => {
    expect(migration).toContain(
      'create or replace view public.vigil_spark_metrics'
    );
    expect(migration).toContain('as lifetime_total');
    expect(migration).toContain('as unique_participants');
    expect(migration).toContain('as returning_participants');
    expect(migration).toContain(
      'revoke all on public.vigil_spark_metrics from public, anon, authenticated'
    );
    expect(migration).toContain(
      'grant select on public.vigil_spark_metrics to service_role'
    );
  });
});
