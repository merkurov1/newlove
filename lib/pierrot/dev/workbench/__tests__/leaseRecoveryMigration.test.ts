/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-12-09_pierrot_dev_lease_recovery.sql'),
  'utf8'
);

function functionBody(): string {
  const start = migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.pierrot_dev_reap_expired_attempts'
  );
  const end = migration.indexOf('END $$;', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe('lease recovery migration', () => {
  it('requeues exactly the first expired attempt and preserves queue ordering', () => {
    const body = functionBody();
    const firstBranch = body.slice(
      body.indexOf('IF NOT v_previous_lease_failure THEN'),
      body.indexOf('-- The single automatic retry was already used')
    );

    expect(firstBranch).toContain("SET status = 'queued'");
    expect(firstBranch).toContain('queued_at = NOW()');
    expect(firstBranch).toContain('blocked_reason = NULL');
    // priority and queue_position must survive the automatic retry.
    expect(firstBranch).not.toMatch(/\bpriority\s*=/);
    expect(firstBranch).not.toMatch(/\bqueue_position\s*=/);

    // Retry spend is derived from immutable attempt history, not attempt_count.
    expect(body).toContain('h.attempt_number < v_attempt.attempt_number');
    expect(body).toContain("h.status = 'timed_out'");
    expect(body).toContain("h.error_code = 'LEASE_EXPIRED'");
    expect(body).not.toMatch(/\battempt_count\s*=/);
  });

  it('fails the task on the next expired attempt after the automatic retry', () => {
    const body = functionBody();

    expect(body).toContain('-- The single automatic retry was already used');
    expect(body).toContain("SET status = 'failed'");
    expect(body).toContain("v_outcome := 'failed'");
    expect(body).toContain("'finalizedAsFailed', v_finalized");
    expect(body).toContain('automaticRetryAlreadyUsed');
  });

  it('is idempotent and never rewrites finalized attempts or unrelated workers', () => {
    const body = functionBody();

    // Finalization is guarded by the active status, so a second reaper call
    // cannot touch a terminal attempt.
    expect(body).toContain("AND a.status IN ('claimed', 'running')");
    expect(body).toContain('FOR UPDATE SKIP LOCKED');
    expect(body).toContain("'lease-expired:' || v_attempt.id::text");
    expect(body).toContain('ON CONFLICT DO NOTHING');

    // Only the worker still pointing at this attempt is taken offline.
    expect(body).toContain('AND w.current_attempt_id = v_attempt.id');

    expect(body).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(body).not.toMatch(/UPDATE\s+public\.pierrot_dev_attempts[\s\S]*'completed'/i);
  });
});
