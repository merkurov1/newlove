-- Миграция: переводим поле content в projects на jsonb
ALTER TABLE "projects"
  ALTER COLUMN "content" TYPE jsonb USING
    CASE
      WHEN jsonb_typeof("content"::jsonb) IS NOT NULL THEN "content"::jsonb
      ELSE jsonb_build_array(jsonb_build_object('type', 'richText', 'html', "content"))
    END;
