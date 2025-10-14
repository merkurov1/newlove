-- scripts/check_db_privs.sql
-- Набор диагностических SQL запросов для проверки прав и RLS на целевых таблицах.

-- 1) Список грантов по таблице postcards
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'postcards'
ORDER BY grantee, privilege_type;

-- 2) Список грантов по таблице articles
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'articles'
ORDER BY grantee, privilege_type;

-- 3) Проверить, включён ли RLS для таблиц
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('postcards', 'postcard_orders', 'articles');

-- 4) Просмотр политик row-level security для таблиц (если есть)
SELECT * FROM pg_policies WHERE tablename IN ('postcards', 'postcard_orders', 'articles');

-- 5) Проверить роли в базе
SELECT rolname, rolsuper, rolreplication, rolcreaterole, rolcreatedb
FROM pg_roles
ORDER BY rolname;

-- Конец диагностики
