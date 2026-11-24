/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-12-16_pierrot_dev_execution_retry.sql'),
  'utf8'
);

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf('END $$;', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe('execution retry migration', () => {
  it('is additive and never rewrites attempts or existing tasks', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS retry_after_at TIMESTAMPTZ');
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS pierrot_dev_prompts_status_check');
    expect(migration).toContain("'manual_review'");
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/DROP TABLE/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.pierrot_dev_attempts/i);
  });

  it('makes both claim RPCs honour the bounded retry backoff', () => {
    for (const name of ['pierrot_dev_claim_next_task', 'pierrot_dev_claim_task']) {
      const body = functionBody(name);
      expect(body).toContain('(p.retry_after_at IS NULL OR p.retry_after_at <= NOW())');
      expect(body).toContain('retry_after_at = NULL');
      // Existing safety guarantees must be preserved.
      expect(body).toContain('PERFORM pg_advisory_xact_lock(7340219)');
      expect(body).toContain('FOR UPDATE SKIP LOCKED');
      expect(body).toContain("a.status IN ('claimed', 'running')");
      expect(body).toContain("w.status IN ('online', 'idle')");
    }
  });

  it('claims exactly one first eligible task or exactly the requested task', () => {
    const next = functionBody('pierrot_dev_claim_next_task');
    // Empty task_id path: one row, deterministic eligibility ordering.
    expect(next).toContain('FOR UPDATE SKIP LOCKED');
    expect(next).toContain('LIMIT 1');
    expect(next).toContain('ORDER BY p.priority DESC');
    expect(next).toContain('p.queued_at ASC NULLS FIRST');

    // Targeted path: the requested id is part of the same locked predicate.
    const targeted = functionBody('pierrot_dev_claim_task');
    expect(targeted).toContain('WHERE p.id = p_task_id');
    expect(targeted).toContain("AND p.status = 'queued'");
  });

  it('keeps claim functions service-role-only', () => {
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.pierrot_dev_claim_next_task(TEXT, INTEGER)'
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.pierrot_dev_claim_task(UUID, TEXT, INTEGER)'
    );
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.pierrot_dev_claim_task');
    expect(migration).not.toMatch(/SECURITY DEFINER/i);
  });
});
