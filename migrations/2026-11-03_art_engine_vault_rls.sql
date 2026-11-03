-- ============================================================================
-- Art Engine — Stage 1 Vault privacy
--
-- STATUS: PROPOSED. Apply manually, after the application code that uses the
-- admin-only Vault API is deployed.
--
-- Before this migration `lots` had a `Public Read Access` policy with
-- `using (true)`, so every anonymous visitor could read drafts, parser errors
-- and AI dossiers through Supabase REST.
--
-- After this migration:
--   * anonymous users cannot read `lots`;
--   * authenticated administrators can read `lots` (existing browser UI and
--     server-side admin pages);
--   * service_role keeps full access (server routes);
--   * public `/lots` pages must explicitly filter `status = 'published'`.
-- ============================================================================

begin;

drop policy if exists "Public Read Access" on public.lots;
drop policy if exists "lots_admin_select" on public.lots;

create policy "lots_admin_select"
  on public.lots
  for select
  to authenticated
  using (public.is_current_user_admin());

revoke select on public.lots from anon;
grant select on public.lots to authenticated;

commit;
