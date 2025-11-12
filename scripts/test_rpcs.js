#!/usr/bin/env node
const { Client } = require('pg');

async function run() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('No DATABASE_URL in env. Aborting.');
    process.exit(2);
  }
  const client = new Client({ connectionString: DATABASE_URL, statement_timeout: 20000 });
  try {
    await client.connect();
    console.log('Connected. Calling RPCs...');

    const tagSlug = 'auction';
    try {
      const tagRes = await client.query('SELECT * FROM get_tag_by_slug($1)', [tagSlug]);
      console.log('\nget_tag_by_slug result rows count:', tagRes.rows.length);
      console.log(JSON.stringify(tagRes.rows.slice(0, 3), null, 2));
    } catch (e) {
      console.error('get_tag_by_slug error', String(e));
    }

    try {
      const artRes = await client.query('SELECT * FROM get_articles_by_tag_slug($1, $2) LIMIT 5', [
        tagSlug,
        50,
      ]);
      console.log('\nget_articles_by_tag_slug rows:', artRes.rows.length);
      console.log(JSON.stringify(artRes.rows.slice(0, 5), null, 2));
    } catch (e) {
      console.error('get_articles_by_tag_slug error', String(e));
    }

    // try get_articles_by_tag
    try {
      const artRes2 = await client.query('SELECT * FROM get_articles_by_tag($1, $2) LIMIT 5', [
        tagSlug,
        50,
      ]);
      console.log('\nget_articles_by_tag rows:', artRes2.rows.length);
      console.log(JSON.stringify(artRes2.rows.slice(0, 5), null, 2));
    } catch (e) {
      console.error('get_articles_by_tag error', String(e));
    }

    // try get_articles_by_tag_ids_safe with sample ids from _ArticleToTag
    try {
      const idsRes = await client.query(
        'SELECT DISTINCT COALESCE(A, a, article_id, "articleId") AS article_id FROM "_ArticleToTag" LIMIT 5'
      );
      const ids = idsRes.rows
        .map((r) => r.article_id)
        .filter(Boolean)
        .slice(0, 5);
      console.log('\nSample junction ids:', ids);
      if (ids.length > 0) {
        const safe = await client.query(
          'SELECT * FROM get_articles_by_tag_ids_safe($1, $2) LIMIT 5',
          [ids, 50]
        );
        console.log('\nget_articles_by_tag_ids_safe rows:', safe.rows.length);
        console.log(JSON.stringify(safe.rows.slice(0, 5), null, 2));
      }
    } catch (e) {
      console.error('get_articles_by_tag_ids_safe error', String(e));
    }

    await client.end();
    console.log('\nRPC tests complete.');
    process.exit(0);
  } catch (e) {
    console.error('RPC test failed', e);
    try {
      await client.end();
    } catch (ex) {}
    process.exit(1);
  }
}

run();
