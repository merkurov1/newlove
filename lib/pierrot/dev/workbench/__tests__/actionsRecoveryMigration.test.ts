/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-12-14_pierrot_actions_dispatch_recovery.sql'),
  'utf8'
);

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf('END $$;', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe('Actions dispatch recovery migration', () => {
  it('adds durable outcome, correlation, attempt and retry fields', () => {
    for (const column of [
      'actions_dispatch_status',
      'actions_dispatch_reason_code',
      'actions_dispatch_reason',
      'actions_dispatch_correlation_id',
      'actions_dispatch_attempts',
      'actions_dispatch_last_attempt_at',
      'actions_dispatch_next_retry_at',
      'actions_dispatch_updated_at',
    ]) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect(migration).toContain('pierrot_dev_prompts_actions_dispatch_retry_idx');
  });

  it('reserves atomically with the existing advisory lock and active-attempt guard', () => {
    const body = functionBody('pierrot_dev_reserve_actions_dispatch');
    expect(body).toContain('PERFORM pg_advisory_xact_lock(7340219)');
    expect(body).toContain('FOR UPDATE');
    expect(body).toContain("a.status IN ('claimed', 'running')");
    expect(body).toContain("v_task.status <> 'queued'");
    expect(body).toContain('RETRY_EXHAUSTED');
    expect(body).toContain('p_expected_requested_at');
  });

  it('only releases a still-queued task with no active attempt or blocker', () => {
    const body = functionBody('pierrot_dev_complete_actions_dispatch');
    expect(body).toContain('STALE_CORRELATION');
    expect(body).toContain('STALE_RESERVATION');
    expect(body).toContain("v_task.status <> 'queued'");
    expect(body).toContain("a.status IN ('claimed', 'running')");
    expect(body).toContain("'TASK_BLOCKED'");
    expect(body).toContain("'BATCH_PAUSED'");
    expect(body).toContain("'DEPENDENCY_BLOCKED'");
    expect(body).toContain('actions_dispatch_requested_at = CASE');
    expect(body).toContain('ELSE NULL');
    expect(body).toContain('p_reset_attempts');
  });

  it('reuses the existing scheduler tick instead of adding a new cron schedule', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.brain_worker_tick()');
    expect(migration).toContain('/api/cron/pierrot-dev-dispatch');
    expect(migration).not.toMatch(/cron\.schedule\s*\(/i);
    expect(migration).not.toMatch(/cron\.unschedule\s*\(/i);
  });

  it('is additive and never rewrites history', () => {
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+public\.pierrot_dev_attempts\b/i);
  });
});
