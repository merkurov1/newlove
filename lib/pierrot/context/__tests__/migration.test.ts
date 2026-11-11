/** @jest-environment node */

import { readFileSync } from 'fs';
import { join } from 'path';

const migration = readFileSync(
  join(process.cwd(), 'migrations', '2026-12-03_pierrot_context_engine.sql'),
  'utf8'
);
const rollback = readFileSync(
  join(
    process.cwd(),
    'migrations',
    'rollback',
    '2026-12-03_pierrot_context_engine_rollback.sql'
  ),
  'utf8'
);

describe('context engine migration', () => {
  it('is additive and preserves original event time', () => {
    expect(migration).toContain('add column if not exists ingested_at');
    expect(migration).toContain('set ingested_at = created_at');
    expect(migration).not.toMatch(/drop\s+table\s+public\.pierrot_messages/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.pierrot_messages/i);
  });

  it('adds typed entities, relations, timeline and status history', () => {
    expect(migration).toContain('create table if not exists public.pierrot_entities');
    expect(migration).toContain("'BOOK'");
    expect(migration).toContain("'PROJECT'");
    expect(migration).toContain('create table if not exists public.pierrot_entity_relations');
    expect(migration).toContain("'SOURCE_WORK'");
    expect(migration).toContain('create table if not exists public.pierrot_project_events');
    expect(migration).toContain('create table if not exists public.pierrot_project_status_history');
  });

  it('backfills project entities without creating duplicate project rows', () => {
    expect(migration).toContain('insert into public.pierrot_entities');
    expect(migration).toContain('from public.pierrot_projects p');
    expect(migration).toContain('on conflict (owner_user_id, entity_type, canonical_name) do nothing');
    expect(migration).not.toMatch(/insert\s+into\s+public\.pierrot_projects/i);
  });

  it('derives typed workstreams from existing artifacts without new project rows', () => {
    expect(migration).toContain('from public.pierrot_project_artifacts a');
    expect(migration).toContain("when 'manuscript' then 'BOOK'");
    expect(migration).toContain("when 'SERIES' then 'HAS_SERIES'");
    expect(migration).toContain("when 'VIDEO' then 'HAS_VIDEO'");
    expect(migration).toContain('on conflict (owner_user_id, entity_type, canonical_name) do nothing');
  });

  it('has a rollback that only removes new objects', () => {
    expect(rollback).toContain('drop table if exists public.pierrot_project_events');
    expect(rollback).toContain('drop table if exists public.pierrot_entities');
    expect(rollback).not.toMatch(/drop\s+table\s+if\s+exists\s+public\.pierrot_messages/i);
    expect(rollback).not.toMatch(/drop\s+table\s+if\s+exists\s+public\.pierrot_projects/i);
    expect(rollback).toContain('drop column if exists ingested_at');
  });
});
