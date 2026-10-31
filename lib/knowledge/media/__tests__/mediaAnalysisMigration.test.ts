/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-11-08_media_analysis_queue.sql'),
  'utf8'
);

describe('Media analysis queue migration', () => {
  it('adds bounded retries, leases and one active run per publication', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS attempt');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS max_attempts');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS retry_after');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS lease_expires_at');
    expect(migration).toContain('media_analysis_runs_active_uidx');
    expect(migration).toContain("WHERE status IN ('pending', 'processing')");
  });

  it('claims jobs atomically with SKIP LOCKED and recovers expired leases', () => {
    expect(migration).toContain('media_claim_next_analysis_run');
    expect(migration).toContain('FOR UPDATE SKIP LOCKED');
    expect(migration).toContain('media_analysis_lease_expired');
    expect(migration).toContain('retry_after <= now()');
  });

  it('keeps history and prevents duplicate current quotes', () => {
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.media_analysis_runs/i);
    expect(migration).not.toMatch(/TRUNCATE\s+public\.media_analysis_runs/i);
    expect(migration).toContain('media_quotes_current_uidx');
    expect(migration).toContain('WHERE is_current = true');
  });

  it('adds participants and organizations for current analysis only', () => {
    expect(migration).toContain('media_analysis_entities');
    expect(migration).toContain("entity_type IN ('person', 'organization')");
    expect(migration).toContain('is_current boolean NOT NULL DEFAULT true');
  });
});
