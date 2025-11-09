-- COMPREHENSIVE DATABASE DIAGNOSTIC
-- Date: 2025-11-09
-- DO NOT RUN ANY MIGRATIONS UNTIL REVIEWING THIS

-- ========================================
-- 1. ALL TABLES IN DATABASE
-- ========================================
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- ========================================
-- 2. USERS TABLE - FULL STRUCTURE
-- ========================================
SELECT 
  column_name,
  data_type,
  character_maximum_length,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'users'
ORDER BY ordinal_position;

-- ========================================
-- 3. CHECK IF 'role' OR 'roles' TABLE EXISTS
-- ========================================
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name LIKE '%role%' OR table_name LIKE '%permission%')
ORDER BY table_name;

-- ========================================
-- 4. ARTICLES TABLE - FULL STRUCTURE
-- ========================================
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'articles'
ORDER BY ordinal_position;

-- ========================================
-- 5. ALL EXISTING RLS POLICIES
-- ========================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ========================================
-- 6. TAG-RELATED TABLES - DO THEY EXIST?
-- ========================================
SELECT 
  t.table_name,
  COUNT(c.column_name) as column_count
FROM information_schema.tables t
LEFT JOIN information_schema.columns c 
  ON c.table_name = t.table_name AND c.table_schema = t.table_schema
WHERE t.table_schema = 'public'
  AND t.table_name IN ('Tag', '_ArticleToTag', '_ProjectToTag', '_LetterToTag')
GROUP BY t.table_name
ORDER BY t.table_name;

-- ========================================
-- 7. IF Tag TABLE EXISTS - ITS STRUCTURE
-- ========================================
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'Tag'
ORDER BY ordinal_position;

-- ========================================
-- 8. IF _ArticleToTag EXISTS - ITS STRUCTURE
-- ========================================
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = '_ArticleToTag'
ORDER BY ordinal_position;

-- ========================================
-- 9. ALL INDEXES ON Tag TABLES
-- ========================================
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('Tag', '_ArticleToTag', '_ProjectToTag', '_LetterToTag')
ORDER BY tablename, indexname;

-- ========================================
-- 10. COUNT OF TAGS IN DATABASE
-- ========================================
SELECT 
  'Tag table' as table_name,
  COUNT(*) as row_count 
FROM "Tag"
UNION ALL
SELECT 
  '_ArticleToTag table' as table_name,
  COUNT(*) as row_count 
FROM "_ArticleToTag";

-- ========================================
-- 11. SAMPLE USERS - CHECK AUTH STRUCTURE
-- ========================================
SELECT 
  id,
  email,
  name,
  created_at
FROM users
ORDER BY created_at DESC
LIMIT 3;

-- ========================================
-- 12. CHECK auth.users (Supabase auth table)
-- ========================================
SELECT 
  id,
  email,
  role as auth_role,
  created_at
FROM auth.users
LIMIT 3;

-- ========================================
-- 13. ALL FOREIGN KEY CONSTRAINTS
-- ========================================
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND (tc.table_name LIKE '%Tag%' OR tc.table_name = 'articles')
ORDER BY tc.table_name;
