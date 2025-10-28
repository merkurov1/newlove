-- Миграция для универсальной RBAC (таблицы roles и user_roles)
-- Выполнить в Supabase SQL Editor

-- 1. Создать таблицу roles
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

-- 2. Создать таблицу user_roles
create table if not exists user_roles (
  user_id uuid references users(id) on delete cascade,
  role_id uuid references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

-- 3. Добавить базовые роли
insert into roles (name) values ('ADMIN') on conflict do nothing;
insert into roles (name) values ('USER') on conflict do nothing;

-- 4. Выдать ADMIN для merkurov@gmail.com
insert into user_roles (user_id, role_id)
select u.id, r.id from users u, roles r
where u.email = 'merkurov@gmail.com' and r.name = 'ADMIN'
on conflict do nothing;
