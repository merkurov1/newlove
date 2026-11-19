/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-12-14_pierrot_personal_assistant.sql'),
  'utf8'
);

describe('personal assistant migration security', () => {
  it('creates a profile keyed by Telegram user id and isolated tables', () => {
    expect(migration).toContain('public.pierrot_assistant_profiles');
    expect(migration).toContain('public.pierrot_assistant_messages');
    expect(migration).toContain('public.pierrot_assistant_memories');
    expect(migration).toContain('telegram_user_id bigint not null unique');
    expect(migration).toContain(
      'references public.pierrot_assistant_profiles (id) on delete cascade'
    );
  });

  it('enables RLS and grants access only to the service role', () => {
    for (const table of [
      'pierrot_assistant_profiles',
      'pierrot_assistant_messages',
      'pierrot_assistant_memories',
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY;`,
          'i'
        )
      );
      expect(migration).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+FROM\\s+public,\\s*anon,\\s*authenticated;`,
          'i'
        )
      );
      expect(migration).toMatch(
        new RegExp(`GRANT\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${table}\\s+TO\\s+service_role;`, 'i')
      );
    }
  });

  it('creates no anonymous/authenticated policy and no SECURITY DEFINER function', () => {
    expect(migration).not.toMatch(/CREATE POLICY[^;]+TO\s+(anon|authenticated)/i);
    expect(migration).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it('does not touch owner history, Brain, projects or decisions', () => {
    for (const forbidden of [
      'pierrot_decisions',
      'pierrot_messages',
      'pierrot_conversations',
      'brain_',
      'pierrot_projects',
    ]) {
      expect(migration).not.toContain(forbidden);
    }
  });
});
