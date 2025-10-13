-- SQL запрос для пересоздания таблицы Articles в Supabase
-- Сначала удаляем старую таблицу (ОСТОРОЖНО! Это удалит все данные!)

-- 1. Удаляем связанные таблицы/зависимости если они есть
-- (ОСТОРОЖНО: этот блок удалит данные. По умолчанию он НЕ будет выполнен.)
-- Чтобы разрешить удаление, выполните предварительно:
--   SET LOCAL app.perform_destructive = 'true';
-- или установите параметр в postgresql.conf/session.
DO $$
BEGIN
  IF current_setting('app.perform_destructive', true) = 'true' THEN
    RAISE NOTICE 'Destructive mode enabled: dropping _ArticleToTag and articles';
    DROP TABLE IF EXISTS "_ArticleToTag" CASCADE;
    DROP TABLE IF EXISTS "articles" CASCADE;
  ELSE
    RAISE NOTICE 'Destructive mode disabled: skipping DROP TABLE statements in recreate_articles_table.sql';
  END IF;
END$$;

-- 3. Создаем новую таблицу articles с правильными типами
CREATE TABLE IF NOT EXISTS "articles" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorId" TEXT NOT NULL,
  
  CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- 4. Создаем уникальные индексы
CREATE UNIQUE INDEX IF NOT EXISTS "articles_slug_key" ON "articles"("slug");

-- 5. Создаем связь с таблицей User (если таблица User использует TEXT id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'articles_authorId_fkey') THEN
    ALTER TABLE "articles" ADD CONSTRAINT "articles_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

-- 6. Создаем промежуточную таблицу для связи many-to-many с тегами

CREATE TABLE IF NOT EXISTS "_ArticleToTag" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

-- 7. Создаем уникальный индекс для промежуточной таблицы
CREATE UNIQUE INDEX IF NOT EXISTS "_ArticleToTag_AB_unique" ON "_ArticleToTag"("A", "B");
CREATE INDEX IF NOT EXISTS "_ArticleToTag_B_index" ON "_ArticleToTag"("B");

-- 8. Добавляем внешние ключи для промежуточной таблицы
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_ArticleToTag_A_fkey') THEN
    ALTER TABLE "_ArticleToTag" ADD CONSTRAINT "_ArticleToTag_A_fkey"
      FOREIGN KEY ("A") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_ArticleToTag_B_fkey') THEN
    ALTER TABLE "_ArticleToTag" ADD CONSTRAINT "_ArticleToTag_B_fkey"
      FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

-- 9. Создаем trigger для автоматического обновления updatedAt
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_articles_updated_at 
    BEFORE UPDATE ON "articles" 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ВАЖНО: Проверьте, что таблица User тоже использует TEXT для id, а не UUID
-- Если User.id это UUID, то нужно сначала мигрировать User таблицу

-- Проверочный запрос - выполните его после создания таблицы:
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'articles' 
-- ORDER BY ordinal_position;