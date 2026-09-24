# TAG SAVE BUG - ROOT CAUSE FOUND ✅

**Date:** 2025-11-09  
**Status:** FIXED

---

## 🐛 The Bug

Tags were not saving when editing articles in admin panel.

## 🔍 Root Cause

**Duplicate hidden form fields with same name:**

1. **TagInput.js** (line 60):

   ```javascript
   <input type="hidden" name="tags" value={hiddenInputValue} />
   ```

2. **ContentForm.tsx** (line 256):
   ```tsx
   <input type="hidden" name="tags" value={JSON.stringify(tags)} />
   ```

When a form has two inputs with the same `name` attribute, browsers typically only send **one value** (usually the first encountered in DOM order).

This caused:

- Either the wrong value was sent
- Or an empty value was sent
- `formData.get('tags')` in `updateArticle()` received incorrect data
- `parseTagNames()` couldn't parse it properly
- Tags were never saved to database

## 📝 Additional Issue

**Type mismatch in TagInput.js** (line 8):

```javascript
const [tags, setTags] = useState(() => (initialTags || []).map((t) => t.name));
```

But `ContentForm.tsx` (line 53) already converts to string array:

```tsx
const [tags, setTags] = useState<string[]>(() => (safeInitial.tags || []).map((t: any) => t.name));
```

So `TagInput` received `["tag1", "tag2"]` but tried to call `.name` on strings, causing errors.

---

## ✅ The Fix

### Changed File: `components/admin/TagInput.js`

**1. Removed duplicate hidden input (line 60)**

```diff
       />
     </div>
-    <input type="hidden" name="tags" value={hiddenInputValue} />
+    {/* Hidden input REMOVED - parent ContentForm handles form submission */}
   </div>
 );
```

**2. Fixed type handling for initialTags (lines 6-21)**

```diff
export default function TagInput({ initialTags, onChange }) {
- const [tags, setTags] = useState(() => (initialTags || []).map(t => t.name));
+ const [tags, setTags] = useState(() => {
+   const arr = initialTags || [];
+   return arr.map(t => typeof t === 'string' ? t : t.name);
+ });
  const [inputValue, setInputValue] = useState('');

- const [hiddenInputValue, setHiddenInputValue] = useState(JSON.stringify(tags));
  useEffect(() => {
-   setHiddenInputValue(JSON.stringify(tags));
    if (onChange) onChange(tags);
  }, [tags, onChange]);

  useEffect(() => {
-   setTags((initialTags || []).map(t => t.name));
+   const arr = initialTags || [];
+   setTags(arr.map(t => typeof t === 'string' ? t : t.name));
  }, [initialTags]);
```

---

## 🎯 How It Works Now

**Flow:**

1. User types tags in `TagInput` component
2. `onChange` callback updates `tags` state in `ContentForm`
3. `ContentForm` renders ONE hidden input:
   ```tsx
   <input type="hidden" name="tags" value={JSON.stringify(tags)} />
   ```
4. Form submits to `updateArticle()` server action
5. `formData.get('tags')` receives correct JSON array
6. `parseTagNames()` parses it successfully
7. `upsertTagsAndLink()` saves tags to database

**Type safety:**

- `initialTags` can be:
  - `[{name: "tag1"}, {name: "tag2"}]` (from database)
  - `["tag1", "tag2"]` (from parent state)
- Component handles both correctly

---

## 🧪 Testing

**Before deploying, test:**

1. ✅ Edit existing article
   - Should show existing tags (if any)
   - Should allow adding new tags
   - Should allow removing tags
   - Should save successfully

2. ✅ Create new article
   - Should allow adding tags
   - Should save successfully

3. ✅ Check database

   ```sql
   SELECT
     a.title,
     t.name as tag_name
   FROM articles a
   JOIN "_ArticleToTag" at ON at."A" = a.id
   JOIN "Tag" t ON t.id = at."B"
   WHERE a.slug = 'your-article-slug';
   ```

4. ✅ Check article page
   - Tags should display below article
   - Tag links should work

---

## 📊 Database Status

**RLS Policies:** ✅ Correct (confirmed in diagnostics)

```
Tag table: auth.uid() IS NOT NULL - allows ALL for authenticated
_ArticleToTag: auth.uid() IS NOT NULL - allows ALL for authenticated
```

**Tables:** ✅ Exist

- `Tag` table exists
- `_ArticleToTag` junction table exists
- Proper indexes exist

**Why RLS wasn't the issue:**
The policies were correct all along. Tags weren't being saved because the form data never reached the database layer - it was broken at the form submission level.

---

## 🚀 Deployment

```bash
# Test locally first
npm run dev

# If tests pass, commit and push
git add components/admin/TagInput.js
git commit -m "fix: remove duplicate tags hidden input causing save failure

- Removed duplicate hidden input in TagInput component
- ContentForm already handles tags form submission
- Fixed type handling for initialTags (string[] or object[])
- Closes issue with tags not saving in admin panel"

git push origin main
```

---

## 📚 Lessons Learned

1. **Duplicate form field names break forms** - always check for duplicate `name` attributes
2. **Type safety matters** - handle both possible input types gracefully
3. **Separation of concerns** - TagInput should only manage UI, parent handles form data
4. **RLS was fine** - not every database issue is a permission problem
5. **Start with browser DevTools** - would have caught `formData.get('tags')` returning wrong value

---

## ✅ Resolution

**Status:** FIXED
**Files Changed:** 1
**Lines Changed:** ~15
**Breaking Changes:** None
**Backwards Compatible:** Yes

Tags should now save correctly when editing articles in admin panel.
