-- Migration: Clean up duplicate and legacy tables
-- Date: 2025-11-08
-- Purpose: Remove Prisma legacy tables, duplicates, and unused backup tables

-- ============================================
-- 1. REMOVE PRISMA LEGACY TABLES (uppercase)
-- ============================================

-- Remove duplicate Account table (use accounts instead)
DROP TABLE IF EXISTS public."Account" CASCADE;

-- Remove duplicate Message table (use messages instead)
DROP TABLE IF EXISTS public."Message" CASCADE;

-- Remove duplicate Session table (use sessions instead)
DROP TABLE IF EXISTS public."Session" CASCADE;

-- Remove duplicate Tag table (use Tag/tag, keep the one used in code)
DROP TABLE IF EXISTS public."Tag" CASCADE;

-- Remove duplicate VerificationToken (use verificationtokens instead)
DROP TABLE IF EXISTS public."VerificationToken" CASCADE;

-- ============================================
-- 2. REMOVE CONTENT DUPLICATES (singular forms)
-- ============================================

-- Remove singular views/tables (use plural forms)
DROP VIEW IF EXISTS public.article CASCADE;
DROP TABLE IF EXISTS public.article CASCADE;

DROP VIEW IF EXISTS public.letter CASCADE;
DROP TABLE IF EXISTS public.letter CASCADE;

DROP VIEW IF EXISTS public.postcard CASCADE;
DROP TABLE IF EXISTS public.postcard CASCADE;

DROP VIEW IF EXISTS public.project CASCADE;
DROP TABLE IF EXISTS public.project CASCADE;

DROP VIEW IF EXISTS public.subscriber CASCADE;
DROP TABLE IF EXISTS public.subscriber CASCADE;

DROP VIEW IF EXISTS public.tag CASCADE;
DROP TABLE IF EXISTS public.tag CASCADE;

-- ============================================
-- 3. REMOVE OLD RELATION TABLES
-- ============================================

-- Remove old Prisma many-to-many relations (uppercase)
DROP TABLE IF EXISTS public."_ArticleToTag" CASCADE;
DROP TABLE IF EXISTS public."_LetterToTag" CASCADE;
DROP TABLE IF EXISTS public."_ProjectToTag" CASCADE;

-- Remove lowercase duplicate
DROP TABLE IF EXISTS public._articletotag CASCADE;

-- ============================================
-- 4. REMOVE BACKUP AND AUDIT TABLES
-- ============================================

-- Remove old user backup
DROP TABLE IF EXISTS public."User_backup_before_sync" CASCADE;

-- Remove auth trigger audit logs (optional - keep if needed for debugging)
DROP TABLE IF EXISTS public._auth_trigger_audit CASCADE;
DROP TABLE IF EXISTS public.auth_trigger_errors CASCADE;
DROP TABLE IF EXISTS public.auth_trigger_function_backups CASCADE;

-- Remove Prisma migrations table (no longer using Prisma)
DROP TABLE IF EXISTS public._prisma_migrations CASCADE;

-- ============================================
-- 5. VERIFY REMAINING TABLES
-- ============================================

-- Tables that should remain:
-- ✅ users (UUID-based, synced with auth.users)
-- ✅ subscribers (newsletter)
-- ✅ articles, letters, projects, postcards (content)
-- ✅ postcard_orders (orders)
-- ✅ letter_comments (comments)
-- ✅ products, orders (shop)
-- ✅ accounts, sessions, verificationtokens (auth)
-- ✅ roles, user_roles (RBAC)
-- ✅ project_tags (tagging system)
-- ✅ subscriber_tokens (newsletter tokens)
-- ✅ revalidation_audit (cache invalidation logs)

COMMENT ON SCHEMA public IS 'Cleaned up schema - removed Prisma legacy tables and duplicates (2025-11-08)';
