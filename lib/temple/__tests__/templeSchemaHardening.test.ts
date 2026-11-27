import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

const PRIVACY = read('migrations/2026-11-27_temple_privacy_hardening.sql');
const ANALYTICS = read('migrations/2026-11-27_temple_analytics.sql');
const RECONCILE = read('migrations/2026-11-27_vigil_spark_metrics_reconcile.sql');
const CLAIM_ROUTE = read('app/api/vigil/claim/route.ts');
const CONTROLLER = read('app/vigil/useVigilController.ts');

describe('Temple database privacy hardening', () => {
  it('drops the stale raw temple_log policy and keeps clients out', () => {
    expect(PRIVACY).toContain(
      'drop policy if exists public_select_on_temple_log on public.temple_log'
    );
    expect(PRIVACY).toContain('revoke all on public.temple_log from anon, authenticated');
    expect(PRIVACY).toContain('alter table if exists public.temple_log enable row level security');
  });

  it('makes the Chronicle signal trigger-only, idempotent and path-safe', () => {
    expect(PRIVACY).toContain("set search_path = ''");
    expect(PRIVACY).toContain('where not exists');
    expect(PRIVACY).toContain(
      'revoke all on function public.record_temple_chronicle_signal() from public'
    );
    expect(PRIVACY).toContain(
      'revoke all on function public.record_temple_chronicle_signal() from anon, authenticated'
    );

    const functionBody = PRIVACY.slice(
      PRIVACY.indexOf('create or replace function public.record_temple_chronicle_signal'),
      PRIVACY.indexOf('-- The trigger still fires')
    );

    expect(functionBody).toContain('public_name');
    expect(functionBody).toContain('event_type');
    expect(functionBody).toContain('occurred_at');
    expect(functionBody).not.toContain('user_id');
    expect(functionBody).not.toContain('email');
    expect(functionBody).not.toContain('identity_key');
  });

  it('exposes only public-safe vigil_hearts columns and stops raw realtime', () => {
    expect(PRIVACY).toContain(
      'revoke select on table public.vigil_hearts from anon, authenticated'
    );
    expect(PRIVACY).toContain('grant select (');
    expect(PRIVACY).toContain('owner_name');
    expect(PRIVACY).toContain('last_lit_at');
    expect(PRIVACY).toContain('alter publication supabase_realtime drop table public.vigil_hearts');

    const grantBlock = PRIVACY.slice(
      PRIVACY.indexOf('grant select ('),
      PRIVACY.indexOf('-- Never broadcast the full row')
    );

    expect(grantBlock).not.toContain('owner_id');
    expect(grantBlock).not.toContain('intention');
  });

  it('removes the obsolete five-heart cap without deleting heart data', () => {
    expect(PRIVACY).toContain("pg_get_constraintdef(oid) ilike '%<= 5%'");
    expect(PRIVACY).toContain('vigil_hearts_id_positive_check');
    expect(PRIVACY).not.toMatch(/delete\s+from\s+public\.vigil_hearts/i);
    expect(PRIVACY).not.toMatch(/truncate\s+public\.vigil_hearts/i);
    expect(CLAIM_ROUTE).not.toContain('heartId > 5');
    expect(CLAIM_ROUTE).not.toMatch(/heartId\s*>\s*5/);
  });

  it('keeps the claim readback and client query on safe columns', () => {
    expect(CLAIM_ROUTE).toContain(
      "select('id,owner_name,last_lit_at,is_locked,created_at,updated_at')"
    );
    expect(CLAIM_ROUTE).not.toContain("select('*')");
    expect(CONTROLLER).toContain("select('id, owner_name, last_lit_at')");
    expect(CONTROLLER).not.toContain("select('id, owner_name, intention')");
    expect(CONTROLLER).toContain("table: 'temple_chronicle_signals'");
    expect(CONTROLLER).not.toContain("table: 'vigil_hearts'");
  });

  it('revokes the lifetime trigger from clients', () => {
    expect(PRIVACY).toContain(
      'revoke all on function public.record_vigil_spark_count() from anon, authenticated'
    );
    expect(RECONCILE).toContain(
      'revoke all on function public.record_vigil_spark_count() from anon, authenticated'
    );
  });
});

describe('Temple analytics schema privacy', () => {
  it('makes event keys idempotent and keeps tables service-role only', () => {
    expect(ANALYTICS).toContain('event_key text not null unique');
    expect(ANALYTICS).toContain(
      'alter table public.temple_analytics_events enable row level security'
    );
    expect(ANALYTICS).toContain(
      'revoke all on table public.temple_analytics_events from public, anon, authenticated'
    );
    expect(ANALYTICS).toContain(
      'revoke all on table public.temple_analytics_sessions from public, anon, authenticated'
    );
  });

  it('stores only pseudonymous analytics fields', () => {
    const eventTable = ANALYTICS.slice(
      ANALYTICS.indexOf('create table if not exists public.temple_analytics_events'),
      ANALYTICS.indexOf('comment on table public.temple_analytics_events')
    );

    for (const forbidden of [
      'user_id',
      'telegram_id',
      'email',
      'display_name',
      'identity_key',
      'message',
      'confession',
      'owner_id',
      'intention',
    ]) {
      expect(eventTable).not.toContain(forbidden);
    }

    expect(eventTable).toContain('visitor_key');
    expect(eventTable).toContain('session_key');
  });

  it('ships the missing Vigil metrics as an idempotent forward migration', () => {
    expect(RECONCILE).toContain('create table if not exists public.vigil_spark_stats');
    expect(RECONCILE).toContain('create or replace view public.vigil_spark_metrics');
    expect(RECONCILE).toContain(
      'revoke all on public.vigil_spark_metrics from public, anon, authenticated'
    );
    expect(RECONCILE).toContain('security definer');
    expect(RECONCILE).toContain("set search_path = ''");
  });
});
