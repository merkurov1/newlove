/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations/2026-12-07_create_question_domain.sql'),
  'utf8'
);

const seed = fs.readFileSync(
  path.join(process.cwd(), 'migrations/2026-12-07_seed_question_bank.sql'),
  'utf8'
);

describe('Question database migration', () => {
  it('creates the minimal domain with a one-answer-per-user constraint', () => {
    expect(migration).toContain('create table if not exists public.questions');
    expect(migration).toContain('create table if not exists public.question_answers');
    expect(migration).toContain('create table if not exists public.question_syntheses');
    expect(migration).toContain('unique (question_id, user_id)');
    expect(migration).toContain('references auth.users(id)');
  });

  it('enables RLS and removes every anon/authenticated table privilege', () => {
    expect(migration).toMatch(/alter table public\.questions enable row level security/i);
    expect(migration).toMatch(/alter table public\.question_answers enable row level security/i);
    expect(migration).toMatch(/alter table public\.question_syntheses enable row level security/i);

    for (const table of ['questions', 'question_answers', 'question_syntheses']) {
      expect(migration).toMatch(
        new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i')
      );
    }

    expect(migration).not.toMatch(/create policy/i);
  });

  it('grants the private functions to service_role only', () => {
    for (const fn of [
      'question_submit_answer',
      'question_record_answer',
      'question_claim_synthesis',
      'question_complete_synthesis',
      'question_fail_synthesis',
      'question_public_page',
    ]) {
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\)\\s+from public, anon, authenticated`, 'i')
      );
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\)\\s+to service_role`, 'i')
      );
    }
  });

  it('claims synthesis atomically with a token and a lease', () => {
    expect(migration).toContain('question_claim_synthesis');
    expect(migration).toContain('generation_token');
    expect(migration).toContain("interval '5 minutes'");
    expect(migration).toContain('attempts < 8');
    expect(migration).toContain('dirty');
  });

  it('the public read function never returns answer text', () => {
    const start = migration.indexOf('create or replace function public.question_public_page');
    const body = migration.slice(start, start + 1200);

    expect(body).toContain('s.content as synthesis_content');
    expect(body).toContain('has_answers');
    expect(body).not.toContain('a.content');
  });

  it('seeds ten questions idempotently', () => {
    const tuples = (seed.match(/\('.*?', 'active'\)/g) || []).length;
    expect(tuples).toBe(10);
    expect(seed).toContain('on conflict (question) do nothing');
  });
});
