#!/usr/bin/env node
const { Client } = require('pg');
(async()=>{
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();
  // Use pg_tables to get owner (information_schema.tables doesn't expose table owner)
  const res1 = await c.query("SELECT schemaname, tablename, tableowner FROM pg_tables WHERE tablename IN ('Tag','_ArticleToTag')");
  console.log('owners (pg_tables):', res1.rows);
  const res2 = await c.query("SELECT grantee, privilege_type, table_name FROM information_schema.role_table_grants WHERE table_name IN ('Tag','_ArticleToTag') ORDER BY table_name, grantee");
  console.log('grants (information_schema.role_table_grants):', res2.rows);
    await c.end();
  } catch (e) {
    console.error('failed:', e);
    try { await c.end(); } catch(_){}
    process.exit(1);
  }
})();
