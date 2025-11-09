# BROWSER TESTING CHECKLIST
**Date:** 2025-11-09
**Goal:** Find why tags don't save when editing articles

## ✅ DIAGNOSTICS COMPLETED
- [x] Tag table exists ✓
- [x] _ArticleToTag table exists ✓
- [x] RLS policies allow authenticated users ALL operations ✓
- [x] Code logic looks correct in `lib/tags.ts` ✓
- [x] `updateArticle()` calls `upsertTagsAndLink()` ✓

## 🔍 NEXT: Browser Testing

### Step 1: Open DevTools
1. Open browser (Chrome/Firefox/Edge)
2. Press `F12` to open DevTools
3. Go to **Console** tab
4. Keep DevTools open for next steps

### Step 2: Try Adding Tags
1. Navigate to `/admin/articles`
2. Click "Edit" on any article
3. Look at the "Tags" field - what's in there?
4. Try adding tags: `тест, демо, проверка`
5. Click "Update Article" button

### Step 3: Watch for Errors
**In Console tab**, look for:
- ❌ Red errors
- ⚠️ Yellow warnings
- Any messages containing: `tag`, `upsert`, `insert`, `permission`, `RLS`, `error`

**In Network tab**:
1. Switch to **Network** tab
2. Repeat adding tags
3. Look for requests to `/api/` or Supabase endpoints
4. Check if any requests failed (red status code)

### Step 4: Check Server Logs
After trying to save tags, check terminal where Next.js is running.

Look for console output:
```
fetch tags error (table: Tag)
insert missing tags error (table: Tag)
insert junction error
```

### Step 5: Manual Database Test
Run the test script:
```sql
-- From migrations/2025-11-09_test_tag_insertion.sql
-- STEP 1: Insert test tag
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
```

If this works → RLS is OK, problem is in frontend/code
If this fails → RLS problem (but diagnostics show it should work)

## 📝 Report Template

Please share:

**1. Console Errors:**
```
(paste any red/yellow messages here)
```

**2. Network Errors:**
```
Request URL: ...
Status: ...
Response: ...
```

**3. Server Logs:**
```
(paste terminal output here)
```

**4. Tags Field State:**
- What's shown in the Tags input field when editing?
- Does it show existing tags or empty?
- After typing and saving, what happens?

**5. Manual Test Result:**
```sql
-- Did STEP 1 (INSERT INTO Tag) succeed?
-- What was returned?
```

## 🎯 Expected Issues

Most likely causes:
1. **Frontend not sending tags** - form data missing 'tags' field
2. **Tags field empty** - admin UI not populating input
3. **Silent errors** - code catching and hiding errors
4. **Service role client failing** - permission fallback not working

Less likely:
- RLS blocking (we confirmed policies are OK)
- Table missing (we confirmed tables exist)
- Code not called (we see it in actions.js)
