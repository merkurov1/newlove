/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'migrations/2026-12-10_question_answer_notifications.sql'
  ),
  'utf8'
);

describe('Question notification migration', () => {
  it('adds subscriptions, one-time tokens and a delivery log', () => {
    expect(migration).toContain('create table if not exists public.question_subscriptions');
    expect(migration).toContain(
      'create table if not exists public.question_subscription_tokens'
    );
    expect(migration).toContain(
      'create table if not exists public.question_answer_notifications'
    );
    expect(migration).toContain('references public.questions(id) on delete cascade');
  });

  it('enforces one notification per answer + subscription + channel', () => {
    expect(migration).toMatch(
      /unique \(answer_id, subscription_id, channel\)/i
    );
    expect(migration).toMatch(
      /constraint question_answer_notifications_event_unique/i
    );
  });

  it('enqueues only on a saved human answer, after the insert', () => {
    expect(migration).toMatch(
      /create trigger question_answers_enqueue_notifications\s+after insert on public\.question_answers/i
    );
    expect(migration).toContain("s.email_status = 'active'");
    expect(migration).toContain("s.telegram_status = 'active'");
    expect(migration).toContain('on conflict (answer_id, subscription_id, channel) do nothing');
    // Enqueue failures must never roll back the human answer.
    expect(migration).toContain('exception when others then');
    expect(migration).toContain('raise warning');
  });

  it('stores only hashed, expiring, single-use tokens', () => {
    expect(migration).toContain("token_hash ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain('expires_at timestamptz not null');
    expect(migration).toContain('used_at timestamptz');
    expect(migration).toContain('token_hash text not null unique');
    expect(migration).not.toMatch(/token text not null/i);
  });

  it('enables RLS and grants the feature tables to service_role only', () => {
    for (const table of [
      'question_subscriptions',
      'question_subscription_tokens',
      'question_answer_notifications',
    ]) {
      expect(migration).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, 'i')
      );
      expect(migration).toMatch(
        new RegExp(
          `revoke all on table public\\.${table} from public, anon, authenticated`,
          'i'
        )
      );
      expect(migration).toMatch(
        new RegExp(`grant all on table public\\.${table} to service_role`, 'i')
      );
    }
  });

  it('does not put answer text into the delivery queue', () => {
    const tableStart = migration.indexOf(
      'create table if not exists public.question_answer_notifications'
    );
    const tableBody = migration.slice(tableStart, tableStart + 1400);

    expect(tableBody).toContain('answer_id uuid not null');
    expect(tableBody).not.toContain('content');
  });

  it('claims due rows with a lease and records attempts / errors / sent time', () => {
    expect(migration).toContain('question_claim_answer_notifications');
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain("attempts = n.attempts + 1");
    expect(migration).toContain("interval '5 minutes'");
    expect(migration).toContain('question_complete_answer_notification');
    expect(migration).toContain('last_error');
    expect(migration).toContain('sent_at');
    expect(migration).toContain('next_attempt_at');
  });

  it('reuses the existing scheduler instead of adding a new cron', () => {
    expect(migration).toContain('/api/cron/question-notifications');
    expect(migration).toContain('create or replace function public.brain_worker_tick');
    expect(migration).not.toContain('cron.schedule');
  });

  it('revokes new functions from public roles', () => {
    for (const fn of [
      'question_answer_enqueue_notifications',
      'question_claim_answer_notifications',
      'question_complete_answer_notification',
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function public\\.${fn}\\([^)]*\\)\\s+from public, anon, authenticated`,
          'i'
        )
      );
    }
  });
});
