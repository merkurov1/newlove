#!/usr/bin/env node
// scripts/grant-projects-privs.js
// Run with DATABASE_URL env set to the target database (superuser/db owner required)

const { Client } = require('pg');

(async function main() {
  const conn = process.env.DATABASE_URL;
  if (!conn) {
    console.error('Please set DATABASE_URL environment variable');
    process.exit(1);
  }
  const c = new Client({ connectionString: conn });
  try {
    await c.connect();
    const q = "GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLE public.projects TO service_role;";
    try {
      await c.query(q);
      console.log('OK:', q);
    } catch (e) {
      console.error('Fail:', q, e.message || e);
    }

    // Optionally grant on junction table
    const q2 = "GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLE public.\"_ProjectToTag\" TO service_role;";
    try {
      await c.query(q2);
      console.log('OK:', q2);
    } catch (e) {
      console.error('Fail:', q2, e.message || e);
    }

    await c.end();
  } catch (e) {
    console.error(e);
    try { await c.end(); } catch(_){}
    process.exit(1);
  }
})();
