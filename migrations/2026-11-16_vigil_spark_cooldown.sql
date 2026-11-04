-- Vigil spark cooldown (one valid spark per identity per 24 hours).
--
-- Why this migration is required
-- ------------------------------
-- The previous code checked the public `temple_log` table from the browser and
-- trusted a display name. A direct API call could bypass that check. A unique
-- constraint or trigger on `temple_log` cannot express a sliding 24-hour window,
-- so the cooldown needs its own small private table.
--
-- The conditional UPDATE used by /api/vigil/claim is the concurrency lock:
-- PostgreSQL serialises competing updates on the primary key and only the first
-- row whose `last_spark_at <= now() - interval '24 hours'` is updated. A second
-- simultaneous request therefore receives no row and is rejected.
--
-- The table is private: RLS is enabled, no policies are created, and anon /
-- authenticated receive no grants. Only the service role used by the route can
-- read or write it.

create table if not exists public.vigil_spark_claims (
  identity_key text primary key,
  display_name text not null default '',
  heart_id integer,
  last_spark_at timestamptz not null default 'epoch',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.vigil_spark_claims is
  'Private per-identity Vigil spark cooldown. identity_key is tg:<telegram id> or sb:<supabase uuid>; display names are never used as keys.';

alter table public.vigil_spark_claims enable row level security;

revoke all on table public.vigil_spark_claims from anon, authenticated;
grant all on table public.vigil_spark_claims to service_role;

-- Optional operational cleanup (does not affect the 24-hour decision):
-- delete rows whose last spark is older than one year.
-- delete from public.vigil_spark_claims
-- where last_spark_at < now() - interval '365 days';
