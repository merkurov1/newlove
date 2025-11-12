const { Client } = require('pg');
(async function () {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL missing');
    process.exit(2);
  }
  const client = new Client({ connectionString: DATABASE_URL, statement_timeout: 60000 });
  await client.connect();
  try {
    const sql = `
-- Replace get_articles_by_tag to use article_to_tag_view and avoid joining the User table
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
    jsonb_build_object('id', a."authorId") as author
  FROM public.articles a
  INNER JOIN public.article_to_tag_view v ON v.article_id = a.id
  INNER JOIN public."Tag" t ON t.id = v.tag_id
  WHERE LOWER(t.slug) = LOWER(tag_slug_param)
  ORDER BY a."publishedAt" DESC NULLS LAST, a."updatedAt" DESC NULLS LAST
  LIMIT limit_param;
END;
$$;

-- Alias for backward compatibility
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

GRANT EXECUTE ON FUNCTION get_articles_by_tag(TEXT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_articles_by_tag_slug(TEXT, INT) TO anon, authenticated, service_role;
`;
    await client.query(sql);
    console.log('RPC functions updated successfully');
  } catch (e) {
    console.error('Failed to update RPC functions', e);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
