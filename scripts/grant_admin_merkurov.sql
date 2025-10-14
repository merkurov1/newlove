-- scripts/grant_admin_merkurov.sql
-- Автоматически выдать роль ADMIN пользователю merkurov@gmail.com (если ещё не выдана)

insert into user_roles (user_id, role_id)
select u.id, r.id
from "User" u, roles r
where u.email = 'merkurov@gmail.com' and r.name = 'ADMIN'
on conflict do nothing;
