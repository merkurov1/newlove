-- SQL: RBAC setup for roles/user_roles, automatic assignment and JWT custom claim
-- Run in Supabase SQL editor as a privileged user (must have rights to create functions and triggers)

-- 1. Ensure roles/user_roles exist (id, name)
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table if not exists public.user_roles (
  user_id uuid references auth.users(id) on delete cascade,
  role_id uuid references public.roles(id) on delete cascade,
  primary key (user_id, role_id)
);

-- 2. Insert base roles
insert into public.roles (name) values ('ADMIN') on conflict do nothing;
insert into public.roles (name) values ('USER') on conflict do nothing;

-- 3. Function to assign default USER role after auth.users insertion
create or replace function public.assign_default_user_role() returns trigger as $$
declare
  user_role_id uuid;
begin
  -- find 'USER' role_id
  select id into user_role_id from public.roles where upper(name) = 'USER' limit 1;
  if user_role_id is not null then
    begin
      insert into public.user_roles (user_id, role_id) values (new.id, user_role_id);
    exception when unique_violation then
      -- ignore if already assigned
      null;
    end;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- 4. Attach trigger to auth.users (fires AFTER INSERT)
drop trigger if exists trg_assign_default_role on auth.users;
create trigger trg_assign_default_role
  after insert on auth.users
  for each row
  execute function public.assign_default_user_role();

-- 5. Optional: set JWT custom claim on sign-in (best-effort). This technique sets jwt.claims during the sign-in transaction so the freshly minted token includes the claim.
-- Note: set_config('jwt.claims', ...) must run in the same transaction as token creation; behaviour depends on Supabase internals.
create or replace function public.set_jwt_role_claim() returns trigger as $$
declare
  rname text;
begin
  -- pick one role name for the user (if multiple, pick first)
  select upper(r.name) into rname
  from public.roles r
  join public.user_roles ur on ur.role_id = r.id
  where ur.user_id = new.id
  limit 1;
  if rname is not null then
    perform set_config('jwt.claims.role', rname, true);
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Attach trigger to auth.users to run BEFORE INSERT or AFTER INSERT depending on your desired flow.
-- Using AFTER INSERT here to attempt to set claims for the initial token creation.
drop trigger if exists trg_set_jwt_claim on auth.users;
create trigger trg_set_jwt_claim
  after insert on auth.users
  for each row
  execute function public.set_jwt_role_claim();

-- 6. Example: Enable RLS on a critical table (e.g., articles) and illustrate policies
-- Adjust the table name and policies to match your schema and security requirements.
-- enable row-level security
-- ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Example policy: allow select for public (anonymous) on published articles
-- CREATE POLICY "Public can select published" ON public.articles
--   FOR SELECT USING (published = true);

-- Example policy: allow admins to do anything
-- CREATE POLICY "Admins full access" ON public.articles
--   USING (exists (select 1 from public.user_roles ur join public.roles r on ur.role_id = r.id where ur.user_id = auth.uid() and upper(r.name) = 'ADMIN'))
--   WITH CHECK (exists (select 1 from public.user_roles ur join public.roles r on ur.role_id = r.id where ur.user_id = auth.uid() and upper(r.name) = 'ADMIN'));

-- Notes:
-- * The JWT claim approach depends on executing set_config('jwt.claims.*', ...) in the same transaction the JWT is minted.
-- * If JWT custom claims are unreliable in your environment, fall back to server-side lookups using a service role key when evaluating admin-restricted API routes.
