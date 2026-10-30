#!/usr/bin/env node
/**
 * Post-migration exposure verification for the 2026-10-30 security hardening.
 *
 * It never prints row contents: only HTTP status codes, exact row counts and
 * schema metadata. Run against staging first, then production:
 *
 *   node --env-file=.env.production.local scripts/security/verify-supabase-exposure.mjs
 *
 * Expected failures before applying the migration (that is the point of the
 * audit), expected pass after.
 */

import { Client } from 'pg';

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(
  /\/$/,
  ''
);
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const databaseUrl = process.env.DATABASE_URL;

if (!url || !anon) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.');
  process.exit(2);
}

const PRIVATE_TABLES = [
  'accounts',
  'sessions',
  'verificationtokens',
  'subscriber_tokens',
  'orders',
  'user_roles',
  'roles',
  'messages',
  'revalidation_audit',
  'liveheart_shares',
  'project_tags',
  'subscribers_backup_20251128',
  'products',
  'access_requests',
  'auction_lots',
  'bot_sessions',
  'casts',
  'distributions',
  'flow_issue_template_versions',
  'ingest_log',
  'item_versions',
  'knowledge_documents',
  'knowledge_chunks',
  'letter_comments',
  'parse_logs',
  'pierrot_conversations',
  'pierrot_messages',
  'pierrot_events',
  'pierrot_offer_policies',
  'research_tasks',
  'whispers',
  'brain_document_extractions',
  'brain_document_topics',
  'brain_editorial_suggestions',
  'brain_entities',
  'brain_entity_mentions',
  'brain_graph_jobs',
  'brain_graph_runs',
  'brain_ingestion_jobs',
  'brain_ingestion_runs',
  'brain_radar_runs',
  'brain_relationships',
  'brain_thematic_summaries',
  'art_service_leads',
  'flow_ai_context',
  'subscribers',
  'users',
  'temple_users',
  'todo',
  'newsletter_jobs',
  'newsletter_logs',
];

const PUBLIC_TABLES = [
  'articles',
  'projects',
  'issues',
  'letters',
  'postcards',
  'media_archive_records',
  'lots',
  'Tag',
  '_ArticleToTag',
  'temple_log',
  'vigil_hearts',
];

const failures = [];
const notes = [];

async function probe(path) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: 'HEAD',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });

  return {
    status: response.status,
    range: response.headers.get('content-range') || '',
  };
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

console.log('Data API probes (anon key, no rows are read):');
for (const table of PRIVATE_TABLES) {
  const { status, range } = await probe(`${encodeURIComponent(table)}?select=*`);
  const empty = range === '*/0';
  const denied = status === 401 || status === 403 || status === 404;
  assert(denied || empty, `${table}: anon can read rows (${status}, ${range})`);
  console.log(`${String(status).padEnd(4)} ${range.padEnd(12)} ${table}`);
}

for (const table of PUBLIC_TABLES) {
  const { status, range } = await probe(`${encodeURIComponent(table)}?select=*`);
  const readable = status === 200;
  assert(readable, `${table}: public read was expected but returned ${status}`);
  console.log(`${String(status).padEnd(4)} ${range.padEnd(12)} ${table}`);
}

const draftProbe = await probe('articles?select=id&published=eq.false');
assert(
  draftProbe.status === 401 ||
    draftProbe.status === 403 ||
    draftProbe.range === '*/0' ||
    draftProbe.range.endsWith('/0'),
  `articles: drafts are readable by anon (${draftProbe.status}, ${draftProbe.range})`
);

const roleProbe = await fetch(`${url}/rest/v1/rpc/get_my_user_roles_any`, {
  method: 'POST',
  headers: {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ uid_text: '00000000-0000-0000-0000-000000000000' }),
});
assert(
  roleProbe.status === 401 || roleProbe.status === 403 || roleProbe.status === 404,
  `get_my_user_roles_any is still executable by anon (${roleProbe.status})`
);

if (databaseUrl) {
  console.log('\nSchema checks (DATABASE_URL):');
  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const rlsOff = await client.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p')
          and c.relrowsecurity = false and c.relname = any($1::text[])
        order by c.relname`,
      [PRIVATE_TABLES]
    );
    assert(
      rlsOff.rowCount === 0,
      `RLS is still disabled on: ${rlsOff.rows.map((r) => r.relname).join(', ')}`
    );

    const grants = await client.query(
      `select table_name, grantee, privilege_type
         from information_schema.role_table_grants
        where table_schema='public' and grantee in ('anon','authenticated')
          and table_name = any($1::text[])
        order by table_name, grantee, privilege_type`,
      [PRIVATE_TABLES]
    );

    // Own-row SELECT is intentional for these two tables after the migration.
    const allowedGrants = new Set([
      'subscribers:authenticated:SELECT',
      'users:authenticated:SELECT',
    ]);
    const unexpectedGrants = grants.rows.filter(
      (row) => !allowedGrants.has(`${row.table_name}:${row.grantee}:${row.privilege_type}`)
    );

    assert(
      unexpectedGrants.length === 0,
      `private tables still granted to anon/authenticated: ${unexpectedGrants
        .map((r) => `${r.table_name}:${r.grantee}:${r.privilege_type}`)
        .join(', ')}`
    );

    const openSubscriberPolicy = await client.query(
      `select policyname from pg_policies
        where schemaname='public' and tablename='subscribers'
          and coalesce(qual,'') in ('true','(true)')`
    );
    assert(openSubscriberPolicy.rowCount === 0, 'subscribers still has a USING (true) policy');

    const anonRpc = await client.query(
      `select has_function_privilege('anon','public.get_my_user_roles_any(text)','EXECUTE') as allowed`
    );
    assert(anonRpc.rows[0]?.allowed === false, 'get_my_user_roles_any is still executable by anon');
  } finally {
    await client.end();
  }
} else {
  notes.push('DATABASE_URL is not set; schema-level checks were skipped.');
}

console.log('\nResult:');
if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  for (const note of notes) console.log(`NOTE  ${note}`);
  process.exit(1);
}

console.log('PASS — private data is denied to anon, public reads still work.');
for (const note of notes) console.log(`NOTE  ${note}`);
