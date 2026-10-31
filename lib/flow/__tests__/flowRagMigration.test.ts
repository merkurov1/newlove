/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-11-09_flow_ai_public_rag.sql'),
  'utf8'
);

describe('Flow AI public RAG migration', () => {
  it('keeps every document owner-only by default', () => {
    expect(migration).toContain(
      'public_retrieval_allowed boolean NOT NULL DEFAULT false'
    );
    expect(migration).toContain(
      "source_type NOT IN ('manuscript', 'personal_writing')"
    );
  });

  it('adds per-item RAG and full generation provenance', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS rag_allowed boolean NOT NULL DEFAULT true');
    expect(migration).toContain('retrieval_status');
    expect(migration).toContain('source_document_ids');
    expect(migration).toContain('source_titles');
    expect(migration).toContain('source_refs jsonb');
    expect(migration).toContain('generation_version');
    expect(migration).toContain('flow_ai_context_source_refs_check');
  });

  it('requires an explicit document allowlist and service-role-only execution', () => {
    expect(migration).toContain('brain_search_flow_public');
    expect(migration).toContain('p_document_ids');
    expect(migration).toContain('array_length(p_document_ids, 1) IS NULL');
    expect(migration).toContain('RETURN;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.brain_search_flow_public');
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.brain_search_flow_public'
    );
    expect(migration).toContain('TO service_role');
  });

  it('does not rewrite or regenerate existing Flow contexts', () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.flow_ai_context\s+SET\s+content/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.flow_ai_context/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.flow_ai_context/i);
  });
});
