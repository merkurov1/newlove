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
    const slugs = [
      'claude-monet-1840-1926-nymphas',
      'marlen-dyuma-voshla-v-postoyannuyu-kollektsiyu-luvra',
    ];
    for (const s of slugs) {
      console.log('\n--- Checking article slug:', s);
      const a = await client.query(
        'SELECT id, slug, title, published, "publishedAt", "updatedAt" FROM public.articles WHERE slug = $1',
        [s]
      );
      console.log('article rows:', a.rows);
      if (a.rows.length) {
        const id = a.rows[0].id;
        const links = await client.query(
          'SELECT v.article_id, v.tag_id, t.slug AS tag_slug, t.name FROM public.article_to_tag_view v JOIN public."Tag" t ON v.tag_id::text = t.id::text WHERE v.article_id::text = $1',
          [id]
        );
        console.log('links:', links.rows);
      }
    }
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
