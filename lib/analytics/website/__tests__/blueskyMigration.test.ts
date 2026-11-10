/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-12-02_public_presence_bluesky.sql'),
  'utf8'
);

describe('Bluesky public presence migration', () => {
  it('extends the existing analytics provider checks instead of creating a parallel table', () => {
    expect(migration).toContain("'bluesky'");
    expect(migration).toContain('analytics_metrics_daily_provider_check');
    expect(migration).toContain('analytics_connections_provider_check');
    expect(migration).not.toMatch(/create table.*bluesky/i);
  });

  it('keeps the existing metrics grain and adds only a lookup index', () => {
    expect(migration).toContain('analytics_metrics_daily_bluesky_post_idx');
    expect(migration).toContain('report_type = \'post\'');
  });
});
