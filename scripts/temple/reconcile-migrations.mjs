#!/usr/bin/env node
/**
 * Read-only reconciliation of repository migrations with the managed
 * supabase_migrations.schema_migrations history.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/temple/reconcile-migrations.mjs
 *
 * It never applies SQL, never writes to the database and never prints secrets.
 * The repo uses descriptive `YYYY-MM-DD_name.sql` files while production
 * records generated `YYYYMMDDHHMMSS_name` versions, so matching is by
 * normalized date + name rather than by string equality.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS = path.join(ROOT, 'migrations');

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.sql$/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function repoMigrations() {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      const match = name.match(/^(\d{4})-(\d{2})-(\d{2})_(.+)\.sql$/);
      const date = match ? `${match[1]}${match[2]}${match[3]}` : null;
      const base = match ? match[4] : name.replace(/\.sql$/, '');

      return {
        file: `migrations/${name}`,
        date,
        base,
        normalized: normalize(base),
      };
    });
}

function classify(repo, production) {
  const matched = [];
  const sourceOnly = [];
  const productionOnly = [];

  const productionUsed = new Set();

  for (const file of repo) {
    const candidates = production.filter((row) => {
      if (normalize(row.name) === file.normalized) return true;

      const productionKey = normalize(`${row.version}_${row.name}`);
      const repoKey = normalize(`${file.date || ''}_${file.base}`);

      return Boolean(file.date) && productionKey.includes(repoKey);
    });

    const hit = candidates.find((row) => !productionUsed.has(row.version));

    if (hit) {
      productionUsed.add(hit.version);
      matched.push({
        file: file.file,
        version: hit.version,
        name: hit.name,
      });
    } else {
      sourceOnly.push(file.file);
    }
  }

  for (const row of production) {
    if (!productionUsed.has(row.version)) {
      productionOnly.push({
        version: row.version,
        name: row.name,
        inserted_at: row.inserted_at,
      });
    }
  }

  return { matched, sourceOnly, productionOnly };
}

async function main() {
  const connectionString =
    process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    console.error('DATABASE_URL, DIRECT_URL or POSTGRES_URL is required.');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const { rows: production } = await client.query(
      `select version, name, inserted_at
       from supabase_migrations.schema_migrations
       order by version`
    );

    const repo = repoMigrations();
    const result = classify(repo, production);

    const { rows: templeObjects } = await client.query(`
      select c.relname as object_name,
             case c.relkind
               when 'r' then 'table'
               when 'v' then 'view'
               when 'm' then 'matview'
               when 'p' then 'partitioned_table'
               else c.relkind::text
             end as object_type,
             c.relrowsecurity as rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and (
          c.relname like 'temple%'
          or c.relname like 'vigil%'
          or c.relname like 'telegram_group_vigil%'
        )
      order by c.relname
    `);

    const { rows: exposedPolicies } = await client.query(`
      select schemaname, tablename, policyname, roles, cmd
      from pg_policies
      where schemaname = 'public'
        and tablename in (
          'temple_log',
          'temple_chronicle_signals',
          'temple_users',
          'vigil_hearts',
          'vigil_spark_claims'
        )
      order by tablename, policyname
    `);

    const { rows: functionGrants } = await client.query(`
      select p.proname,
             pg_get_function_identity_arguments(p.oid) as args,
             p.prosecdef as security_definer,
             coalesce(array_to_string(p.proconfig, ','), '') as config,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'record_temple_chronicle_signal',
          'record_vigil_spark_count'
        )
      order by p.proname
    `);

    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          counts: {
            repoFiles: repo.length,
            productionVersions: production.length,
            matched: result.matched.length,
            sourceOnly: result.sourceOnly.length,
            productionOnly: result.productionOnly.length,
          },
          matched: result.matched,
          sourceOnly: result.sourceOnly,
          productionOnly: result.productionOnly,
          templeObjects,
          exposedPolicies,
          functionGrants,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Reconciliation failed:', error.message);
  process.exit(1);
});
