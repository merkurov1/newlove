import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/knowledge/media/database');

import { Pool } from 'pg';

type MediaDatabaseGlobal = typeof globalThis & {
  __mediaArchivePool?: Pool;
};

const globalForMediaDb = globalThis as MediaDatabaseGlobal;

function connectionString(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    null
  );
}

export function isMediaDatabaseConfigured(): boolean {
  return Boolean(connectionString());
}

function getPool(): Pool {
  const url = connectionString();
  if (!url) throw new Error('media_database_unavailable');

  if (!globalForMediaDb.__mediaArchivePool) {
    globalForMediaDb.__mediaArchivePool = new Pool({
      connectionString: url,
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl:
        url.includes('localhost') || url.includes('127.0.0.1')
          ? undefined
          : { rejectUnauthorized: false },
    });
  }

  return globalForMediaDb.__mediaArchivePool;
}

export async function mediaQuery<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}
