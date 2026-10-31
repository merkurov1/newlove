/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-11-06_autonomous_brain_worker.sql'),
  'utf8'
);

describe('autonomous worker migration', () => {
  it('adds graph backoff and keeps the atomic claim RPC', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS retry_after');
    expect(migration).toContain('FOR UPDATE SKIP LOCKED');
    expect(migration).toContain('retry_after IS NULL OR retry_after <= now()');
    expect(migration).toContain('brain_graph_jobs_processing_lease_idx');
  });

  it('adds owner-only worker telemetry', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.brain_worker_runs');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain(
      'REVOKE ALL ON TABLE public.brain_worker_runs FROM PUBLIC, anon, authenticated'
    );
    expect(migration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE');
  });

  it('uses Vault secrets and never embeds a cron secret in SQL', () => {
    expect(migration).toContain('brain_worker_base_url');
    expect(migration).toContain('brain_worker_cron_secret');
    expect(migration).toContain('vault.decrypted_secrets');
    expect(migration).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/);
    expect(migration).toContain("'*/5 * * * *'");
  });

  it('serializes active jobs per source/document without deleting history', () => {
    expect(migration).toContain('brain_ingestion_jobs_active_url_uidx');
    expect(migration).toContain('brain_graph_jobs_active_document_uidx');
    expect(migration).toContain("status = 'cancelled'");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.brain_graph_jobs/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.brain_ingestion_jobs/i);
    expect(migration).not.toMatch(/TRUNCATE\s+public\.brain_/i);
  });
});
