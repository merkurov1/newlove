#!/usr/bin/env node
const { Client } = require('pg');

(async()=>{
  const tables = process.argv.length > 2 ? process.argv.slice(2) : ['articles','projects','subscribers','Tag','_ArticleToTag'];
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();
    // Owners
    const owners = await c.query("SELECT schemaname, tablename, tableowner FROM pg_tables WHERE tablename = ANY($1)", [tables]);
    console.log('owners (pg_tables):', owners.rows);

    // Grants for each table
    for (const t of tables) {
      const res = await c.query("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name=$1 ORDER BY grantee", [t]);
      console.log(`grants for ${t}:`, res.rows);
      const policies = await c.query("SELECT polname, permissive, roles, qual, with_check FROM pg_policies WHERE tablename=$1", [t]);
      console.log(`policies for ${t}:`, policies.rows);
    }

    await c.end();
  } catch (e) {
    console.error('failed:', e);
    try { await c.end(); } catch(_){}
    process.exit(1);
  }
})();
