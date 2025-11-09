-- Diagnostic: Why tags work in some articles but not others
-- Date: 2025-11-09

-- 1. Check all tags in database
SELECT 
  id,
  name,
  slug,
  "createdAt"
FROM "Tag"
ORDER BY "createdAt" DESC;

-- 2. Check which articles have tags assigned
SELECT 
  a.id,
  a.title,
  a.slug,
  a.published,
  COUNT(att."B") as tag_count,
  array_agg(t.name) FILTER (WHERE t.name IS NOT NULL) as tags
FROM articles a
LEFT JOIN "_ArticleToTag" att ON att."A" = a.id
LEFT JOIN "Tag" t ON t.id = att."B"
WHERE a.published = true
GROUP BY a.id, a.title, a.slug, a.published
ORDER BY a."createdAt" DESC
LIMIT 20;

-- 3. Check for orphaned tags (tags not linked to any article)
SELECT 
  t.id,
  t.name,
  t.slug,
  COUNT(att."A") as article_count
FROM "Tag" t
LEFT JOIN "_ArticleToTag" att ON att."B" = t.id
GROUP BY t.id, t.name, t.slug
HAVING COUNT(att."A") = 0
ORDER BY t."createdAt" DESC;

-- 4. Check for broken links (junction records pointing to non-existent tags or articles)
SELECT 
  att."A" as article_id,
  att."B" as tag_id,
  CASE 
    WHEN a.id IS NULL THEN 'Article missing'
    WHEN t.id IS NULL THEN 'Tag missing'
    ELSE 'OK'
  END as status
FROM "_ArticleToTag" att
LEFT JOIN articles a ON a.id = att."A"
LEFT JOIN "Tag" t ON t.id = att."B"
WHERE a.id IS NULL OR t.id IS NULL;

-- 5. Check specific article - Marlen Dyuma
SELECT 
  a.id,
  a.title,
  a.slug,
  a.published,
  array_agg(t.name) FILTER (WHERE t.name IS NOT NULL) as tags
FROM articles a
LEFT JOIN "_ArticleToTag" att ON att."A" = a.id
LEFT JOIN "Tag" t ON t.id = att."B"
WHERE a.slug = 'marlen-dyuma-voshla-v-postoyannuyu-kollektsiyu-luvra-vpervye-dlya-sovremennoy-zhenschiny-hudozhnitsy'
GROUP BY a.id, a.title, a.slug, a.published;

-- 6. Show all junction table entries
SELECT 
  att."A" as article_id,
  att."B" as tag_id,
  a.title as article_title,
  t.name as tag_name
FROM "_ArticleToTag" att
LEFT JOIN articles a ON a.id = att."A"
LEFT JOIN "Tag" t ON t.id = att."B"
ORDER BY a."createdAt" DESC NULLS LAST
LIMIT 50;

-- 7. Check if there are duplicate tag names (case sensitivity issue)
SELECT 
  LOWER(name) as normalized_name,
  array_agg(name) as actual_names,
  array_agg(id) as tag_ids,
  COUNT(*) as duplicate_count
FROM "Tag"
GROUP BY LOWER(name)
HAVING COUNT(*) > 1;
