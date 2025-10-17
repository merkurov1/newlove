-- ensure_service_role_grants.sql
--
-- Выполните эти команды в PostgreSQL как суперпользователь (psql/pgAdmin).
-- Замените SERVICE_ROLE_NAME на реальное имя роли, привязанное к SUPABASE_SERVICE_ROLE_KEY.

-- Пример:
-- \\c your_database_name
-- 
-- Проверить имена ролей:
-- SELECT rolname FROM pg_roles ORDER BY rolname;

-- 1) Дать право использовать схему public (USAGE) и селект на все текущие таблицы
-- 1) Дать сервисной роли доступ к схеме и права на DML (SELECT/INSERT/UPDATE/DELETE)
GRANT USAGE ON SCHEMA public TO SERVICE_ROLE_NAME;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO SERVICE_ROLE_NAME;

-- Права на секвенсы (если используются SERIAL/SEQUENCE для id)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO SERVICE_ROLE_NAME;

-- Права на выполнение функций (RPC), если у вас есть функции в public
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO SERVICE_ROLE_NAME;

-- 2) Опционально: сделать так, чтобы новые таблицы по умолчанию давали DML этой роли
-- (полезно для новых миграций)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO SERVICE_ROLE_NAME;

-- И для новых секвенций (чтобы роль могла читать/использовать их):
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO SERVICE_ROLE_NAME;

-- 3) Диагностика: проверить права на конкретную таблицу
-- В psql выполните:
-- \dp public.user_roles
-- Или через SQL:
-- SELECT has_schema_privilege('SERVICE_ROLE_NAME', 'public', 'USAGE') AS has_usage,
--        has_table_privilege('SERVICE_ROLE_NAME', 'public.user_roles', 'SELECT') AS has_select;

-- 4) Если вы используете ограниченную роль для service key (не postgres), убедитесь что
-- роль также имеет права на все нужные функции/RPC, если они находятся в других схемах.

-- Примечание: замените SERVICE_ROLE_NAME без угловых скобок, например:
-- GRANT USAGE ON SCHEMA public TO service_role;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
