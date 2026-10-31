/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-11-05_unified_brain_source_ingestion.sql'),
  'utf8'
);

describe('unified Brain source migration', () => {
  it('adds source metadata without recreating knowledge tables', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS source_format');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS source_sha256');
    expect(migration).toContain('knowledge_documents_file_source_uidx');
    expect(migration).not.toMatch(/DROP\s+TABLE\s+public\.knowledge_documents/i);
    expect(migration).not.toMatch(/DROP\s+TABLE\s+public\.knowledge_chunks/i);
    expect(migration).not.toMatch(/TRUNCATE\s+public\.knowledge/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.knowledge/i);
  });

  it('allows all four source types and keeps originals private', () => {
    for (const value of ['article', 'media_coverage', 'pdf', 'txt', 'text']) {
      expect(migration).toContain(`'${value}'`);
    }

    expect(migration).toContain("'brain-sources'");
    expect(migration).toContain('false');
    expect(migration).not.toMatch(/public\s*=\s*true/i);
    expect(migration).not.toMatch(/CREATE\s+PUBLIC\s+URL/i);
  });

  it('stores checksums and keeps large files out of JSONB', () => {
    expect(migration).toContain('source_sha256 ~');
    expect(migration).toContain('storage_path');
    expect(migration).not.toMatch(/jsonb[^;]*source_content/i);
    expect(migration).not.toMatch(/base64/i);
  });
});
