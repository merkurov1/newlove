/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

function stripSqlComments(sql: string): string {
  let output = '';
  let index = 0;
  let inSingleQuote = false;

  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];

    if (inSingleQuote) {
      output += current;
      if (current === "'") {
        if (next === "'") {
          output += next;
          index += 2;
          continue;
        }
        inSingleQuote = false;
      }
      index += 1;
      continue;
    }

    if (current === "'") {
      inSingleQuote = true;
      output += current;
      index += 1;
      continue;
    }

    if (current === '-' && next === '-') {
      while (index < sql.length && sql[index] !== '\n') index += 1;
      continue;
    }

    if (current === '/' && next === '*') {
      index += 2;
      while (index < sql.length && !(sql[index] === '*' && sql[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }

    output += current;
    index += 1;
  }

  return output;
}

const migrationPath = path.join(
  process.cwd(),
  'migrations',
  '2026-12-15_brain_hybrid_hnsw_planner.sql'
);
const rollbackPath = path.join(
  process.cwd(),
  'migrations',
  'rollback',
  '2026-12-15_brain_hybrid_hnsw_planner_rollback.sql'
);
const previousPath = path.join(process.cwd(), 'migrations', '2026-11-03_brain_hybrid_hnsw_fix.sql');

const rawMigration = readFileSync(migrationPath, 'utf8');
const rawRollback = readFileSync(rollbackPath, 'utf8');
const rawPrevious = readFileSync(previousPath, 'utf8');
const migration = stripSqlComments(rawMigration);
const rollback = stripSqlComments(rawRollback);

describe('Brain HNSW planner migration', () => {
  it('does not use global planner, role or database settings', () => {
    expect(migration).not.toMatch(/alter\s+database/i);
    expect(migration).not.toMatch(/alter\s+role/i);
    expect(migration).not.toMatch(/\bset\s+enable_/i);
    expect(migration).not.toMatch(/\bset\s+hnsw\./i);
    expect(migration).not.toMatch(/\bset\s+session\b/i);
    expect(migration).not.toMatch(/\bset\s+local\b/i);
  });

  it('does not create, drop or rebuild an index', () => {
    expect(migration).not.toMatch(/create\s+(unique\s+)?index/i);
    expect(migration).not.toMatch(/drop\s+index/i);
    expect(migration).not.toMatch(/reindex/i);
  });

  it('does not modify or delete data', () => {
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bupdate\s+public\./i);
    expect(migration).not.toMatch(/\binsert\s+into\s+public\./i);
  });

  it('applies every planner hint transaction-locally and restores it', () => {
    expect(migration).toMatch(/set_config\('enable_seqscan',\s*'off',\s*true\)/);
    expect(migration).toMatch(/set_config\('enable_sort',\s*'off',\s*true\)/);
    expect(migration).toMatch(/set_config\('hnsw\.ef_search',\s*p_ef_search::text,\s*true\)/);

    expect(migration).toMatch(/set_config\('enable_seqscan',\s*v_prior_seqscan,\s*true\)/);
    expect(migration).toMatch(/set_config\('enable_sort',\s*v_prior_sort,\s*true\)/);
    expect(migration).toMatch(
      /set_config\('hnsw\.ef_search',\s*coalesce\(v_prior_ef_search,\s*'40'\),\s*true\)/
    );
  });

  it('keeps the HNSW probe bounded and defaults ef_search to 120', () => {
    expect(migration).toMatch(/p_ef_search\s+integer\s+default\s+120/i);
    expect(migration).toMatch(/p_ef_search\s*<\s*40/);
    expect(migration).toMatch(/order by c\.embedding <=> p_query_embedding/);
    expect(migration).toMatch(/limit p_limit/);
  });

  it('preserves candidate limits, lexical GIN filtering and RRF fusion', () => {
    expect(migration).toMatch(/least\(greatest\(p_match_count \* 2, 40\), 120\)/);
    expect(migration).toMatch(/@@ v_tsquery/);
    expect(migration).toMatch(/full outer join lexical_ranked/);
    expect(migration).toMatch(/1\.0 \/ \(60 \+ v\.vector_rank\)/);
    expect(migration).toMatch(/limit p_match_count/);
  });

  it('preserves scopes, filters and the service-role-only contract', () => {
    expect(migration).toMatch(/c\.access_class = p_access_class/);
    expect(migration).toMatch(/d\.access_class = p_access_class/);
    expect(migration).toMatch(/c\.document_id = any \(p_document_ids\)/);
    expect(migration).toMatch(/p_source_types is null or d\.source_type = any/);
    expect(migration).toMatch(/p_source_domains is null/);
    expect(migration).toMatch(/p_min_similarity/);
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = public, pg_temp/i);
    expect(migration).toMatch(/revoke all on function public\.brain_search_hybrid/);
    expect(migration).toMatch(/grant execute on function public\.brain_search_hybrid/);
    expect(migration).toMatch(/to service_role;/);
  });

  it('routes the hybrid vector branch through the bounded helper', () => {
    expect(migration).toMatch(/public\.brain_vector_candidates\(/);
    expect(migration).toMatch(/v_candidate_limit,\s*120/);
    expect(migration).toMatch(/from public\.brain_vector_candidates\(/);
  });

  it('forces HNSW only for the whole-Brain path and preserves scoped defaults', () => {
    expect(migration).toMatch(/if p_document_ids is null then/);
    expect(rawMigration).toContain('Document-scoped path');
    expect(migration).toMatch(/and c\.document_id = any \(p_document_ids\)/);
  });

  it('keeps the previous migration and index definition intact', () => {
    expect(rawPrevious).toContain('knowledge_chunks_embedding_hnsw_idx');
    expect(rawPrevious).not.toContain('set_config');
    expect(rawPrevious).toContain('order by c.embedding <=> p_query_embedding');
  });
});

describe('Brain HNSW planner rollback', () => {
  it('restores the previous hybrid function and removes only the helper', () => {
    expect(rollback).toMatch(/create or replace function public\.brain_search_hybrid/);
    expect(rollback).toMatch(/drop function if exists public\.brain_vector_candidates/);
    expect(rollback).toMatch(/full outer join lexical_ranked/);
  });

  it('does not remove the HNSW index or touch data', () => {
    expect(rollback).not.toMatch(/drop\s+index/i);
    expect(rollback).not.toMatch(/reindex/i);
    expect(rollback).not.toMatch(/\bdelete\s+from\b/i);
    expect(rollback).not.toMatch(/\btruncate\b/i);
    expect(rollback).not.toMatch(/set_config/);
  });
});
