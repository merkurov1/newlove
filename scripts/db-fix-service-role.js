#!/usr/bin/env node
// scripts/db-fix-service-role.js
// Execute GRANT statements to give 'service_role' privileges on schema public and extensions.

const { Client } = require('pg');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('No DATABASE_URL found in env');
    process.exit(1);
  }
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    console.log('Connected as, running grants...');
    const queries = [
      "GRANT USAGE ON SCHEMA public TO service_role;",
      "GRANT CREATE ON SCHEMA public TO service_role;",
      "GRANT USAGE ON SCHEMA extensions TO service_role;"
    ];
    for (const q of queries) {
      try {
        await client.query(q);
        console.log('OK:', q);
      } catch (e) {
        console.error('Failed:', q, e.message || e);
      }
    }
    await client.end();
    console.log('Done.');
  } catch (e) {
    console.error('Error running grants:', e);
    try { await client.end(); } catch(_){}
    process.exit(1);
  }
}

main();
