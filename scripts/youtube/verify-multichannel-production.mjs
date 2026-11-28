#!/usr/bin/env node
/**
 * Read-only production verification for the multi-channel YouTube integration.
 *
 * Production migration `20261126140616`
 * (youtube_multichannel_connections_and_bindings) is the source of truth for
 * the live schema. This script never creates, alters or deletes anything and
 * never selects token values: it only checks `token_ciphertext IS NOT NULL`.
 *
 * Usage (DATABASE_URL must be a read-only or service-role Postgres URL kept
 * outside the repository):
 *
 *   node --env-file=.env.production.local scripts/youtube/verify-multichannel-production.mjs
 *   node --env-file=.env.production.local scripts/youtube/verify-multichannel-production.mjs --json
 *   node scripts/youtube/verify-multichannel-production.mjs --self-test
 *
 * Exit codes:
 *   0  schema and expected project mapping accepted
 *   1  one or more checks failed
 *   2  DATABASE_URL is missing or the connection failed
 *
 * The output contains masked account emails, internal ids and token-presence
 * booleans only. It never contains refresh/access tokens, cookies or OAuth
 * state.
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import pg from 'pg';

const { Client } = pg;

const TABLES = [
  'youtube_oauth_connections',
  'youtube_channels',
  'youtube_project_bindings',
  'youtube_management_audit',
];

const REQUIRED_COLUMNS = {
  youtube_oauth_connections: [
    'id',
    'owner_id',
    'google_account_email',
    'status',
    'scopes',
    'token_ciphertext',
    'token_iv',
    'token_tag',
    'token_key_version',
    'connected_at',
    'last_checked_at',
    'last_error_code',
    'last_error_message',
    'revoked_at',
    'created_at',
    'updated_at',
  ],
  youtube_channels: [
    'id',
    'connection_id',
    'owner_id',
    'channel_id',
    'title',
    'handle',
    'uploads_playlist_id',
    'thumbnail_url',
    'status',
    'hidden_subscriber_count',
    'subscriber_count',
    'view_count',
    'video_count',
    'last_synced_at',
    'created_at',
    'updated_at',
  ],
  youtube_project_bindings: [
    'id',
    'owner_id',
    'project_slug',
    'channel_record_id',
    'channel_id',
    'is_active',
    'created_by',
    'created_at',
    'updated_at',
  ],
  youtube_management_audit: [
    'id',
    'actor_id',
    'project',
    'action',
    'status',
    'channel_id',
    'target_id',
    'destructive',
    'external',
    'error_code',
    'changed_fields',
    'result_summary',
    'created_at',
  ],
};

const OWNER_ID_TABLES = [
  'youtube_oauth_connections',
  'youtube_channels',
  'youtube_project_bindings',
];

const DEFAULT_EXPECTED = [
  { project: 'art-engine', handle: '@merkurov-art' },
  { project: 'unframed', handle: '@unframed-tv' },
  { project: 'pierrot', handle: '@unframed-tv' },
  { project: 'heart-and-angel', handle: '@heartandangel' },
];

export function maskEmail(value) {
  const email = typeof value === 'string' ? value.trim() : '';
  if (!email) return null;

  const at = email.indexOf('@');
  if (at <= 0) return '***';

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

export function normalizeHandle(value) {
  return String(value ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
}

export function parseExpected(value) {
  if (!value) return DEFAULT_EXPECTED;

  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(':');
      const project = separator === -1 ? part : part.slice(0, separator);
      const handle = separator === -1 ? '' : part.slice(separator + 1);
      return { project: project.trim(), handle: handle.trim() };
    });
}

function check(name, ok, detail) {
  return { name, ok: Boolean(ok), detail: detail == null ? null : String(detail) };
}

function uniqueDefinition(definition) {
  return String(definition ?? '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function hasUniqueColumns(entries, columns) {
  const wanted = columns.map((column) => column.toLowerCase());
  return entries.some((entry) => {
    const definition = uniqueDefinition(entry.definition ?? entry.indexdef);
    return (
      /\bunique\b/.test(definition) &&
      wanted.every((column) => new RegExp(`\\b${column}\\b`).test(definition))
    );
  });
}

export function buildSchemaSnapshot(rows) {
  const tables = new Set((rows.tables ?? []).map((row) => row.table_name));
  const columns = new Map();
  const owners = new Map();

  for (const row of rows.columns ?? []) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Map());
    columns.get(row.table_name).set(row.column_name, row.udt_name || row.data_type || '');
    if (row.column_name === 'owner_id') owners.set(row.table_name, row.udt_name || row.data_type);
  }

  return {
    tables,
    columns,
    owners,
    constraints: rows.constraints ?? [],
    indexes: rows.indexes ?? [],
    rls: new Map((rows.rls ?? []).map((row) => [row.relname, row.relrowsecurity === true])),
    grants: rows.grants ?? [],
  };
}

export function evaluateSchema(snapshot) {
  const checks = [];

  for (const table of TABLES) {
    checks.push(check(`table:${table}`, snapshot.tables.has(table), 'present'));
  }

  for (const [table, expected] of Object.entries(REQUIRED_COLUMNS)) {
    const actual = snapshot.columns.get(table) ?? new Map();
    for (const column of expected) {
      checks.push(
        check(`column:${table}.${column}`, actual.has(column), actual.get(column) || 'missing')
      );
    }
  }

  for (const table of OWNER_ID_TABLES) {
    const type = snapshot.owners.get(table);
    checks.push(check(`owner_id:${table}:uuid`, type === 'uuid', type || 'missing'));
  }

  const entriesFor = (table) => [
    ...snapshot.constraints.filter((row) => row.table_name === table),
    ...snapshot.indexes
      .filter((row) => row.tablename === table)
      .map((row) => ({ definition: row.indexdef })),
  ];

  const connectionKeys = entriesFor('youtube_oauth_connections');
  const channelKeys = entriesFor('youtube_channels');
  const bindingIndexes = snapshot.indexes.filter(
    (row) => row.tablename === 'youtube_project_bindings'
  );

  checks.push(
    check(
      'unique:connections.owner_id+google_account_email',
      hasUniqueColumns(connectionKeys, ['owner_id', 'google_account_email']),
      'owner/account pair'
    )
  );
  checks.push(
    check(
      'unique:channels.owner_id+channel_id',
      hasUniqueColumns(channelKeys, ['owner_id', 'channel_id']),
      'owner/channel pair'
    )
  );
  checks.push(
    check(
      'unique:bindings.owner_id+project_slug(active)',
      bindingIndexes.some((entry) => {
        const definition = uniqueDefinition(entry.indexdef);
        return (
          /\bunique\b/.test(definition) &&
          /\bowner_id\b/.test(definition) &&
          /\bproject_slug\b/.test(definition) &&
          /\bwhere\b.*\bis_active\b/.test(definition)
        );
      }),
      'one active channel per project'
    )
  );

  for (const table of TABLES) {
    checks.push(check(`rls:${table}`, snapshot.rls.get(table) === true, 'enabled'));
  }

  const publicGrants = snapshot.grants.filter(
    (row) => row.anon_access === true || row.authenticated_access === true
  );
  checks.push(
    check(
      'grants:anon+authenticated',
      publicGrants.length === 0,
      publicGrants.length === 0
        ? 'none'
        : `${publicGrants.map((row) => row.table_name).join(', ')} still grant access`
    )
  );

  return {
    ok: checks.every((item) => item.ok),
    checks,
    failed: checks.filter((item) => !item.ok).map((item) => item.name),
  };
}

export function evaluateState(state, expected = DEFAULT_EXPECTED) {
  const checks = [];
  const connections = state.connections ?? [];
  const channels = state.channels ?? [];
  const bindings = state.bindings ?? [];

  const channelsById = new Map(channels.map((channel) => [channel.id, channel]));
  const connectionsById = new Map(connections.map((connection) => [connection.id, connection]));
  const bindingsByProject = new Map(bindings.map((binding) => [binding.project_slug, binding]));

  const connectedConnections = connections.filter(
    (connection) => connection.status === 'connected'
  );

  checks.push(
    check(
      'connections:at-least-two',
      connectedConnections.length >= 2,
      String(connectedConnections.length)
    )
  );
  checks.push(check('channels:at-least-three', channels.length >= 3, String(channels.length)));

  for (const connection of connections) {
    if (connection.status === 'revoked') {
      // Revoked rows are retained as history. They must not keep a token.
      checks.push(
        check(
          `connection:${connection.id}:revoked-clean`,
          connection.has_refresh_token === false,
          connection.has_refresh_token ? 'token remains' : 'no token'
        )
      );
      continue;
    }

    checks.push(
      check(
        `connection:${connection.id}:connected`,
        connection.status === 'connected',
        connection.status
      )
    );
    checks.push(
      check(
        `connection:${connection.id}:refresh-token`,
        connection.has_refresh_token === true,
        connection.has_refresh_token ? 'present' : 'missing'
      )
    );
  }

  const connectedIds = new Set();

  for (const expectedBinding of expected) {
    const binding = bindingsByProject.get(expectedBinding.project);
    const channel = binding ? channelsById.get(binding.channel_record_id) : null;
    const handleMatches =
      Boolean(binding) &&
      handleMatchesExpected(channel?.handle ?? binding?.handle, expectedBinding.handle);

    checks.push(
      check(
        `binding:${expectedBinding.project}`,
        Boolean(binding),
        binding ? `${binding.channel_id}` : 'missing'
      )
    );
    checks.push(
      check(
        `binding:${expectedBinding.project}:handle`,
        handleMatches,
        channel?.handle || binding?.handle || 'missing'
      )
    );

    if (binding && channel) {
      const connection = connectionsById.get(channel.connection_id);
      connectedIds.add(channel.connection_id);
      checks.push(
        check(
          `binding:${expectedBinding.project}:channel-active`,
          channel.status === 'active',
          channel.status
        )
      );
      checks.push(
        check(
          `binding:${expectedBinding.project}:connection-connected`,
          connection?.status === 'connected',
          connection?.status || 'missing'
        )
      );
    }
  }

  checks.push(
    check(
      'bindings:independent-connections',
      connectedIds.size >= 2,
      `${connectedIds.size} distinct connection(s)`
    )
  );

  return {
    ok: checks.every((item) => item.ok),
    checks,
    failed: checks.filter((item) => !item.ok).map((item) => item.name),
  };
}

function handleMatchesExpected(actual, expected) {
  const left = normalizeHandle(actual);
  const right = normalizeHandle(expected);
  return Boolean(left) && Boolean(right) && left === right;
}

async function propertyRows(client) {
  const queries = {
    tables: {
      text: `
        select table_name
        from information_schema.tables
        where table_schema = 'public' and table_name = any($1::text[])
      `,
      values: [TABLES],
    },
    columns: {
      text: `
        select table_name, column_name, data_type, udt_name
        from information_schema.columns
        where table_schema = 'public' and table_name = any($1::text[])
        order by table_name, ordinal_position
      `,
      values: [TABLES],
    },
    constraints: {
      text: `
        select c.conrelid::regclass::text as table_name,
               c.conname,
               c.contype,
               pg_get_constraintdef(c.oid) as definition
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = any($1::text[])
      `,
      values: [TABLES],
    },
    indexes: {
      text: `
        select tablename, indexname, indexdef
        from pg_indexes
        where schemaname = 'public' and tablename = any($1::text[])
      `,
      values: [TABLES],
    },
    rls: {
      text: `
        select c.relname, c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1::text[])
      `,
      values: [TABLES],
    },
    grants: {
      text: `
        select c.relname as table_name,
               case
                 when to_regrole('anon') is null then false
                 else has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
               end as anon_access,
               case
                 when to_regrole('authenticated') is null then false
                 else has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
               end as authenticated_access
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1::text[])
      `,
      values: [TABLES],
    },
  };

  const rows = {};
  for (const [key, query] of Object.entries(queries)) {
    const result = await client.query(query.text, query.values);
    rows[key] = result.rows;
  }

  return rows;
}

async function stateRows(client) {
  const connections = await client.query(`
    select id,
           google_account_email,
           status,
           scopes,
           (token_ciphertext is not null) as has_refresh_token,
           connected_at,
           last_checked_at,
           last_error_code,
           revoked_at
    from public.youtube_oauth_connections
    order by connected_at nulls last, id
  `);

  const channels = await client.query(`
    select id, connection_id, channel_id, title, handle, status, last_synced_at
    from public.youtube_channels
    order by title nulls last, channel_id
  `);

  const bindings = await client.query(`
    select b.id,
           b.project_slug,
           b.channel_record_id,
           b.channel_id,
           b.is_active,
           b.updated_at,
           c.title,
           c.handle,
           c.status as channel_status,
           c.connection_id,
           co.google_account_email,
           co.status as connection_status,
           (co.token_ciphertext is not null) as has_refresh_token
    from public.youtube_project_bindings b
    join public.youtube_channels c on c.id = b.channel_record_id
    join public.youtube_oauth_connections co on co.id = c.connection_id
    where b.is_active
    order by b.project_slug
  `);

  const audit = await client.query(`
    select count(*)::int as row_count, max(created_at) as latest_at
    from public.youtube_management_audit
  `);

  return {
    connections: connections.rows,
    channels: channels.rows,
    bindings: bindings.rows,
    audit: audit.rows[0] ?? { row_count: 0, latest_at: null },
  };
}

function safeDatabaseHost(value) {
  try {
    return new URL(value).hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

function printHuman(report) {
  console.log('YouTube multi-channel production verification');
  console.log(`database: ${report.databaseHost} (read-only)`);
  console.log(`schema: ${report.schema.ok ? 'OK' : 'FAILED'}`);

  for (const item of report.schema.checks) {
    if (!item.ok) console.log(`  FAIL ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
  }

  console.log(`state: ${report.state.ok ? 'OK' : 'FAILED'}`);

  for (const item of report.state.checks) {
    if (!item.ok) console.log(`  FAIL ${item.name}${item.detail ? ` (${item.detail})` : ''}`);
  }

  console.log(`connections: ${report.state.connections.length}`);
  for (const connection of report.state.connections) {
    console.log(
      `  - ${maskEmail(connection.google_account_email)} · ${connection.status} · token=${
        connection.has_refresh_token ? 'yes' : 'no'
      } · ${connection.id}`
    );
  }

  console.log(`channels: ${report.state.channels.length}`);
  for (const channel of report.state.channels) {
    console.log(
      `  - ${channel.handle || '—'} · ${channel.title || '—'} · ${channel.channel_id} · ${channel.status}`
    );
  }

  console.log('active bindings:');
  for (const binding of report.state.bindings) {
    console.log(
      `  - ${binding.project_slug} → ${binding.handle || '—'} (${binding.channel_id}) · ${
        binding.channel_status
      } · ${maskEmail(binding.google_account_email)} · ${binding.connection_status}`
    );
  }

  console.log(
    `audit rows: ${report.state.audit.row_count}${
      report.state.audit.latest_at ? ` · latest ${report.state.audit.latest_at}` : ''
    }`
  );
  console.log(report.ok ? 'RESULT: PASS' : 'RESULT: FAIL');
  if (!report.ok) {
    console.log('Failed checks: ' + [...report.schema.failed, ...report.state.failed].join(', '));
  }
}

function selfTest() {
  const schemaRows = {
    tables: TABLES.map((table_name) => ({ table_name })),
    columns: Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) =>
      columns.map((column) => ({
        table_name: table,
        column_name: column,
        data_type: column === 'owner_id' ? 'uuid' : 'text',
        udt_name: column === 'owner_id' ? 'uuid' : 'text',
      }))
    ),
    constraints: [
      {
        table_name: 'youtube_oauth_connections',
        conname: 'youtube_oauth_connections_owner_id_google_account_email_key',
        contype: 'u',
        definition: 'UNIQUE (owner_id, google_account_email)',
      },
      {
        table_name: 'youtube_channels',
        conname: 'youtube_channels_owner_id_channel_id_key',
        contype: 'u',
        definition: 'UNIQUE (owner_id, channel_id)',
      },
    ],
    indexes: [
      {
        tablename: 'youtube_project_bindings',
        indexname: 'youtube_project_bindings_active_project_idx',
        indexdef:
          'CREATE UNIQUE INDEX youtube_project_bindings_active_project_idx ON public.youtube_project_bindings USING btree (owner_id, project_slug) WHERE is_active',
      },
    ],
    rls: TABLES.map((relname) => ({ relname, relrowsecurity: true })),
    grants: [],
  };

  const schema = evaluateSchema(buildSchemaSnapshot(schemaRows));
  if (!schema.ok) throw new Error(`schema self-test failed: ${schema.failed.join(', ')}`);

  const broken = buildSchemaSnapshot({
    ...schemaRows,
    columns: schemaRows.columns.map((column) =>
      column.table_name === 'youtube_channels' && column.column_name === 'owner_id'
        ? { ...column, data_type: 'text', udt_name: 'text' }
        : column
    ),
  });

  if (evaluateSchema(broken).ok) throw new Error('schema self-test did not detect text owner_id');

  const state = {
    connections: [
      {
        id: 'connection-a',
        google_account_email: 'merkurov@gmail.com',
        status: 'connected',
        has_refresh_token: true,
      },
      {
        id: 'connection-b',
        google_account_email: 'unframed@example.com',
        status: 'connected',
        has_refresh_token: true,
      },
      {
        id: 'connection-old',
        google_account_email: 'old@example.com',
        status: 'revoked',
        has_refresh_token: false,
      },
    ],
    channels: [
      {
        id: 'channel-art',
        connection_id: 'connection-a',
        channel_id: 'UC_art',
        handle: '@merkurov-art',
        status: 'active',
      },
      {
        id: 'channel-unframed',
        connection_id: 'connection-b',
        channel_id: 'UC_unframed',
        handle: '@unframed-tv',
        status: 'active',
      },
      {
        id: 'channel-heart',
        connection_id: 'connection-b',
        channel_id: 'UC_heart',
        handle: '@heartandangel',
        status: 'active',
      },
    ],
    bindings: [
      {
        project_slug: 'art-engine',
        channel_record_id: 'channel-art',
        channel_id: 'UC_art',
        handle: '@merkurov-art',
      },
      {
        project_slug: 'unframed',
        channel_record_id: 'channel-unframed',
        channel_id: 'UC_unframed',
        handle: '@unframed-tv',
      },
      {
        project_slug: 'pierrot',
        channel_record_id: 'channel-unframed',
        channel_id: 'UC_unframed',
        handle: '@unframed-tv',
      },
      {
        project_slug: 'heart-and-angel',
        channel_record_id: 'channel-heart',
        channel_id: 'UC_heart',
        handle: '@heartandangel',
      },
    ],
  };

  const passed = evaluateState(state);
  if (!passed.ok) throw new Error(`state self-test failed: ${passed.failed.join(', ')}`);

  const missing = evaluateState({
    ...state,
    bindings: state.bindings.filter((binding) => binding.project_slug !== 'pierrot'),
  });
  if (missing.ok) throw new Error('state self-test did not detect a missing Pierrot binding');

  if (maskEmail('merkurov@gmail.com') !== 'me***@gmail.com') {
    throw new Error('email masking self-test failed');
  }
  if (normalizeHandle('@Merkurov-Art') !== 'merkurov-art') {
    throw new Error('handle normalization self-test failed');
  }

  console.log('self-test ok');
}

async function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has('--self-test')) {
    selfTest();
    return;
  }

  const databaseUrl =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;

  if (!databaseUrl) {
    console.error(
      'DATABASE_URL (or POSTGRES_URL/SUPABASE_DB_URL) is required. Pass it via --env-file, never commit it.'
    );
    process.exit(2);
  }

  const expectedArg = process.argv.find((arg) => arg.startsWith('--expect='));
  const expected = parseExpected(expectedArg ? expectedArg.slice('--expect='.length) : '');
  const host = safeDatabaseHost(databaseUrl);

  let client;
  try {
    client = new Client({
      connectionString: databaseUrl,
      ssl: /localhost|127\.0\.0\.1/.test(host) ? undefined : { rejectUnauthorized: false },
    });
    await client.connect();
  } catch (error) {
    console.error(`database connection failed: ${error?.code || error?.name || 'unknown'}`);
    process.exit(2);
  }

  try {
    const schemaRowsResult = await propertyRows(client);
    const schema = evaluateSchema(buildSchemaSnapshot(schemaRowsResult));

    let state = {
      connections: [],
      channels: [],
      bindings: [],
      audit: { row_count: 0, latest_at: null },
      evaluation: { ok: false, checks: [], failed: ['state:not-read'] },
    };

    if (schema.ok) {
      const rows = await stateRows(client);
      state = {
        ...rows,
        evaluation: evaluateState(
          {
            connections: rows.connections,
            channels: rows.channels,
            bindings: rows.bindings,
          },
          expected
        ),
      };
    }

    const report = {
      ok: schema.ok && state.evaluation.ok,
      generatedAt: new Date().toISOString(),
      databaseHost: host,
      expected,
      schema,
      state: {
        ok: state.evaluation.ok,
        checks: state.evaluation.checks,
        failed: state.evaluation.failed,
        connections: state.connections,
        channels: state.channels,
        bindings: state.bindings,
        audit: state.audit,
      },
    };

    if (args.has('--json')) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }

    process.exitCode = report.ok ? 0 : 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
