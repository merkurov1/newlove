/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

describe('scheduler safety', () => {
  it('does not declare Vercel cron jobs', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons?: unknown;
    };

    expect(vercel.crons).toBeUndefined();
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
