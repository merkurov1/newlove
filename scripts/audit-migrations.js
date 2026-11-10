#!/usr/bin/env node
/**
 * Read-only audit of repository migrations against the live database.
 *
 * It checks named tables, views, functions, indexes, types and columns. It
 * intentionally does not apply SQL. Diagnostic and test SQL from 2025-11-09 is
 * skipped because those files are not migrations.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/audit-migrations.js
 *   node scripts/audit-migrations.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..');

for (const envFile of ['.env.production.local', '.env.local', '.env']) {
  const envPath = path.join(ROOT, envFile);
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}

const MIGRATIONS = path.join(ROOT, 'migrations');
const SKIP = /^2025-11-09_(FULL|check_|debug_|test_)/i;

function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql') && !SKIP.test(name))
    .sort();
}

function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}

function collect(re, sql) {
  const out = new Set();
  let match;
  while ((match = re.exec(sql))) out.add(match[1].replace(/^"|"$/g, '').toLowerCase());
  return out;
}

(async () => {
  const connectionString =
    process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    console.error('DATABASE_URL, DIRECT_URL or POSTGRES_URL is required.');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const rows = async (sql) => (await client.query(sql)).rows;
  const set = (values, key) => new Set(values.map((row) => row[key].toLowerCase()));

  const tables = set(
    await rows(`select table_name from information_schema.tables where table_schema='public'`),
    'table_name'
  );
  const views = set(
    await rows(`select table_name from information_schema.views where table_schema='public'`),
    'table_name'
  );
  const matviews = set(
    await rows(`select matviewname from pg_matviews where schemaname='public'`),
    'matviewname'
  );
  const functions = set(
    await rows(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`
    ),
    'proname'
  );
  const indexes = set(
    await rows(`select indexname from pg_indexes where schemaname='public'`),
    'indexname'
  );
  const types = set(
    await rows(
      `select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'`
    ),
    'typname'
  );
  const columns = new Set(
    (
      await rows(
        `select table_name || '.' || column_name as name from information_schema.columns where table_schema='public'`
      )
    ).map((row) => row.name.toLowerCase())
  );

  const report = [];

  for (const file of migrationFiles()) {
    const sql = stripComments(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));

    const fileTables = collect(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
      sql
    );
    const fileViews = collect(
      /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
      sql
    );
    const fileFunctions = collect(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi,
      sql
    );
    const fileIndexes = collect(
      /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
      sql
    );
    const fileTypes = collect(
      /create\s+type\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
      sql
    );

    const fileColumns = new Set();
    const alterRe =
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+([\s\S]*?);/gi;
    let alter;
    while ((alter = alterRe.exec(sql))) {
      const table = alter[1].toLowerCase();
      const columnRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?("?[a-z0-9_]+"?)/gi;
      let column;
      while ((column = columnRe.exec(alter[2]))) {
        const name = column[1].replace(/^"|"$/g, '').toLowerCase();
        if (name !== 'if') fileColumns.add(`${table}.${name}`);
      }
    }

    const missing = {
      tables: [...fileTables].filter((name) => !tables.has(name)),
      views: [...fileViews].filter((name) => !views.has(name) && !matviews.has(name)),
      functions: [...fileFunctions].filter((name) => !functions.has(name)),
      indexes: [...fileIndexes].filter((name) => !indexes.has(name)),
      types: [...fileTypes].filter((name) => !types.has(name)),
      columns: [...fileColumns].filter((name) => !columns.has(name)),
    };

    if (Object.values(missing).some((items) => items.length > 0)) {
      report.push({ file, missing });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nFiles checked: ${migrationFiles().length}`);
  console.log(`Files with missing named objects: ${report.length}`);

  await client.end();
  if (report.length > 0) process.exitCode = 1;
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
