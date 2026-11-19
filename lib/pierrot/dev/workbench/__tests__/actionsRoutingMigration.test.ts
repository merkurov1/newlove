/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-12-13_pierrot_actions_routing.sql'),
  'utf8'
);

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf('END $$;', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe('Actions routing migration', () => {
  it('adds a durable executor assignment and a dispatch marker', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS assigned_executor TEXT');
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS actions_dispatch_requested_at TIMESTAMPTZ'
    );
    expect(migration).toContain(
      "CHECK (assigned_executor IS NULL OR assigned_executor IN ('actions', 'codespace'))"
    );
    expect(migration).toContain('pierrot_dev_prompts_actions_dispatch_idx');
  });

  it('prevents a Codespace worker from claiming an Actions-assigned task', () => {
    const body = functionBody('pierrot_dev_claim_next_task');

    expect(body).toContain('AND (');
    expect(body).toContain('p.assigned_executor IS NULL');
    expect(body).toContain('p.assigned_executor = (');
    expect(body).toContain(
      'SELECT w.kind FROM public.pierrot_dev_workers w WHERE w.id = p_worker_id'
    );
    expect(body).toContain(") = 'actions'");
    expect(body).toContain("p.status = 'queued'");
    expect(body).toContain('PERFORM pg_advisory_xact_lock(7340219)');
    expect(body).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('accepts targeted claims only from an Actions worker and a routed task', () => {
    const body = functionBody('pierrot_dev_claim_task');

    expect(body).toContain("w.kind = 'actions'");
    expect(body).toContain('p.id = p_task_id');
    expect(body).toContain("p.status = 'queued'");
    expect(body).toContain("p.assigned_executor IS NULL OR p.assigned_executor = 'actions'");
    expect(body).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('keeps the one-active-attempt guarantee and never rewrites history', () => {
    const workbench = fs.readFileSync(
      path.join(process.cwd(), 'migrations', '2026-11-22_pierrot_dev_workbench.sql'),
      'utf8'
    );

    expect(workbench).toContain('pierrot_dev_attempts_single_active_idx');
    expect(workbench).toContain("WHERE status IN ('claimed', 'running')");
    expect(functionBody('pierrot_dev_claim_task')).toContain('IF EXISTS (');
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+COLUMN\b/i);
  });

  it('clears the dispatch marker only when the lease reaper requeues a task', () => {
    const body = functionBody('pierrot_dev_reap_expired_attempts');

    expect(body).toContain('actions_dispatch_requested_at = NULL');
    expect(body).toContain("assigned_executor = COALESCE(v_task.assigned_executor, 'actions')");
    expect(body).toContain("SET status = 'failed'");
  });
});
