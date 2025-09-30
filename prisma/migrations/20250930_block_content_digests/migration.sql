-- Миграция: переводим поле content в digests на jsonb
ALTER TABLE "digests"
  ALTER COLUMN "content" TYPE jsonb USING
    CASE
      WHEN jsonb_typeof("content"::jsonb) IS NOT NULL THEN "content"::jsonb
      ELSE jsonb_build_array(jsonb_build_object('type', 'richText', 'html', "content"))
    END;
