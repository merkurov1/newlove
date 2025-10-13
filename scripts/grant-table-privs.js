#!/usr/bin/env node
const { Client } = require('pg');
(async()=>{
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await c.connect();
    const queries = [
      "GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLE public.\"Tag\" TO service_role;",
      "GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLE public.\"_ArticleToTag\" TO service_role;"
    ];
    for (const q of queries) {
      try { await c.query(q); console.log('OK:', q); } catch(e) { console.error('Fail:', q, e.message || e); }
    }
    await c.end();
  } catch (e) { console.error(e); try{await c.end()}catch(_){}};
})();
