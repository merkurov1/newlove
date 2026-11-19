/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-12-12_pierrot_actions_executor.sql'),
  'utf8'
);

function functionBody(): string {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.pierrot_dev_claim_task');
  const end = migration.indexOf('END $$;', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe('GitHub Actions executor migration', () => {
  it('claims exactly one explicitly requested queued task atomically', () => {
    const body = functionBody();

    expect(body).toContain('p.id = p_task_id');
    expect(body).toContain("p.status = 'queued'");
    expect(body).toContain('p.blocked_reason IS NULL');
    expect(body).toContain('PERFORM pg_advisory_xact_lock(7340219)');
    expect(body).toContain('FOR UPDATE SKIP LOCKED');
    expect(body).toContain("status IN ('online', 'idle')");
    expect(body).toContain("w.last_heartbeat_at > NOW() - INTERVAL '120 seconds'");
  });

  it('keeps the single-active-attempt guarantee', () => {
    const body = functionBody();
    expect(body).toContain('IF EXISTS (');
    expect(body).toContain("WHERE a.status IN ('claimed', 'running')");
    expect(body).toContain('RETURN NULL');

    const workbench = fs.readFileSync(
      path.join(process.cwd(), 'migrations', '2026-11-22_pierrot_dev_workbench.sql'),
      'utf8'
    );
    expect(workbench).toContain('pierrot_dev_attempts_single_active_idx');
    expect(workbench).toContain("WHERE status IN ('claimed', 'running')");
  });

  it('cannot be used by anon/authenticated and does not rewrite history', () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.pierrot_dev_claim_task\(UUID, TEXT, INTEGER\)[\s\S]*FROM PUBLIC, anon, authenticated;/
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.pierrot_dev_claim_task\(UUID, TEXT, INTEGER\)[\s\S]*TO service_role;/
    );
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+COLUMN\b/i);
  });

  it('adds the actions worker kind without invalidating existing rows', () => {
    expect(migration).toContain("CHECK (kind IN ('codespace', 'local', 'actions'))");
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS pierrot_dev_workers_kind_check');
  });
});
