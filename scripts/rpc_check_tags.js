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
    for (const tag of ['auction', 'news']) {
      console.log('\n-- RPC get_articles_by_tag_slug for', tag);
      const res = await client.query('SELECT * FROM get_articles_by_tag_slug($1, $2)', [tag, 200]);
      const ids = res.rows.map((r) => r.id);
      console.log('count:', ids.length);
      console.log(ids);
    }
    await client.end();
    process.exit(0);
  } catch (e) {
    console.error('RPC check error', e);
    try {
      await client.end();
    } catch (_) {}
    process.exit(1);
  }
})();
