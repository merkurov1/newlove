/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-11-10_pierrot_rate_limit.sql'),
  'utf8'
);

describe('Pierrot cross-instance rate limit migration', () => {
  it('creates one service-role-only atomic bucket', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.pierrot_rate_limits');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.pierrot_rate_limit');
    expect(migration).toContain('ON CONFLICT (key) DO UPDATE');
    expect(migration).toContain('REVOKE ALL ON TABLE public.pierrot_rate_limits');
    expect(migration).toContain('TO service_role');
  });

  it('returns allowed, remaining and retry_after', () => {
    expect(migration).toContain('allowed boolean');
    expect(migration).toContain('remaining integer');
    expect(migration).toContain('retry_after integer');
    expect(migration).toContain('allowed := v_count <= v_max');
  });
});
