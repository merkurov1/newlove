-- Migration: Add foreign key constraints for content tables
-- Date: 2025-11-08
-- Purpose: Link letters, articles, projects to users table

-- First, migrate old CUID authorIds to new UUID format
-- Map old Prisma User IDs to new Supabase auth.users IDs by email
UPDATE letters l
SET "authorId" = u.id
FROM users u
WHERE u.email = 'merkurov@gmail.com'
  AND l."authorId" = 'cmg3a1nw400009h9arn2nhaae';

UPDATE articles a
SET "authorId" = u.id
FROM users u
WHERE u.email = 'merkurov@gmail.com'
  AND a."authorId" = 'cmg3a1nw400009h9arn2nhaae';

UPDATE projects p
SET "authorId" = u.id
FROM users u
WHERE u.email = 'merkurov@gmail.com'
  AND p."authorId" = 'cmg3a1nw400009h9arn2nhaae';

-- Add foreign key from letters."authorId" to users.id
ALTER TABLE public.letters
DROP CONSTRAINT IF EXISTS letters_authorId_fkey,
ADD CONSTRAINT letters_authorId_fkey
  FOREIGN KEY ("authorId")
  REFERENCES public.users(id)
  ON DELETE SET NULL;

-- Add foreign key from articles."authorId" to users.id
ALTER TABLE public.articles
DROP CONSTRAINT IF EXISTS articles_authorId_fkey,
ADD CONSTRAINT articles_authorId_fkey
  FOREIGN KEY ("authorId")
  REFERENCES public.users(id)
  ON DELETE SET NULL;

-- Add foreign key from projects."authorId" to users.id
ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_authorId_fkey,
ADD CONSTRAINT projects_authorId_fkey
  FOREIGN KEY ("authorId")
  REFERENCES public.users(id)
  ON DELETE SET NULL;

-- Add foreign key from letter_comments.user_id to users.id
ALTER TABLE public.letter_comments
DROP CONSTRAINT IF EXISTS letter_comments_user_id_fkey,
ADD CONSTRAINT letter_comments_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.users(id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT letters_authorId_fkey ON public.letters IS 'Links letter to author in users table';
COMMENT ON CONSTRAINT articles_authorId_fkey ON public.articles IS 'Links article to author in users table';
COMMENT ON CONSTRAINT projects_authorId_fkey ON public.projects IS 'Links project to author in users table';
