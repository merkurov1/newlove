#!/usr/bin/env node
// scripts/db-diagnostics.js
// Connects to DATABASE_URL from .env and runs a handful of diagnostic queries to help debug permission errors.

const { Client } = require('pg');

async function main() {
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL;
  if (!databaseUrl) {
    console.error('No DATABASE_URL found in env');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();

    const res1 = await client.query("SELECT current_user, session_user, current_setting('search_path') as search_path");
    console.log('current_user / session_user / search_path:', res1.rows);

    const res2 = await client.query("SELECT has_schema_privilege(current_user, 'public', 'USAGE') AS has_usage, has_schema_privilege(current_user, 'public', 'CREATE') AS has_create");
    console.log('schema public privileges for current_user:', res2.rows);

    const res3 = await client.query("SELECT nspname AS schema, pg_catalog.has_schema_privilege(current_user, nspname, 'USAGE') AS has_usage FROM pg_namespace WHERE nspname IN ('public')");
    console.log('pg_namespace check:', res3.rows);

    const res4 = await client.query("SELECT extname, extversion FROM pg_extension ORDER BY extname");
    console.log('installed extensions:', res4.rows.slice(0, 200));

    // Additional checks for service_role and schema ownership
    try {
      const res5 = await client.query("SELECT rolname, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'service_role' OR rolname = current_user");
      console.log('pg_roles for service_role and current_user:', res5.rows);

      const res6 = await client.query("SELECT has_schema_privilege('service_role', 'public', 'USAGE') AS service_role_has_usage, has_schema_privilege('service_role', 'public', 'CREATE') AS service_role_has_create");
      console.log('service_role schema privileges on public:', res6.rows);

      const res7 = await client.query("SELECT nspname, pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname = 'public'");
      console.log('public schema owner:', res7.rows);
    } catch (e) {
      console.error('Additional checks failed (continuing):', e.message || e);
    }

    await client.end();
  } catch (e) {
    console.error('Diagnostics failed:', e);
    try { await client.end(); } catch(_){}
    process.exit(1);
  }
}

main();
