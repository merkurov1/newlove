/** @jest-environment node */

import {
  buildMigrationAudit,
  classifyMigrationRisk,
  readRepositoryMigrations,
  type ProductionSchemaSnapshot,
  type RepositoryMigration,
} from '../migrationAudit';

const SNAPSHOT: ProductionSchemaSnapshot = {
  available: true,
  source: 'PIERROT_RELEASE_DATABASE_URL',
  error: null,
  history: ['2026-01-01_history_applied'],
  tables: ['existing_table'],
  views: [],
  functions: [],
  indexes: [],
  types: [],
  columns: ['existing_table.id'],
};

function file(
  version: string,
  options: {
    risk?: RepositoryMigration['risk'];
    objects?: Partial<RepositoryMigration['objects']>;
  } = {}
): RepositoryMigration {
  return {
    version,
    filename: `${version}.sql`,
    sha256: 'a'.repeat(64),
    risk: options.risk || 'safe',
    reasons: [],
    objects: {
      tables: [],
      views: [],
      functions: [],
      indexes: [],
      types: [],
      columns: [],
      droppedTables: [],
      droppedViews: [],
      ...(options.objects || {}),
    },
  };
}

describe('migration risk classification', () => {
  it('allows additive, non-security pending SQL', () => {
    const result = classifyMigrationRisk({
      filename: '2026-01-02_add_nullable_column.sql',
      sql: 'alter table public.items add column if not exists note text;',
    });
    expect(result.risk).toBe('safe');
  });

  it('blocks destructive SQL and unfiltered deletes', () => {
    expect(
      classifyMigrationRisk({
        filename: '2026-01-02_drop.sql',
        sql: 'drop table public.items;',
      }).risk
    ).toBe('destructive');
    expect(
      classifyMigrationRisk({
        filename: '2026-01-02_delete.sql',
        sql: 'delete from public.items;',
      }).risk
    ).toBe('destructive');
    expect(
      classifyMigrationRisk({
        filename: '2026-01-02_delete.sql',
        sql: "delete from public.items where status = 'old';",
      }).risk
    ).toBe('safe');
  });

  it('blocks security, downtime and manual-only migrations', () => {
    expect(
      classifyMigrationRisk({
        filename: '2026-01-02_rls.sql',
        sql: 'alter table public.items enable row level security;',
      }).risk
    ).toBe('security');
    expect(
      classifyMigrationRisk({
        filename: '2026-01-02_index.sql',
        sql: 'create index concurrently items_idx on public.items (id);',
      }).risk
    ).toBe('downtime');
    expect(
      classifyMigrationRisk({
        filename: '2026-01-02_cron.sql',
        sql: "select cron.schedule('x', '* * * * *', 'select 1');",
      }).risk
    ).toBe('manual');
    expect(
      classifyMigrationRisk({
        filename: '2026-01-02_debug.sql',
        sql: 'select 1;',
      }).risk
    ).toBe('manual');
  });
});

describe('migration reconciliation', () => {
  it('classifies history and schema evidence without writing history', () => {
    const report = buildMigrationAudit(
      [
        file('2026-01-01_history_applied', {
          objects: { tables: ['existing_table'] },
        }),
        file('2026-01-03_schema_applied', {
          objects: { tables: ['existing_table'] },
        }),
        file('2026-01-04_pending', {
          objects: { tables: ['new_table'] },
        }),
      ],
      SNAPSHOT
    );

    expect(report.rows.map((row) => row.status)).toEqual(['applied', 'applied', 'pending']);
    expect(report.pendingSafe).toEqual(['2026-01-04_pending']);
    expect(report.blockers).toEqual([]);
  });

  it('blocks pending destructive migrations and leaves them out of the safe plan', () => {
    const report = buildMigrationAudit(
      [file('2026-01-05_destructive', { risk: 'destructive', objects: { tables: ['gone'] } })],
      SNAPSHOT
    );

    expect(report.rows[0].status).toBe('unsafe');
    expect(report.pendingSafe).toEqual([]);
    expect(report.blockers.join(' ')).toMatch(/unsafe for automatic application/i);
  });

  it('blocks files that cannot be proven from schema or history', () => {
    const report = buildMigrationAudit([file('2026-01-06_data_backfill')], SNAPSHOT);

    expect(report.rows[0].status).toBe('unknown');
    expect(report.pendingSafe).toEqual([]);
    expect(report.blockers.join(' ')).toMatch(/cannot be classified/i);
  });

  it('never infers applied state when production schema is unreadable', () => {
    const report = buildMigrationAudit(
      [
        file('2026-01-01_history_applied', {
          objects: { tables: ['existing_table'] },
        }),
      ],
      {
        ...SNAPSHOT,
        available: false,
        error: 'Production database read access is not configured.',
      }
    );

    expect(report.rows[0].status).toBe('unknown');
    expect(report.blockers).toContain('Production database read access is not configured.');
  });

  it('skips diagnostic SQL and proves cleanup migrations by dropped-object absence', () => {
    const files = readRepositoryMigrations();
    expect(files.some((item) => item.filename.includes('FULL_DATABASE_DIAGNOSTIC'))).toBe(false);
    const cleanup = files.find((item) => item.filename.includes('cleanup_duplicate_tables'));
    expect(cleanup?.objects.droppedTables).toContain('account');
    expect(cleanup?.objects.droppedTables).toContain('article');

    const report = buildMigrationAudit(cleanup ? [cleanup] : [], {
      ...SNAPSHOT,
      tables: ['users', 'articles'],
      views: [],
    });
    expect(report.rows[0]?.status).toBe('applied');
  });
});
