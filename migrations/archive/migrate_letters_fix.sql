-- Миграция для приведения таблиц писем в порядок
-- Выполните этот SQL код в Supabase SQL Editor

-- 1. Проверяем и создаем таблицу letters с правильной структурой
-- Если существует - удаляем и пересоздаем для чистоты
DROP TABLE IF EXISTS "_LetterToTag" CASCADE;
DROP TABLE IF EXISTS "letters" CASCADE;

-- 2. Создаем таблицу letters
CREATE TABLE "letters" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorId" TEXT NOT NULL,
  
  CONSTRAINT "letters_pkey" PRIMARY KEY ("id")
);

-- 3. Создаем индексы
CREATE UNIQUE INDEX "letters_slug_key" ON "letters"("slug");
CREATE INDEX "letters_authorId_idx" ON "letters"("authorId");
CREATE INDEX "letters_published_idx" ON "letters"("published");
CREATE INDEX "letters_publishedAt_idx" ON "letters"("publishedAt");
CREATE INDEX "letters_sentAt_idx" ON "letters"("sentAt");
CREATE INDEX "letters_createdAt_idx" ON "letters"("createdAt");

-- 4. Добавляем внешний ключ к User
ALTER TABLE "letters" ADD CONSTRAINT "letters_authorId_fkey" 
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Создаем/проверяем таблицу Tag
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

-- 6. Создаем связующую таблицу many-to-many для letters-tags
CREATE TABLE "_LetterToTag" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_LetterToTag_AB_unique" ON "_LetterToTag"("A", "B");
CREATE INDEX "_LetterToTag_B_index" ON "_LetterToTag"("B");

ALTER TABLE "_LetterToTag" ADD CONSTRAINT "_LetterToTag_A_fkey" 
  FOREIGN KEY ("A") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_LetterToTag" ADD CONSTRAINT "_LetterToTag_B_fkey" 
  FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Добавляем поле isActive к существующей таблице subscribers если его нет
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscribers' AND column_name = 'isActive'
  ) THEN
    ALTER TABLE "subscribers" ADD COLUMN "isActive" BOOLEAN DEFAULT true;
    UPDATE "subscribers" SET "isActive" = true;
    ALTER TABLE "subscribers" ALTER COLUMN "isActive" SET NOT NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'subscribers' AND indexname = 'subscribers_isActive_idx'
  ) THEN
    CREATE INDEX "subscribers_isActive_idx" ON "subscribers"("isActive");
  END IF;
END $$;

-- 8. Создаем функции автообновления updatedAt
CREATE OR REPLACE FUNCTION update_letters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_tag_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Создаем триггеры
DROP TRIGGER IF EXISTS update_letters_updated_at_trigger ON "letters";
CREATE TRIGGER update_letters_updated_at_trigger
  BEFORE UPDATE ON "letters"
  FOR EACH ROW
  EXECUTE FUNCTION update_letters_updated_at();

DROP TRIGGER IF EXISTS update_tag_updated_at_trigger ON "Tag";
CREATE TRIGGER update_tag_updated_at_trigger
  BEFORE UPDATE ON "Tag"
  FOR EACH ROW
  EXECUTE FUNCTION update_tag_updated_at();

-- 10. Добавляем тестовые данные
DO $$
DECLARE
  admin_user_id TEXT;
BEGIN
  SELECT id INTO admin_user_id FROM "User" WHERE role = 'ADMIN' LIMIT 1;
  
  IF admin_user_id IS NOT NULL THEN
    INSERT INTO "letters" ("id", "title", "slug", "content", "published", "authorId") VALUES
      ('letter_test_1', 'Добро пожаловать в мир авторских открыток', 'dobro-pozhalovat-v-mir-avtorskih-otkrytok', '[{"type":"richText","data":{"html":"<h2>Дорогие читатели!</h2><p>Рад приветствовать вас в новом разделе нашего сайта — <strong>Letters</strong>. Здесь будут собираться все мои письма, размышления и анонсы новых проектов.</p><p>Сегодня хочу поделиться с вами особенным проектом — коллекцией авторских открыток.</p>"}}]', true, admin_user_id),
      ('letter_test_2', 'Процесс создания: от идеи до открытки', 'process-sozdaniya-ot-idei-do-otkrytki', '[{"type":"richText","data":{"html":"<h2>За кулисами творчества</h2><p>Многие спрашивают, как рождаются идеи для открыток. Сегодня приоткрою завесу тайны творческого процесса.</p>"}}]', true, admin_user_id),
      ('letter_test_3', 'Искусство персонализации', 'iskusstvo-personalizatsii', '[{"type":"richText","data":{"html":"<h2>Личное прикосновение к каждой открытке</h2><p>Что превращает обычную открытку в особенную? Персонализация — вот секрет!</p>"}}]', true, admin_user_id)
    ON CONFLICT (id) DO NOTHING;
    
    UPDATE "letters" SET "publishedAt" = CURRENT_TIMESTAMP WHERE "published" = true AND "publishedAt" IS NULL;
    
    RAISE NOTICE 'Тестовые письма добавлены для пользователя: %', admin_user_id;
  ELSE
    RAISE NOTICE 'Пользователь с ролью ADMIN не найден. Тестовые данные не добавлены.';
  END IF;
END $$;

-- 11. Добавляем базовые теги
INSERT INTO "Tag" ("id", "name", "slug", "createdAt", "updatedAt") VALUES
  ('tag_art', 'Искусство', 'iskusstvo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tag_creativity', 'Творчество', 'tvorchestvo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), 
  ('tag_postcards', 'Открытки', 'otkrytki', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tag_process', 'Процесс', 'process', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tag_inspiration', 'Вдохновение', 'vdohnovenie', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- Проверка результата:
SELECT 
  l.id,
  l.title,
  l.slug,
  l.published,
  l."publishedAt",
  l."sentAt",
  u.name as author_name,
  u.email as author_email
FROM "letters" l
JOIN "User" u ON l."authorId" = u.id
ORDER BY l."createdAt" DESC;

-- Проверка подписчиков:
SELECT 
  COUNT(*) as total_subscribers,
  COUNT(*) FILTER (WHERE "isActive" = true) as active_subscribers
FROM "subscribers";

-- Готово! После выполнения:
-- 1. npx prisma db pull
-- 2. npx prisma generate  
-- 3. Перезапустите сервер