-- ========================================
-- ДИАГНОСТИКА ПОДПИСЧИКОВ
-- Date: 2025-11-09
-- Цель: Проверить почему только 4 подписчика получают письма
-- ========================================

-- 1. Всего подписчиков
SELECT 
  COUNT(*) as total_subscribers,
  COUNT(*) FILTER (WHERE "isActive" = true) as active_subscribers,
  COUNT(*) FILTER (WHERE "isActive" = false) as inactive_subscribers
FROM subscribers;

-- 2. Все подписчики с их статусом
SELECT 
  email,
  "isActive",
  "createdAt",
  "userId",
  id
FROM subscribers
ORDER BY "createdAt" DESC;

-- 3. Проверка структуры таблицы subscribers
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'subscribers'
ORDER BY ordinal_position;

-- 4. Проверка RLS политик на таблице subscribers
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'subscribers'
ORDER BY policyname;

-- 5. Последние отправленные письма
SELECT 
  id,
  title,
  slug,
  "sentAt",
  "createdAt"
FROM letters
WHERE "sentAt" IS NOT NULL
ORDER BY "sentAt" DESC
LIMIT 5;

-- 6. Проверка наличия newsletter_jobs таблицы
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'newsletter_jobs'
) as newsletter_jobs_exists;

-- 7. Если newsletter_jobs существует - последние задачи
SELECT 
  id,
  letter_id,
  status,
  total_count,
  sent_count,
  failed_count,
  created_at,
  completed_at,
  error_message
FROM newsletter_jobs
ORDER BY created_at DESC
LIMIT 10;

-- 8. Проверка логов отправки (если таблица newsletter_logs существует)
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'newsletter_logs'
) as newsletter_logs_exists;
