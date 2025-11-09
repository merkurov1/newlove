-- Test tag insertion manually
-- Date: 2025-11-09

-- First, let's manually create a tag and link it to test
-- Use the Marlen Dyuma article

-- 1. Get article ID
SELECT id, title FROM articles WHERE slug = 'marlen-dyuma-voshla-v-postoyannuyu-kollektsiyu-luvra-vpervye-dlya-sovremennoy-zhenschiny-hudozhnitsy';
-- Result: up85m8hhtlyabtszr1dinatq

-- 2. Manually insert a test tag
INSERT INTO "Tag" (id, name, slug, "createdAt", "updatedAt")
VALUES (
  'test-tag-' || gen_random_uuid()::text,
  'искусство',
  'iskusstvo',
  NOW(),
  NOW()
)
ON CONFLICT (name) DO NOTHING
RETURNING id, name;

-- 3. Get the tag ID
SELECT id, name FROM "Tag" WHERE name = 'искусство';

-- 4. Link tag to article (replace YOUR_TAG_ID with result from step 3)
-- INSERT INTO "_ArticleToTag" ("A", "B")
-- VALUES ('up85m8hhtlyabtszr1dinatq', 'YOUR_TAG_ID')
-- ON CONFLICT DO NOTHING;

-- 5. Verify the link was created
SELECT 
  a.title,
  t.name as tag_name,
  att."A" as article_id,
  att."B" as tag_id
FROM "_ArticleToTag" att
JOIN articles a ON a.id = att."A"
JOIN "Tag" t ON t.id = att."B"
WHERE a.id = 'up85m8hhtlyabtszr1dinatq';
