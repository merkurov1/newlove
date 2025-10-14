-- scripts/grants_for_public_read.sql
-- Быстрый набор GRANT и пример RLS для публичного каталога открыток и статей.
-- Выполните этот файл в Supabase SQL Editor или через psql/CI.

-- ------------------------------
-- 1) Быстрые GRANT (публичное чтение)
-- ------------------------------
-- Разрешить anon читать каталожные таблицы (публичный доступ)
GRANT SELECT ON public.postcards TO anon;
GRANT SELECT ON public.articles TO anon;

-- ------------------------------
-- 2) Явные привилегии для service_role (опционально)
-- ------------------------------
-- Эти команды даются в отдельной секции — service_role обычно уже обладает правами,
-- но здесь показано, как дать явные привилегии.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.postcards TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.postcard_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.articles TO service_role;

-- ------------------------------
-- 3) Пример безопасной RLS политики (опционально)
-- Если вы предпочитаете не давать anon прямой GRANT, используйте RLS политику вместо этого.
-- Включите RLS и создайте политику, разрешающую anon только SELECT опубликованных записей.
-- Раскомментируйте и настройте по необходимости.

-- ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY public_read_published_articles ON public.articles
--   FOR SELECT
--   TO anon
--   USING (published = true);

-- ALTER TABLE public.postcards ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY public_read_available_postcards ON public.postcards
--   FOR SELECT
--   TO anon
--   USING (available = true);

-- ------------------------------
-- Конец файла
-- ------------------------------
