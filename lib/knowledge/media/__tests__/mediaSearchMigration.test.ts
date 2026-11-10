/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-11-10_media_search_publication_level.sql'),
  'utf8'
);
const rollback = fs.readFileSync(
  path.join(
    process.cwd(),
    'migrations',
    'rollback',
    '2026-11-10_media_search_publication_level_rollback.sql'
  ),
  'utf8'
);

describe('Publication-level media search migration', () => {
  it('returns one best chunk per publication', () => {
    expect(migration).toContain('row_number() OVER');
    expect(migration).toContain('PARTITION BY d.id');
    expect(migration).toContain('publication_rank = 1');
  });

  it('keeps the embedding model and access contract', () => {
    expect(migration).toContain('p_dimensions <> 1024');
    expect(migration).toContain("p_access_class NOT IN ('public', 'owner')");
    expect(migration).toContain('c.access_class = p_access_class');
    expect(migration).toContain('d.access_class = p_access_class');
  });

  it('rejects empty query embeddings and unrelated results', () => {
    expect(migration).toContain('invalid_query_embedding');
    expect(migration).toContain('p_min_similarity DOUBLE PRECISION DEFAULT 0.25');
    expect(migration).toContain('>= p_min_similarity');
  });

  it('does not retrieve unpublished archive records', () => {
    expect(migration).toContain("m.status = 'published'");
  });

  it('ships a reversible rollback that restores chunk-level search', () => {
    expect(rollback).toContain('p_min_similarity DOUBLE PRECISION DEFAULT -1');
    expect(rollback).toContain('ORDER BY c.embedding <=> p_query_embedding');
    expect(rollback).not.toContain('publication_rank = 1');
  });
});
