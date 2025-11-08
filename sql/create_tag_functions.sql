-- SQL миграция для создания RPC функций для работы с тегами
-- Дата: 2025-11-08

-- Удаляем старые версии функций если они есть
DROP FUNCTION IF EXISTS get_tag_by_slug(TEXT);
DROP FUNCTION IF EXISTS get_articles_by_tag(TEXT);
DROP FUNCTION IF EXISTS get_articles_by_tag(TEXT, INT);
DROP FUNCTION IF EXISTS get_articles_by_tag_slug(TEXT);
DROP FUNCTION IF EXISTS get_articles_by_tag_slug(TEXT, INT);

-- Функция для получения тега по slug
CREATE OR REPLACE FUNCTION get_tag_by_slug(tag_slug_param TEXT)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  slug TEXT,
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.slug,
    t."createdAt",
    t."updatedAt"
  FROM "Tag" t
  WHERE t.slug = tag_slug_param
  LIMIT 1;
END;
$$;

-- Функция для получения статей по тегу (основная версия)
CREATE OR REPLACE FUNCTION get_articles_by_tag(tag_slug_param TEXT, limit_param INT DEFAULT 50)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  slug TEXT,
  content TEXT,
  published BOOLEAN,
  "publishedAt" TIMESTAMP,
  "updatedAt" TIMESTAMP,
  author JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.title,
    a.slug,
    a.content,
    a.published,
    a."publishedAt",
    a."updatedAt",
    jsonb_build_object(
      'id', u.id,
      'name', u.name,
      'email', u.email
    ) as author
  FROM "articles" a
  INNER JOIN "_ArticleToTag" att ON a.id = att."A"
  INNER JOIN "Tag" t ON t.id = att."B"
  LEFT JOIN "User" u ON a."authorId" = u.id
  WHERE t.slug = tag_slug_param
  ORDER BY a."publishedAt" DESC NULLS LAST, a."updatedAt" DESC NULLS LAST
  LIMIT limit_param;
END;
$$;

-- Альтернативная функция с другим именем параметра (для обратной совместимости)
CREATE OR REPLACE FUNCTION get_articles_by_tag_slug(tag_slug TEXT, limit_param INT DEFAULT 50)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  slug TEXT,
  content TEXT,
  published BOOLEAN,
  "publishedAt" TIMESTAMP,
  "updatedAt" TIMESTAMP,
  author JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM get_articles_by_tag(tag_slug, limit_param);
END;
$$;

-- Права доступа для анонимных пользователей и аутентифицированных
GRANT EXECUTE ON FUNCTION get_tag_by_slug(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_articles_by_tag(TEXT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_articles_by_tag_slug(TEXT, INT) TO anon, authenticated, service_role;

-- Комментарии для документации
COMMENT ON FUNCTION get_tag_by_slug IS 'Возвращает тег по его slug';
COMMENT ON FUNCTION get_articles_by_tag IS 'Возвращает статьи, связанные с тегом по его slug';
COMMENT ON FUNCTION get_articles_by_tag_slug IS 'Алиас для get_articles_by_tag с другим именем параметра';
