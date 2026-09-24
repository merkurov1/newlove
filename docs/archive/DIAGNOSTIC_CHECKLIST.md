# 🔍 FULL DIAGNOSTIC CHECKLIST - DO NOT SKIP

## Step 1: Run Full Database Diagnostic

**Run this in Supabase SQL Editor:**

```sql
\i migrations/2025-11-09_FULL_DATABASE_DIAGNOSTIC.sql
```

**Share ALL results from these sections:**

1. All tables list
2. Users table structure (all columns)
3. Roles/permissions tables (if any exist)
4. Articles table structure
5. ALL RLS policies
6. Tag-related tables (do they exist?)
7. Tag table structure
8. \_ArticleToTag structure
9. Indexes on Tag tables
10. Count of tags
11. Sample users
12. auth.users table
13. Foreign keys

## Step 2: Test Tag Creation Manually

**In Supabase SQL Editor:**

```sql
-- Try to insert a tag as current user
INSERT INTO "Tag" (id, name, slug, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'test-tag',
  'test-tag',
  NOW(),
  NOW()
);

-- Did it work? Check:
SELECT * FROM "Tag" WHERE name = 'test-tag';

-- If it failed, what was the error?
```

## Step 3: Check Browser Console

1. Open https://merkurov.love/admin/articles
2. Open DevTools (F12) → Console tab
3. Click "Редактировать" on any article
4. Add tags: `тест, проба`
5. Click "Обновить статью"
6. **Share any errors from Console**
7. **Share Network tab** - look for failed requests (red)

## Step 4: Check Server Logs

After trying to save tags, check if there are errors in:

- Vercel deployment logs
- Or look for console.error in admin actions

## Step 5: Current Code Review

**lib/tags.ts lines 50-90:**

- Uses `TAGS_TABLE_NAME` env var (default: "Tag")
- Uses service-role client on permission error
- Writes to `_ArticleToTag` junction table

**app/admin/actions.js line 147-148:**

```javascript
const parsedTags = parseTagNames(formData.get('tags')?.toString());
await upsertTagsAndLink(supabase, 'article', id, parsedTags);
```

## Questions to Answer:

1. **Do Tag tables exist?** (from diagnostic query #6)
2. **Are RLS policies set correctly?** (from diagnostic query #5)
3. **Can current user INSERT into Tag?** (from manual test)
4. **Are there console errors?** (from browser)
5. **Is upsertTagsAndLink being called?** (add console.log?)

## DO NOT APPLY ANY MIGRATIONS UNTIL:

- ✅ All diagnostic results reviewed
- ✅ Root cause identified
- ✅ Solution confirmed to NOT break existing data

---

**Current Status:**

- Tag and \_ArticleToTag tables: ✅ EXIST (confirmed)
- RLS policies: ❓ UNKNOWN (need full diagnostic)
- Users table has 'role' column: ❌ NO
- Tags visible on site: ❌ NO (all articles show 0 tags)
- Tags save in admin: ❓ UNKNOWN (need browser console check)
