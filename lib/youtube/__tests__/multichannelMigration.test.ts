/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'migrations', '2026-12-15_youtube_multichannel.sql'),
  'utf8'
);

const TABLES = [
  'youtube_oauth_connections',
  'youtube_channels',
  'youtube_project_bindings',
];

describe('multi-channel YouTube migration security contract', () => {
  it('keeps all three owner tables service-role only', () => {
    for (const table of TABLES) {
      expect(migration).toContain(`public.${table}`);
      expect(migration).toMatch(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`, 'i')
      );
      expect(migration).toMatch(
        new RegExp(`revoke all on public\\.${table} from anon, authenticated`, 'i')
      );
    }
  });

  it('does not add a broad client policy for YouTube owner data', () => {
    expect(migration).not.toMatch(/create policy/i);
    expect(migration).not.toMatch(/grant (select|all) .* to (anon|authenticated)/i);
  });

  it('enforces one active channel per project while allowing a channel in several projects', () => {
    expect(migration).toContain('youtube_project_bindings_active_project_idx');
    expect(migration).toContain('(owner_id, project_slug)');
    expect(migration).toMatch(/where\s+is_active/i);
    expect(migration).toContain('youtube_project_bindings_channel_idx');
  });

  it('never stores plaintext token columns in channel or binding tables', () => {
    const channelTable = migration.slice(
      migration.indexOf('create table if not exists public.youtube_channels'),
      migration.indexOf('create index if not exists youtube_channels_owner_idx')
    );
    const bindingTable = migration.slice(
      migration.indexOf('create table if not exists public.youtube_project_bindings'),
      migration.indexOf('youtube_project_bindings_active_project_idx')
    );

    expect(channelTable).not.toMatch(/token/i);
    expect(bindingTable).not.toMatch(/token/i);
  });
});
