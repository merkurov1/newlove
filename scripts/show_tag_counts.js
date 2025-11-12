#!/usr/bin/env node
const { Client } = require('pg');
(async function () {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('No DATABASE_URL in env');
    process.exit(2);
  }
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    console.log('Tags:');
    const t = await client.query('SELECT id, slug, name FROM public."Tag" ORDER BY slug');
    console.table(t.rows);

    console.log('\nLinks per tag (from article_to_tag_view):');
    const counts = await client.query(
      'SELECT t.slug, COUNT(*) AS links FROM public.article_to_tag_view v JOIN public."Tag" t ON v.tag_id::text = t.id::text GROUP BY t.slug ORDER BY links DESC'
    );
    console.table(counts.rows);

    console.log('\nSample article_ids for news:');
    const news = await client.query(
      'SELECT v.article_id FROM public.article_to_tag_view v JOIN public."Tag" t ON v.tag_id::text = t.id::text WHERE t.slug ILIKE \'news\' ORDER BY v.article_id LIMIT 200'
    );
    console.log(news.rows.map((r) => r.article_id));

    console.log('\nSample article_ids for auction:');
    const auc = await client.query(
      'SELECT v.article_id FROM public.article_to_tag_view v JOIN public."Tag" t ON v.tag_id::text = t.id::text WHERE t.slug ILIKE \'auction\' ORDER BY v.article_id LIMIT 200'
    );
    console.log(auc.rows.map((r) => r.article_id));

    await client.end();
    process.exit(0);
  } catch (e) {
    console.error('Query error', e);
    try {
      await client.end();
    } catch (_) {}
    process.exit(1);
  }
})();
