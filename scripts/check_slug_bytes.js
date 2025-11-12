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
    const ids = ['fqffi8xai74uu0jsgkp9wyjg', 'up85m8hhtlyabtszr1dinatq'];
    for (const id of ids) {
      const r = await client.query(
        "SELECT id, slug, octet_length(slug) AS bytes_len, char_length(slug) AS chars_len, encode(convert_to(slug,'UTF8'),'hex') AS hex FROM public.articles WHERE id=$1",
        [id]
      );
      console.log('\n---', id);
      console.log(r.rows);
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
