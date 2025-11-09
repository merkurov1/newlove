-- Safe Tag table creation - NO IMAGE CHANGES
-- Date: 2025-11-09
-- This ONLY creates Tag tables, doesn't touch images

-- 1. Create Tag table
CREATE TABLE IF NOT EXISTS "Tag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_key" ON "Tag"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_slug_key" ON "Tag"("slug");

-- 2. Create junction table for articles
CREATE TABLE IF NOT EXISTS "_ArticleToTag" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "_ArticleToTag_AB_unique" ON "_ArticleToTag"("A", "B");
CREATE INDEX IF NOT EXISTS "_ArticleToTag_B_index" ON "_ArticleToTag"("B");

-- 3. Enable RLS
ALTER TABLE "Tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_ArticleToTag" ENABLE ROW LEVEL SECURITY;

-- 4. Create policies - public read, authenticated write
-- NOTE: These policies allow ANY authenticated user to manage tags
-- If you want admin-only, first add 'role' column to users table:
-- ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
-- Then use: auth.uid() IN (SELECT id FROM users WHERE role = 'admin')

CREATE POLICY "Public read tags" ON "Tag"
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users manage tags" ON "Tag"
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Public read article tags" ON "_ArticleToTag"
  FOR SELECT USING (true);

CREATE POLICY "Authenticated manage article tags" ON "_ArticleToTag"
  FOR ALL USING (auth.uid() IS NOT NULL);

-- 5. Grant permissions
GRANT SELECT ON "Tag" TO authenticated, anon;
GRANT ALL ON "Tag" TO authenticated;
GRANT SELECT ON "_ArticleToTag" TO authenticated, anon;
GRANT ALL ON "_ArticleToTag" TO authenticated;

-- Verify
SELECT 'Tag table created' as status, EXISTS (SELECT FROM pg_tables WHERE tablename = 'Tag') as exists;
SELECT '_ArticleToTag table created' as status, EXISTS (SELECT FROM pg_tables WHERE tablename = '_ArticleToTag') as exists;
