/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-11-07_media_source_ingestion.sql'),
  'utf8'
);
const route = fs.readFileSync(
  path.join(process.cwd(), 'app', 'api', 'admin', 'media-records', 'route.ts'),
  'utf8'
);

describe('Media Archive source migration', () => {
  it('adds independent indexing status and source metadata', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS author');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS source_format');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS content_hash');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS source_path');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS source_sha256');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS extraction_diagnostics');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS indexing_status');
    expect(migration).toContain('media_archive_records_indexing_status_check');
  });

  it('preserves existing records and allows captured HTML sources', () => {
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.media_archive_records/i);
    expect(migration).not.toMatch(/TRUNCATE\s+public\.media_archive_records/i);
    expect(migration).toContain("(pdf|txt|html)");
    expect(migration).toContain("'not_indexed'");
  });

  it('saves from the verified preview source instead of fetching again', () => {
    expect(route).toContain('downloadVerified');
    expect(route).toContain('storedSourceFromBody');
    expect(route).not.toContain('extractMediaPage');
    expect(route).toContain('enqueueMediaCoverageJob');
  });
});
