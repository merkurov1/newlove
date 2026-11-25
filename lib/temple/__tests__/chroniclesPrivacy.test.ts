import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function read(file: string) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

const MIGRATION =
  'migrations/2026-11-25_temple_chronicles_public_memory.sql';

describe('Temple chronicle privacy and database contract', () => {
  it('keeps temple_log service-role only and exposes a public-safe signal', () => {
    const sql = read(MIGRATION);

    expect(sql).toContain('alter table if exists public.temple_log enable row level security');
    expect(sql).toContain('revoke all on public.temple_log from anon, authenticated');
    expect(sql).toContain('create table if not exists public.temple_chronicle_signals');
    expect(sql).toContain('temple_chronicle_signals_public_read');
    expect(sql).toContain('grant select on public.temple_chronicle_signals to anon, authenticated');
    expect(sql).not.toMatch(/grant select[\s\S]*user_id/i);
  });

  it('never copies private columns into the realtime signal', () => {
    const sql = read(MIGRATION);
    const functionBody = sql.slice(
      sql.indexOf('create or replace function public.record_temple_chronicle_signal'),
      sql.indexOf('drop trigger if exists temple_log_chronicle_signal')
    );

    expect(functionBody).toContain('public_name');
    expect(functionBody).toContain('event_type');
    expect(functionBody).toContain('occurred_at');
    expect(functionBody).not.toContain('user_id');
    expect(functionBody).not.toContain('message');
    expect(functionBody).not.toContain('email');
  });

  it('adds stable keyset indexes for the chronology and the window aggregate', () => {
    const sql = read(MIGRATION);

    expect(sql).toContain('temple_log_chronicles_order_idx');
    expect(sql).toContain('(created_at desc, id desc)');
    expect(sql).toContain('temple_log_event_type_created_idx');
    expect(sql).toContain('upper(event_type)');
  });

  it('queries only allowlisted columns for the public timeline', () => {
    const server = read('lib/temple/chronicles.server.ts');

    expect(server).toContain(
      'id,event_type,author,created_at,is_public_identity'
    );
    expect(server).not.toContain("select('id,event_type,author,message");
    expect(server).not.toContain('user_id');
  });

  it('subscribes to the public signal, not the raw temple_log row', () => {
    const hook = read('hooks/useTempleChronicles.ts');
    const vigil = read('hooks/useVigilSupporters.ts');
    const tribute = read('app/tribute/TributeExperience.tsx');

    expect(hook).toContain("table: 'temple_chronicle_signals'");
    expect(vigil).toContain("table: 'temple_chronicle_signals'");
    expect(tribute).toContain("table: 'temple_chronicle_signals'");
    expect(hook).not.toContain("table: 'temple_log'");
    expect(vigil).not.toContain("table: 'temple_log'");
  });
});
