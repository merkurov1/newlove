-- БЫСТРОЕ ИСПРАВЛЕНИЕ: Изменение типа колонки id в существующей таблице articles
-- Выполните эти команды в Supabase SQL Editor:

-- 1. Сначала проверим текущую структуру
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'articles' 
ORDER BY ordinal_position;

-- 2. Если id имеет тип UUID, то изменяем его на TEXT
-- ВНИМАНИЕ: Это удалит все существующие статьи!

-- Удаляем связанные записи в промежуточной таблице
DELETE FROM "_ArticleToTag";

-- Удаляем все статьи
DELETE FROM "articles";

-- Изменяем тип колонки id с UUID на TEXT
ALTER TABLE "articles" ALTER COLUMN "id" TYPE TEXT;

-- Изменяем default значение для генерации CUID (удаляем UUID генерацию)
ALTER TABLE "articles" ALTER COLUMN "id" DROP DEFAULT;

-- Убеждаемся, что authorId тоже TEXT (должен быть, если User.id это TEXT)
ALTER TABLE "articles" ALTER COLUMN "authorId" TYPE TEXT;

-- 3. Проверяем результат
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'articles' 
ORDER BY ordinal_position;

-- 4. Также проверим связанную таблицу тегов
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = '_ArticleToTag';

-- Если _ArticleToTag имеет UUID колонки, изменим их тоже:
-- ALTER TABLE "_ArticleToTag" ALTER COLUMN "A" TYPE TEXT;
-- ALTER TABLE "_ArticleToTag" ALTER COLUMN "B" TYPE TEXT;