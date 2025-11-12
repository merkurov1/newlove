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
    console.log('Connected to Postgres. Running diagnostics...\n');

    const queries = [
      {
        name: 'tables_like_article_tag',
        sql: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND (tablename ILIKE '%article%' OR tablename ILIKE '%tag%') ORDER BY tablename;`,
      },
      {
        name: 'count_articles',
        sql: `SELECT COUNT(*) AS cnt FROM pg_catalog.pg_tables WHERE false;`, // placeholder
      },
    ];

    // run table discovery
    const tblRes = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`
    );
    const tables = tblRes.rows.map((r) => r.tablename);
    console.log('Public tables (count):', tables.length);
    console.log(tables.join(', '));

    // helper to safe query if table exists
    async function sampleIfExists(table, cols = '*', limit = 5) {
      if (!tables.includes(table)) return { exists: false };
      try {
        const q = `SELECT ${cols} FROM public."${table}" LIMIT ${limit};`;
        const res = await client.query(q);
        return { exists: true, rows: res.rows };
      } catch (e) {
        return { exists: true, error: String(e) };
      }
    }

    // check common tables
    const want = [
      'articles',
      'Article',
      'Tag',
      'tags',
      '_ArticleToTag',
      'article_to_tag',
      'article_tags',
    ];
    const samples = {};
    for (const t of want) {
      samples[t] = await sampleIfExists(t);
    }

    // check counts for canonical names
    async function countIfExists(table) {
      if (!tables.includes(table)) return null;
      try {
        const res = await client.query(`SELECT COUNT(*)::bigint AS cnt FROM public."${table}";`);
        return res.rows[0].cnt;
      } catch (e) {
        return `error: ${String(e)}`;
      }
    }

    const counts = {};
    for (const t of ['articles', 'Tag', '_ArticleToTag']) {
      counts[t] = await countIfExists(t);
    }

    // check functions/rpc
    const funcs = await client.query(
      `SELECT proname, pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND proname ILIKE 'get_%';`
    );

    // indexes on articles for slug
    let idxs = [];
    if (tables.includes('articles')) {
      const idxRes = await client.query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'articles';`
      );
      idxs = idxRes.rows;
    }

    // find orphan relations if junction exists
    let orphanCheck = null;
    if (tables.includes('_ArticleToTag') && tables.includes('articles')) {
      try {
        const res = await client.query(
          `SELECT jt.* FROM public."_ArticleToTag" jt LEFT JOIN public.articles a ON (COALESCE(jt.A, jt.a, jt.article_id, jt."articleId")::text = a.id::text) WHERE a.id IS NULL LIMIT 30;`
        );
        orphanCheck = res.rows;
      } catch (e) {
        orphanCheck = `error: ${String(e)}`;
      }
    }

    console.log('\n--- SAMPLES ---');
    for (const k of Object.keys(samples)) {
      console.log(`\nTable: ${k} (exists=${samples[k].exists})`);
      if (samples[k].exists) {
        if (samples[k].error) console.log('  sample error:', samples[k].error);
        else console.log('  rows:', JSON.stringify(samples[k].rows, null, 2));
      }
    }

    console.log('\n--- COUNTS ---');
    console.log(counts);

    console.log('\n--- RPC/Functions matching get_% ---');
    console.log(funcs.rows.map((r) => r.proname));

    console.log('\n--- INDEXES ON articles ---');
    console.log(idxs.length ? JSON.stringify(idxs, null, 2) : 'none');

    console.log('\n--- ORPHAN RELATIONS SAMPLE ---');
    console.log(Array.isArray(orphanCheck) ? JSON.stringify(orphanCheck, null, 2) : orphanCheck);

    await client.end();
    console.log('\nDiagnostics complete.');
    process.exit(0);
  } catch (e) {
    console.error('DB audit failed:', e);
    try {
      await client.end();
    } catch (ex) {}
    process.exit(1);
  }
}

run();
