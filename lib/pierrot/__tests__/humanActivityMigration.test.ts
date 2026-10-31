/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'migrations',
    '2026-10-31_z_restore_event_contract_and_human_activity.sql'
  ),
  'utf8'
);

describe('Pierrot event contract and human activity migration', () => {
  it('restores retrieval and commercial events dropped by earlier migrations', () => {
    for (const event of [
      'brain_retrieval',
      'answer_corrected',
      'interest_detected',
      'offer_eligible',
      'purchase_completed',
      'answer_feedback',
    ]) {
      expect(migration).toContain(`'${event}'`);
    }
  });

  it('keeps every human-presence event in the constraint and function', () => {
    for (const event of [
      'human_requested',
      'human_request_duplicate',
      'human_accepted',
      'human_declined',
      'human_expired',
      'human_closed',
      'human_message_sent',
      'human_message_received',
      'human_notification_failed',
      'human_ai_blocked',
    ]) {
      expect(migration).toContain(`'${event}'`);
    }
  });

  it('refreshes request/session activity when a human message is appended', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.pierrot_human_append_message');
    expect(migration).toMatch(
      /UPDATE public\.pierrot_human_requests\s+SET updated_at = NOW\(\)/i
    );
    expect(migration).toMatch(
      /UPDATE public\.pierrot_human_sessions\s+SET updated_at = NOW\(\)/i
    );
  });

  it('supports the unambiguous pending-owner fallback', () => {
    expect(migration).toContain('pierrot_human_requests_owner_pending_idx');
    expect(migration).toContain("WHERE status = 'pending'");
  });

  it('does not delete or rewrite transcript history', () => {
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.pierrot_(messages|conversations)/i);
    expect(migration).not.toMatch(/DROP\s+TABLE\s+public\.pierrot_/i);
  });
});
