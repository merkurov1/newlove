-- SAFE TEST: Manual tag insertion to verify RLS works
-- Date: 2025-11-09
-- This script ONLY TESTS if we can insert tags and link them to articles

-- ========================================
-- STEP 1: Insert a test tag
-- ========================================
-- This will test if RLS allows INSERT
INSERT INTO "Tag" (id, name, slug, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'тест-тег',
  'test-tag',
  NOW(),
  NOW()
)
ON CONFLICT (name) DO NOTHING
RETURNING id, name, slug;

-- ========================================
-- STEP 2: Get an article ID to test with
-- ========================================
SELECT 
  id, 
  title,
  slug,
  (SELECT COUNT(*) FROM "_ArticleToTag" WHERE "A" = articles.id) as current_tag_count
FROM articles
WHERE published = true
ORDER BY "createdAt" DESC
LIMIT 1;

-- ========================================
-- STEP 3: Link the test tag to this article
-- ========================================
-- Replace ARTICLE_ID_HERE with actual ID from STEP 2
-- Replace TAG_ID_HERE with actual ID from STEP 1

-- Example (DO NOT RUN - just template):
-- INSERT INTO "_ArticleToTag" ("A", "B")
-- VALUES (
--   'ARTICLE_ID_HERE',
--   'TAG_ID_HERE'
-- )
-- ON CONFLICT ("A", "B") DO NOTHING;

-- ========================================
-- STEP 4: Verify the link was created
-- ========================================
-- SELECT 
--   a.title,
--   t.name as tag_name
-- FROM articles a
-- JOIN "_ArticleToTag" at ON at."A" = a.id
-- JOIN "Tag" t ON t.id = at."B"
-- WHERE a.id = 'ARTICLE_ID_HERE';
