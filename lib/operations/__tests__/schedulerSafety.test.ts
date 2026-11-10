/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

describe('scheduler safety', () => {
  it('keeps Vercel cron declarations within the Hobby plan limit', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };

    // Vercel Hobby allows at most two cron jobs and no schedule more frequent
    // than once per day. Higher-frequency work is handled by Supabase pg_cron.
    expect(vercel.crons?.length ?? 0).toBeLessThanOrEqual(2);

    for (const cron of vercel.crons ?? []) {
      expect(cron.path).toMatch(/^\/api\/cron\//);
      expect(cron.schedule).toMatch(/^\S+\s+\S+\s+\*\s+\*\s+\*$/);
    }
  });

  it('does not add a pg_cron schedule in the resource safety migration', () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), 'migrations/2026-11-11_resource_safety.sql'),
      'utf8'
    );

    expect(migration).not.toMatch(/cron\.schedule\s*\(/i);
    expect(migration).not.toMatch(/cron\.unschedule\s*\(/i);
    expect(migration).not.toMatch(/net\.http_post\s*\(/i);
  });
});
