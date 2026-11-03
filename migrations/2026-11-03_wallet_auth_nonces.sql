-- Migration: single-use wallet login nonces
-- Date: 2026-11-03
--
-- STATUS: prepared for manual review. Do not apply automatically.
--
-- Wallet login must prove a fresh, one-time challenge. The nonce row is
-- created server-side, expires after 10 minutes and is consumed atomically by
-- /api/auth/wallet. No personal data is stored.

begin;

create table if not exists public.wallet_auth_nonces (
  id uuid primary key default gen_random_uuid(),
  nonce text not null unique
    check (nonce ~ '^[A-Za-z0-9_-]{16,80}$'),
  wallet_address text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists wallet_auth_nonces_expires_idx
  on public.wallet_auth_nonces (expires_at);

alter table public.wallet_auth_nonces enable row level security;
revoke all on table public.wallet_auth_nonces from public, anon, authenticated;
grant all on table public.wallet_auth_nonces to service_role;

comment on table public.wallet_auth_nonces is
  'Single-use SIWE challenges. Service-role only; rows expire after 10 minutes.';

commit;
