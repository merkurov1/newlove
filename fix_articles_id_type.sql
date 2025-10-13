-- БЫСТРОЕ ИСПРАВЛЕНИЕ: Изменение типа колонки id в существующей таблице articles
-- Выполните эти команды в Supabase SQL Editor:

-- 1. Сначала проверим текущую структуру
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'articles' 
ORDER BY ordinal_position;

-- 2. Если id имеет тип UUID, то изменяем его на TEXT
-- ВНИМАНИЕ: Это может удалить существующие статьи при преобразовании типов.
-- Мы выполняем проверку и только при необходимости приведём типы.

DO $$
DECLARE
	t text;
BEGIN
	SELECT data_type INTO t FROM information_schema.columns
	WHERE table_name = 'articles' AND column_name = 'id';
	IF t = 'uuid' THEN
		RAISE NOTICE 'articles.id is uuid — attempting safe conversion to TEXT.';

		-- Only convert column type without deleting data. Conversion may fail if dependent FKs exist.
		BEGIN
			ALTER TABLE "articles" ALTER COLUMN "id" TYPE TEXT USING id::text;
		EXCEPTION WHEN others THEN
			RAISE NOTICE 'Direct TYPE conversion failed: % — consider manual migration. Skipping.', SQLERRM;
		END;

		-- Try to convert authorId as well if needed
		BEGIN
			SELECT data_type INTO t FROM information_schema.columns
			WHERE table_name = 'articles' AND column_name = 'authorId';
			IF t = 'uuid' THEN
				ALTER TABLE "articles" ALTER COLUMN "authorId" TYPE TEXT USING authorId::text;
			END IF;
		EXCEPTION WHEN others THEN
			RAISE NOTICE 'Could not convert authorId: % — manual attention required.', SQLERRM;
		END;
	ELSE
		RAISE NOTICE 'articles.id is not UUID (current type: %), skipping conversion.', t;
	END IF;
END $$;

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