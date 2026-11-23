import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { Client } from 'pg';
import { assertServerOnly } from '@/lib/serverOnly';
import type {
  DevReleaseMigration,
  DevReleaseMigrationRisk,
  DevReleaseMigrationStatus,
  DevReleaseMigrations,
} from './types';

assertServerOnly('lib/pierrot/dev/workbench/migrationAudit');

/**
 * Migration reconciliation for the production release.
 *
 * Repository SQL is not proof of production state. This module compares every
 * repository migration with the live database:
 *  - `supabase_migrations.schema_migrations` (when present), and
 *  - the named objects that the migration creates/alters.
 *
 * A migration is only auto-applied when it is provably pending, ordered and
 * statically safe. Destructive, security, downtime and manual-only SQL is
 * always a release blocker. The module never writes migration history and
 * never claims a migration was applied just because the repository contains it.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');
const MIGRATION_FILE_PATTERN = /^\d{4}-\d{2}-\d{2}_.+\.sql$/i;
const DIAGNOSTIC_FILE_PATTERN = /(^|_)(FULL_DATABASE_DIAGNOSTIC|diagnostic|debug|check_|test_)/i;

const DATA_LOSS_PATTERN =
  /\bDROP\s+(?:TABLE|SCHEMA|DATABASE|COLUMN)\b|\bTRUNCATE\b|\bALTER\s+TABLE\s+[^\s;]+\s+DROP\s+COLUMN\b/i;
const SECURITY_PATTERN =
  /\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b|\bCREATE\s+POLICY\b|\bALTER\s+POLICY\b|\bDROP\s+POLICY\b|\bGRANT\s+|\bREVOKE\s+|\bSECURITY\s+DEFINER\b|\bCREATE\s+ROLE\b|\bALTER\s+ROLE\b/i;
const DOWNTIME_PATTERN =
  /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b|\bREINDEX\b|\bVACUUM\s+FULL\b|\bCLUSTER\s+|\bALTER\s+COLUMN\s+[^\s;]+\s+(?:SET\s+DATA\s+)?TYPE\b|\bALTER\s+COLUMN\s+[^\s;]+\s+SET\s+NOT\s+NULL\b|\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?[^\s;]+\s+[^;]*\bNOT\s+NULL\b(?![\s\S]{0,200}\bDEFAULT\b)/i;
const MANUAL_PATTERN =
  /\bCREATE\s+DATABASE\b|\bALTER\s+SYSTEM\b|\bVACUUM\b|\bCOPY\s+[^\s;]+\s+FROM\s+PROGRAM\b|\bpg_cron\b|\bcron\.(?:schedule|unschedule)\b|\bDROP\s+FUNCTION\b|\bDROP\s+TYPE\b/i;
const DELETE_PATTERN = /\bDELETE\s+FROM\s+[A-Za-z0-9_."]+/gi;

const DATABASE_ENV_NAMES = [
  'PIERROT_RELEASE_DATABASE_URL',
  'SUPABASE_DB_URL',
  'DIRECT_URL',
  'DATABASE_URL',
  'POSTGRES_URL',
] as const;

export type MigrationObjects = {
  tables: string[];
  views: string[];
  functions: string[];
  indexes: string[];
  types: string[];
  columns: string[];
  droppedTables: string[];
  droppedViews: string[];
};

export type RepositoryMigration = {
  version: string;
  filename: string;
  sha256: string;
  risk: DevReleaseMigrationRisk;
  reasons: string[];
  objects: MigrationObjects;
};

export type ProductionSchemaSnapshot = {
  available: boolean;
  source: string;
  error: string | null;
  history: string[];
  tables: string[];
  views: string[];
  functions: string[];
  indexes: string[];
  types: string[];
  columns: string[];
};

export type MigrationAuditRow = DevReleaseMigration & {
  sha256: string;
  objects: MigrationObjects;
};

export type MigrationAuditReport = DevReleaseMigrations & {
  rows: MigrationAuditRow[];
};

export class MigrationAuditError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MigrationAuditError';
    this.code = code;
  }
}

export class MigrationApplyError extends Error {
  readonly code = 'MIGRATION_APPLY_FAILED';
  readonly version: string | null;
  constructor(version: string | null, message: string) {
    super(message);
    this.name = 'MigrationApplyError';
    this.version = version;
  }
}

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}

function collect(regex: RegExp, sql: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sql))) {
    const name = match[1].replace(/^"|"$/g, '').toLowerCase();
    if (name) found.add(name);
  }
  return [...found].sort();
}

function extractObjects(sql: string): MigrationObjects {
  const columns = new Set<string>();
  const alterRe =
    /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+([\s\S]*?);/gi;
  let alter: RegExpExecArray | null;
  while ((alter = alterRe.exec(sql))) {
    const table = alter[1].toLowerCase();
    const columnRe = /add\s+column\s+(?:if\s+not\s+exists\s+)?("?[a-z0-9_]+"?)/gi;
    let column: RegExpExecArray | null;
    while ((column = columnRe.exec(alter[2]))) {
      const name = column[1].replace(/^"|"$/g, '').toLowerCase();
      if (name && name !== 'if') columns.add(`${table}.${name}`);
    }
  }
  return {
    tables: collect(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
      sql
    ),
    views: collect(
      /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
      sql
    ),
    functions: collect(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi,
      sql
    ),
    indexes: collect(
      /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi,
      sql
    ),
    types: collect(/create\s+type\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi, sql),
    columns: [...columns].sort(),
    droppedTables: collect(
      /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([A-Za-z0-9_]+)"?/gi,
      sql
    ),
    droppedViews: collect(
      /drop\s+view\s+(?:if\s+exists\s+)?(?:public\.)?"?([A-Za-z0-9_]+)"?/gi,
      sql
    ),
  };
}

function hasUnfilteredDelete(sql: string): boolean {
  for (const match of sql.matchAll(DELETE_PATTERN)) {
    const start = match.index ?? 0;
    const statement = sql.slice(start, sql.indexOf(';', start) + 1 || start + 800);
    if (!/\bWHERE\b/i.test(statement)) return true;
  }
  return false;
}

export function classifyMigrationRisk(input: { filename: string; sql: string }): {
  risk: DevReleaseMigrationRisk;
  reasons: string[];
} {
  if (DIAGNOSTIC_FILE_PATTERN.test(input.filename)) {
    return {
      risk: 'manual',
      reasons: ['Diagnostic, debug or test SQL is not a migration and must never be applied.'],
    };
  }
  const sql = stripComments(input.sql);
  const reasons: string[] = [];
  let risk: DevReleaseMigrationRisk = 'safe';

  if (DATA_LOSS_PATTERN.test(sql) || hasUnfilteredDelete(sql)) {
    risk = 'destructive';
    reasons.push(
      'Contains destructive/data-loss SQL (DROP TABLE/COLUMN/SCHEMA/DATABASE, TRUNCATE or DELETE without WHERE).'
    );
  }
  if (SECURITY_PATTERN.test(sql)) {
    if (risk === 'safe') risk = 'security';
    reasons.push('Changes RLS, policies, grants, roles or SECURITY DEFINER functions.');
  }
  if (DOWNTIME_PATTERN.test(sql)) {
    if (risk === 'safe' || risk === 'security') risk = 'downtime';
    reasons.push(
      'Contains a potentially blocking operation (non-concurrent index, rewrite, SET NOT NULL or column type change).'
    );
  }
  if (MANUAL_PATTERN.test(sql)) {
    if (risk === 'safe' || risk === 'security' || risk === 'downtime') risk = 'manual';
    reasons.push('Requires manual/operator execution (database-level or cron/vacuum operation).');
  }
  return { risk, reasons };
}

function readMigrationFiles(directory = MIGRATIONS_DIR): Array<{
  filename: string;
  version: string;
  sql: string;
  sha256: string;
}> {
  if (!existsSync(/*turbopackIgnore: true*/ directory)) return [];
  return (
    readdirSync(/*turbopackIgnore: true*/ directory)
      .filter((filename) => MIGRATION_FILE_PATTERN.test(filename))
      // Diagnostic/debug/test SQL is not a migration. It must not become a
      // permanent release blocker just because it lives in this directory.
      .filter((filename) => !DIAGNOSTIC_FILE_PATTERN.test(filename))
      .sort((a, b) => a.localeCompare(b))
      .map((filename) => {
        const sql = readFileSync(
          /*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ directory, filename),
          'utf8'
        );
        return {
          filename,
          version: filename.replace(/\.sql$/i, ''),
          sql,
          sha256: createHash('sha256').update(sql).digest('hex'),
        };
      })
  );
}

export function readRepositoryMigrations(directory = MIGRATIONS_DIR): RepositoryMigration[] {
  return readMigrationFiles(directory).map((file) => {
    const classified = classifyMigrationRisk({ filename: file.filename, sql: file.sql });
    return {
      version: file.version,
      filename: file.filename,
      sha256: file.sha256,
      risk: classified.risk,
      reasons: classified.reasons,
      objects: extractObjects(stripComments(file.sql)),
    };
  });
}

function normalize(values: string[]): Set<string> {
  return new Set(values.map((value) => String(value || '').toLowerCase()));
}

function matchesHistory(history: Set<string>, file: RepositoryMigration): boolean {
  const digits = file.version.replace(/\D/g, '');
  return (
    history.has(file.version.toLowerCase()) ||
    history.has(file.filename.toLowerCase()) ||
    (digits.length >= 8 && [...history].some((entry) => entry.replace(/\D/g, '') === digits))
  );
}

function objectEvidence(
  file: RepositoryMigration,
  snapshot: {
    tables: Set<string>;
    views: Set<string>;
    functions: Set<string>;
    indexes: Set<string>;
    types: Set<string>;
    columns: Set<string>;
  }
): { present: number; total: number; missing: string[] } {
  type Expected = { key: string; name: string; set: Set<string>; absent: boolean };
  const expected: Expected[] = [
    ...file.objects.tables.map((name) => ({
      key: `table:${name}`,
      name,
      set: snapshot.tables,
      absent: false,
    })),
    ...file.objects.views.map((name) => ({
      key: `view:${name}`,
      name,
      set: snapshot.views,
      absent: false,
    })),
    ...file.objects.functions.map((name) => ({
      key: `function:${name}`,
      name,
      set: snapshot.functions,
      absent: false,
    })),
    ...file.objects.indexes.map((name) => ({
      key: `index:${name}`,
      name,
      set: snapshot.indexes,
      absent: false,
    })),
    ...file.objects.types.map((name) => ({
      key: `type:${name}`,
      name,
      set: snapshot.types,
      absent: false,
    })),
    ...file.objects.columns.map((name) => ({
      key: `column:${name}`,
      name,
      set: snapshot.columns,
      absent: false,
    })),
    ...file.objects.droppedTables.map((name) => ({
      key: `dropped-table:${name}`,
      name,
      set: snapshot.tables,
      absent: true,
    })),
    ...file.objects.droppedViews.map((name) => ({
      key: `dropped-view:${name}`,
      name,
      set: snapshot.views,
      absent: true,
    })),
  ];
  const missing = expected
    .filter((item) => {
      const exists = item.set.has(item.name);
      return item.absent ? exists : !exists;
    })
    .map((item) => item.key);
  return { present: expected.length - missing.length, total: expected.length, missing };
}

function classifyRow(
  file: RepositoryMigration,
  snapshot: ProductionSchemaSnapshot | null
): { status: DevReleaseMigrationStatus; evidence: string } {
  if (!snapshot || !snapshot.available) {
    return {
      status: 'unknown',
      evidence:
        'Production schema/history is unreadable, so this repository migration cannot be classified as applied or pending.',
    };
  }

  const history = normalize(snapshot.history);
  const fromHistory = matchesHistory(history, file);
  const objects = objectEvidence(file, {
    tables: normalize(snapshot.tables),
    views: normalize(snapshot.views),
    functions: normalize(snapshot.functions),
    indexes: normalize(snapshot.indexes),
    types: normalize(snapshot.types),
    columns: normalize(snapshot.columns),
  });

  if (fromHistory) {
    if (objects.total > 0 && objects.present < objects.total) {
      return {
        status: 'unknown',
        evidence: `Migration history contains ${file.version}, but ${objects.missing
          .slice(0, 5)
          .join(
            ', '
          )} ${objects.missing.length === 1 ? 'is' : 'are'} missing from the live schema. Possible schema drift.`,
      };
    }
    return {
      status: 'applied',
      evidence: `Production migration history contains ${file.version}.`,
    };
  }

  if (objects.total > 0 && objects.present === objects.total) {
    return {
      status: 'applied',
      evidence: `All ${objects.total} named object(s) exist in the live schema (no matching history row).`,
    };
  }
  if (objects.present > 0) {
    return {
      status: 'unknown',
      evidence: `Only ${objects.present}/${objects.total} named object(s) exist; the migration looks partially applied or drifted.`,
    };
  }
  if (objects.total === 0) {
    return {
      status: 'unknown',
      evidence:
        'The file creates no table/view/function/index/type/column that can be verified against the live schema.',
    };
  }
  return {
    status: 'pending',
    evidence: `None of the ${objects.total} named object(s) exist in the live schema.`,
  };
}

export function buildMigrationAudit(
  files: RepositoryMigration[],
  snapshot: ProductionSchemaSnapshot | null,
  checkedAt = new Date().toISOString()
): MigrationAuditReport {
  const rows: MigrationAuditRow[] = files.map((file) => {
    const classified = classifyRow(file, snapshot);
    let status = classified.status;
    const reasons = [...file.reasons];
    if (status === 'pending' && file.risk !== 'safe') {
      status = 'unsafe';
      reasons.push('Pending migration is not statically safe for automatic application.');
    }
    if (status === 'unknown' && file.risk !== 'safe') {
      reasons.push('Unclassified and not statically safe; manual review is required.');
    }
    return {
      version: file.version,
      filename: file.filename,
      sha256: file.sha256,
      status,
      risk: file.risk,
      reasons,
      evidence: classified.evidence,
      objects: file.objects,
    };
  });

  const counts: Record<DevReleaseMigrationStatus, number> = {
    applied: 0,
    pending: 0,
    unsafe: 0,
    unknown: 0,
  };
  for (const row of rows) counts[row.status] += 1;

  const pendingSafe = rows
    .filter((row) => row.status === 'pending' && row.risk === 'safe')
    .map((row) => row.version);
  const blockers: string[] = [];
  if (!snapshot || !snapshot.available) {
    blockers.push(
      snapshot?.error ||
        'Production database read access is not configured, so migration history and schema cannot be reconciled.'
    );
  }
  const unsafe = rows.filter((row) => row.status === 'unsafe');
  if (unsafe.length > 0) {
    blockers.push(
      `${unsafe.length} pending migration(s) are unsafe for automatic application: ${unsafe
        .slice(0, 8)
        .map((row) => `${row.version} (${row.risk})`)
        .join(', ')}${unsafe.length > 8 ? ', …' : ''}. Resolve them manually.`
    );
  }
  const unknown = rows.filter((row) => row.status === 'unknown');
  if (unknown.length > 0) {
    blockers.push(
      `${unknown.length} migration(s) cannot be classified reliably: ${unknown
        .slice(0, 8)
        .map((row) => row.version)
        .join(
          ', '
        )}${unknown.length > 8 ? ', …' : ''}. Release is blocked until the live schema is reconciled.`
    );
  }

  return {
    checkedAt,
    available: Boolean(snapshot?.available),
    source: snapshot?.source || 'unavailable',
    error: snapshot?.error || null,
    counts,
    rows,
    pendingSafe,
    blockers,
  };
}

function databaseConnectionString(): { value: string | null; source: string } {
  for (const name of DATABASE_ENV_NAMES) {
    const value = (process.env[name] || '').trim();
    if (value) return { value, source: name };
  }
  return { value: null, source: 'unavailable' };
}

function sanitizeDatabaseError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown database error.';
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted connection string]')
    .replace(/password=[^\s]+/gi, 'password=[redacted]')
    .slice(0, 600);
}

/**
 * Read-only snapshot of production schema and migration history.
 *
 * Credentials are never logged. If no read-only database URL is configured the
 * caller receives `available: false`; it must not infer applied migrations.
 */
export async function readProductionSchemaSnapshot(): Promise<ProductionSchemaSnapshot> {
  const connection = databaseConnectionString();
  if (!connection.value) {
    return {
      available: false,
      source: 'unavailable',
      error:
        'Production database read access is not configured. Set PIERROT_RELEASE_DATABASE_URL (or SUPABASE_DB_URL/DATABASE_URL) to a read-only connection so migration history and schema can be verified.',
      history: [],
      tables: [],
      views: [],
      functions: [],
      indexes: [],
      types: [],
      columns: [],
    };
  }

  const client = new Client({
    connectionString: connection.value,
    ssl: /localhost|127\.0\.0\.1/i.test(connection.value) ? false : { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query('SET default_transaction_read_only = on');
    await client.query("SET statement_timeout = '15000'");
    const rows = async (sql: string) => (await client.query(sql)).rows;

    const history: string[] = [];
    try {
      const historyRows = await rows('select version from supabase_migrations.schema_migrations');
      for (const row of historyRows) {
        const version = String(row.version || '').trim();
        if (version) history.push(version);
      }
    } catch {
      // The project may not use Supabase CLI history. Schema objects still count.
    }

    const tables = (
      await rows(`select table_name from information_schema.tables where table_schema='public'`)
    ).map((row) => String(row.table_name || ''));
    const views = (
      await rows(`select table_name from information_schema.views where table_schema='public'`)
    ).map((row) => String(row.table_name || ''));
    const matviews = (
      await rows(`select matviewname from pg_matviews where schemaname='public'`)
    ).map((row) => String(row.matviewname || ''));
    const functions = (
      await rows(
        `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`
      )
    ).map((row) => String(row.proname || ''));
    const indexes = (await rows(`select indexname from pg_indexes where schemaname='public'`)).map(
      (row) => String(row.indexname || '')
    );
    const types = (
      await rows(
        `select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'`
      )
    ).map((row) => String(row.typname || ''));
    const columns = (
      await rows(
        `select table_name || '.' || column_name as name from information_schema.columns where table_schema='public'`
      )
    ).map((row) => String(row.name || ''));

    return {
      available: true,
      source: connection.source,
      error: null,
      history,
      tables,
      views: [...new Set([...views, ...matviews])],
      functions,
      indexes,
      types,
      columns,
    };
  } catch (error) {
    return {
      available: false,
      source: connection.source,
      error: `Production schema read failed: ${sanitizeDatabaseError(error)}`,
      history: [],
      tables: [],
      views: [],
      functions: [],
      indexes: [],
      types: [],
      columns: [],
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function inspectProductionMigrations(): Promise<MigrationAuditReport> {
  const [files, snapshot] = await Promise.all([
    Promise.resolve(readRepositoryMigrations()),
    readProductionSchemaSnapshot(),
  ]);
  return buildMigrationAudit(files, snapshot);
}

/**
 * Apply exactly the ordered, provably-pending, statically-safe migrations.
 *
 * The whole set runs in one transaction so a failure leaves the previous
 * production schema intact. Migration history is deliberately not written:
 * the next audit re-reads the live schema and proves the result.
 */
export async function applyPendingSafeMigrations(
  report: MigrationAuditReport
): Promise<{ applied: string[]; skipped: string[] }> {
  if (!report.available) {
    throw new MigrationApplyError(
      null,
      report.error || 'Production schema is unreadable; no migration was applied.'
    );
  }
  if (report.blockers.length > 0) {
    throw new MigrationApplyError(
      null,
      `Migration preflight is blocked: ${report.blockers.slice(0, 4).join(' ')}`
    );
  }
  const pending = (report.rows as MigrationAuditRow[]).filter(
    (row) => row.status === 'pending' && row.risk === 'safe'
  );
  if (pending.length === 0) return { applied: [], skipped: report.pendingSafe };

  const connection = databaseConnectionString();
  if (!connection.value) {
    throw new MigrationApplyError(
      null,
      'No production database write connection is configured; no migration was applied.'
    );
  }
  const files = new Map(readMigrationFiles().map((file) => [file.version, file]));
  const client = new Client({
    connectionString: connection.value,
    ssl: /localhost|127\.0\.0\.1/i.test(connection.value) ? false : { rejectUnauthorized: false },
  });
  const applied: string[] = [];
  let current: string | null = null;
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '45s'");
    for (const row of pending) {
      current = row.version;
      const file = files.get(row.version);
      if (!file) {
        throw new MigrationApplyError(row.version, 'The migration file disappeared before apply.');
      }
      const sha256 = createHash('sha256').update(file.sql).digest('hex');
      if (sha256 !== row.sha256) {
        throw new MigrationApplyError(
          row.version,
          'The migration changed after preflight; refusing to apply a different file.'
        );
      }
      await client.query(file.sql);
      applied.push(row.version);
    }
    await client.query('COMMIT');
    return { applied, skipped: report.pendingSafe.filter((version) => !applied.includes(version)) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof MigrationApplyError) throw error;
    throw new MigrationApplyError(
      current,
      `Migration ${current || 'unknown'} failed and was rolled back: ${sanitizeDatabaseError(error)}`
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
