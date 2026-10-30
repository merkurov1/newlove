/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'migrations',
    '2026-10-30_z_create_pierrot_human_presence.sql'
  ),
  'utf8'
);

describe('PIERO HUMAN PRESENCE migration', () => {
  it('keeps the new tables closed by default', () => {
    for (const table of [
      'pierrot_human_requests',
      'pierrot_human_sessions',
      'pierrot_human_message_links',
    ]) {
      expect(migration).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`
      );
      expect(migration).toContain(
        `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated;`
      );
      expect(migration).toContain(`GRANT ALL ON TABLE public.${table} TO service_role;`);
    }

    expect(migration).not.toMatch(/CREATE POLICY[^;]+TO\s+(anon|authenticated)/i);
  });

  it('does not store the visitor recovery token in plaintext', () => {
    expect(migration).toContain('access_token_hash TEXT NOT NULL');
    expect(migration).toContain("access_token_hash ~ '^[0-9a-f]{64}$'");
    expect(migration).not.toMatch(/\baccess_token\s+TEXT\b/i);
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS pierrot_human_requests_token_idx'
    );
  });

  it('enforces the state machine and single-active-session invariants', () => {
    expect(migration).toContain(
      "status IN ('pending', 'active', 'closed', 'declined', 'expired')"
    );
    expect(migration).toContain('pierrot_human_requests_one_pending_idx');
    expect(migration).toContain('pierrot_human_requests_one_active_idx');
    expect(migration).toContain('pierrot_human_sessions_one_active_conversation_idx');
    expect(migration).toContain('pierrot_human_sessions_one_active_owner_idx');
    expect(migration).toContain("WHERE status = 'active'");
  });

  it('extends transcripts without duplicating message content', () => {
    expect(migration).toContain("CHECK (role IN ('user', 'assistant', 'human'))");
    expect(migration).toContain(
      'REFERENCES public.pierrot_messages(id) ON DELETE CASCADE'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS public.pierrot_human_message_links'
    );
    expect(migration).toContain('pierrot_human_message_links_telegram_idx');
    expect(migration).not.toMatch(/CREATE TABLE[^;]*pierrot_human_messages/i);
  });

  it('adds the human audit events to the existing event table', () => {
    for (const eventName of [
      'human_requested',
      'human_accepted',
      'human_declined',
      'human_expired',
      'human_closed',
      'human_message_sent',
      'human_message_received',
      'human_ai_blocked',
    ]) {
      expect(migration).toContain(`'${eventName}'`);
    }

    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.pierrot_record_event'
    );
    expect(migration).toContain('ON CONFLICT (conversation_id, event_key) DO NOTHING');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.pierrot_events/i);
  });

  it('keeps lifecycle functions server-only and idempotent', () => {
    for (const fn of [
      'pierrot_human_request_create',
      'pierrot_human_request_accept',
      'pierrot_human_request_decline',
      'pierrot_human_session_close',
      'pierrot_human_append_message',
    ]) {
      expect(migration).toContain(`FUNCTION public.${fn}`);
    }

    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.pierrot_human_append_message');
    expect(migration).not.toMatch(/GRANT[^;]+TO\s+(anon|authenticated)/i);
  });

  it('does not modify unrelated existing tables destructively', () => {
    expect(migration).not.toMatch(/DROP\s+TABLE\s+public\.pierrot_(conversations|messages|events)/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.pierrot_messages/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.pierrot_conversations/i);
  });
});
