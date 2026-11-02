/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-11-12_pierrot_identity_attribution.sql'),
  'utf8'
);

describe('Pierrot identity attribution migration', () => {
  it('adds additive attribution columns to the existing conversation table', () => {
    for (const column of [
      'identity_type',
      'visitor_id',
      'user_id',
      'identity_verified_at',
      'identity_source',
    ]) {
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }

    expect(migration).toContain("DEFAULT 'unknown'");
  });

  it('constrains identity values and the visitor pseudonym', () => {
    expect(migration).toContain("CHECK (identity_type IN ('owner', 'visitor', 'unknown'))");
    expect(migration).toContain("visitor_id ~ '^[A-Za-z0-9_-]{8,64}$'");
    expect(migration).toContain('pierrot_conversations_identity_consistency_check');
  });

  it('adds indexes for identity and visitor queries', () => {
    expect(migration).toContain('pierrot_conversations_identity_idx');
    expect(migration).toContain('pierrot_conversations_visitor_idx');
    expect(migration).toContain('pierrot_conversations_user_identity_idx');
  });

  it('does not guess historical identity', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.pierrot_conversations\s+SET\s+identity_type/i);
    expect(migration).toContain('Historical rows are intentionally not guessed');
  });

  it('does not change RLS, grants or destructive data operations', () => {
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(migration).not.toMatch(/\bGRANT\b/i);
  });
});
