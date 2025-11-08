-- Migration: Add missing indexes for performance
-- Date: 2025-11-08
-- Purpose: Add indexes for frequently queried columns

-- Index for articles slug (used in URL routing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_slug_idx 
ON public.articles (slug);

-- Index for articles publishedAt (used in sorting)
CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_published_at_idx 
ON public.articles ("publishedAt" DESC NULLS LAST);

-- Index for letters slug (used in URL routing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS letters_slug_idx 
ON public.letters (slug);

-- Index for letters publishedAt (used in sorting)
CREATE INDEX CONCURRENTLY IF NOT EXISTS letters_published_at_idx 
ON public.letters ("publishedAt" DESC NULLS LAST);

-- Index for Tag slug (used in URL routing /tags/:slug)
CREATE INDEX CONCURRENTLY IF NOT EXISTS tags_slug_idx 
ON public."Tag" (slug);

-- Index for projects slug (used in URL routing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_slug_idx 
ON public.projects (slug);

-- Composite index for articles filtering (published + date)
CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_published_date_idx 
ON public.articles (published, "publishedAt" DESC) 
WHERE published = true;

-- Composite index for letters filtering (published + date)
CREATE INDEX CONCURRENTLY IF NOT EXISTS letters_published_date_idx 
ON public.letters (published, "publishedAt" DESC) 
WHERE published = true;

-- Index for subscribers email (used in lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscribers_email_lower_idx 
ON public.subscribers (LOWER(email));

-- Index for active subscribers (used in newsletter sends)
CREATE INDEX CONCURRENTLY IF NOT EXISTS subscribers_active_idx 
ON public.subscribers ("isActive") 
WHERE "isActive" = true;

COMMENT ON INDEX articles_slug_idx IS 'Fast lookup for article pages';
COMMENT ON INDEX letters_slug_idx IS 'Fast lookup for letter pages';
COMMENT ON INDEX tags_slug_idx IS 'Fast lookup for tag pages';
COMMENT ON INDEX articles_published_date_idx IS 'Efficient filtering for published articles';
COMMENT ON INDEX letters_published_date_idx IS 'Efficient filtering for published letters';
COMMENT ON INDEX subscribers_email_lower_idx IS 'Case-insensitive email lookup';
COMMENT ON INDEX subscribers_active_idx IS 'Fast filtering for active subscribers';
