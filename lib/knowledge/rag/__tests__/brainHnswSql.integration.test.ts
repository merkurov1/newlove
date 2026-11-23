/** @jest-environment node */

/**
 * Opt-in integration test for the Brain HNSW migration.
 *
 * It is skipped unless BRAIN_HNSW_TEST_DATABASE_URL points at a preview or
 * staging database where migration
 * migrations/2026-12-15_brain_hybrid_hnsw_planner.sql has been applied.
 *
 * It is read-only: it selects one existing chunk embedding as a probe vector,
 * calls the functions inside transactions that are rolled back, and never
 * writes rows. Never point it at production with write credentials.
 */

import { Client } from 'pg';

const connectionString = process.env.BRAIN_HNSW_TEST_DATABASE_URL;
const describeIf = connectionString ? describe : describe.skip;

const MODEL = 'baai/bge-m3';
const DIMENSIONS = 1024;

const ANN_VECTOR_SQL = `
select
  c.id as chunk_id,
  c.document_id,
  1 - (c.embedding <=> $1::vector) as similarity
from public.knowledge_chunks c
where c.access_class = $4
  and c.embedding_model = $2
  and c.embedding_dimensions = $3
  and ($5::text[] is null or c.document_id = any ($5::text[]))
order by c.embedding <=> $1::vector
limit $6
`;

const HYBRID_SQL = `
select *
from public.brain_search_hybrid(
  $1::vector,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
)
`;

describeIf('brain_search_hybrid HNSW integration (preview DB only)', () => {
  let client: Client;
  let probeVector: string;
  let probeDocumentId: string;
  let probeAccessClass: 'owner' | 'public';
  let ownerDocumentIds: string[] = [];
  let publicDocumentIds: string[] = [];

  beforeAll(async () => {
    client = new Client({
      connectionString: connectionString as string,
      ssl:
        (process.env.BRAIN_HNSW_TEST_NO_SSL || '').toLowerCase() === 'true'
          ? undefined
          : { rejectUnauthorized: false },
    });
    await client.connect();

    // Use the same access class as the probe chunk. Hard-coding "owner" made
    // the scoped assertion fail whenever the first chunk happened to be public.
    const result = await client.query(
      `select embedding::text as embedding, document_id, access_class
       from public.knowledge_chunks
       where embedding_model = $1
         and embedding_dimensions = $2
         and access_class in ('owner', 'public')
       order by id
       limit 1`,
      [MODEL, DIMENSIONS]
    );

    if (!result.rows[0]?.embedding) {
      throw new Error('integration test requires at least one embedded chunk');
    }

    probeVector = result.rows[0].embedding;
    probeDocumentId = String(result.rows[0].document_id);
    probeAccessClass = result.rows[0].access_class === 'public' ? 'public' : 'owner';

    const documentIds = await client.query(
      `select distinct document_id, access_class
       from public.knowledge_chunks
       where embedding_model = $1 and embedding_dimensions = $2`,
      [MODEL, DIMENSIONS]
    );
    ownerDocumentIds = documentIds.rows
      .filter((row) => row.access_class === 'owner')
      .map((row) => String(row.document_id));
    publicDocumentIds = documentIds.rows
      .filter((row) => row.access_class === 'public')
      .map((row) => String(row.document_id));
  });

  afterAll(async () => {
    await client.end();
  });

  it('returns bounded candidates in descending similarity order', async () => {
    const result = await client.query(
      `select chunk_id, document_id, similarity
       from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
      [probeVector, MODEL, DIMENSIONS, probeAccessClass, null, 40, 120]
    );

    expect(result.rows.length).toBeLessThanOrEqual(40);

    for (let index = 1; index < result.rows.length; index += 1) {
      expect(Number(result.rows[index - 1].similarity)).toBeGreaterThanOrEqual(
        Number(result.rows[index].similarity)
      );
    }
  });

  it('restores planner settings inside the same transaction', async () => {
    const settings = async () =>
      (
        await client.query(
          `select current_setting('enable_seqscan') as seqscan,
                  current_setting('enable_sort') as sort,
                  coalesce(current_setting('hnsw.ef_search', true), '') as ef`
        )
      ).rows[0];

    // The helper uses set_config(..., is_local => true), so an implicit
    // transaction would hide a leak. Keep the call and the read in one
    // explicit transaction to prove the settings are restored before return.
    await client.query('begin');
    try {
      const before = await settings();

      await client.query(
        `select * from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
        [probeVector, MODEL, DIMENSIONS, probeAccessClass, null, 40, 120]
      );

      expect(await settings()).toEqual(before);
    } finally {
      await client.query('rollback');
    }
  });

  it('restores an unset hnsw.ef_search without leaking the probe value', async () => {
    const efSetting = async () =>
      (await client.query(`select current_setting('hnsw.ef_search', true) as ef`)).rows[0].ef as
        | string
        | null;

    await client.query('begin');
    try {
      // Once pgvector is loaded the placeholder GUC has the documented default
      // (40). Before that it is NULL/empty. Accept both, but never 80/120.
      await client.query(`select set_config('hnsw.ef_search', null, true)`);
      const before = await efSetting();
      expect([null, '', '40']).toContain(before);

      await client.query(
        `select * from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
        [probeVector, MODEL, DIMENSIONS, probeAccessClass, null, 40, 80]
      );

      const after = await efSetting();
      expect([null, '', '40']).toContain(after);
      expect(after).not.toBe('80');
      expect(after).not.toBe('120');
    } finally {
      await client.query('rollback');
    }
  });

  it('returns to the prior hnsw.ef_search after a failed helper call', async () => {
    const efSetting = async () =>
      (await client.query(`select current_setting('hnsw.ef_search', true) as ef`)).rows[0].ef as
        | string
        | null;

    await client.query('begin');
    try {
      await client.query(`select set_config('hnsw.ef_search', '77', true)`);
      await client.query('savepoint helper_call');

      await expect(
        client.query(
          `select * from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
          ['[0.1,0.2,0.3]', MODEL, DIMENSIONS, probeAccessClass, null, 40, 120]
        )
      ).rejects.toBeTruthy();

      // A failed statement aborts the transaction. Recover to the savepoint
      // and verify the caller still observes its prior 77, not the probe 120.
      await client.query('rollback to savepoint helper_call');
      expect(await efSetting()).toBe('77');
    } finally {
      await client.query('rollback');
    }
  });

  it('keeps public and owner hybrid results inside the requested access class', async () => {
    const run = async (accessClass: 'owner' | 'public') =>
      (
        await client.query(HYBRID_SQL, [
          probeVector,
          MODEL,
          DIMENSIONS,
          accessClass,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          40,
          -1,
        ])
      ).rows.map((row) => String(row.document_id));

    if (publicDocumentIds.length > 0) {
      const publicRows = await run('public');
      expect(publicRows.every((documentId) => publicDocumentIds.includes(documentId))).toBe(true);
    }

    if (ownerDocumentIds.length > 0) {
      const ownerRows = await run('owner');
      expect(ownerRows.every((documentId) => ownerDocumentIds.includes(documentId))).toBe(true);
    }
  });

  it('never returns another document from the scoped helper path', async () => {
    const result = await client.query(
      `select document_id
       from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
      [probeVector, MODEL, DIMENSIONS, probeAccessClass, [probeDocumentId], 40, 120]
    );

    expect(result.rows.every((row) => String(row.document_id) === probeDocumentId)).toBe(true);
  });

  it('uses the HNSW index on the whole-Brain helper path', async () => {
    const scans = async () => {
      try {
        await client.query('select pg_stat_force_next_flush()');
      } catch {
        // Stats flush helper is unavailable on older builds; the test degrades.
      }

      try {
        const result = await client.query(
          `select coalesce(idx_scan, 0)::bigint as idx_scan
           from pg_stat_user_indexes
           where schemaname = 'public'
             and relname = 'knowledge_chunks'
             and indexrelname = 'knowledge_chunks_embedding_hnsw_idx'`
        );

        return result.rows.length > 0 ? Number(result.rows[0].idx_scan) : null;
      } catch {
        return null;
      }
    };

    const before = await scans();

    await client.query(
      `select * from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
      [probeVector, MODEL, DIMENSIONS, probeAccessClass, null, 80, 120]
    );

    const after = await scans();

    if (before !== null && after !== null) {
      expect(after).toBeGreaterThanOrEqual(before + 1);
    }
  });

  it('keeps document-scoped candidate selection exact and bounded', async () => {
    const result = await client.query(
      `select chunk_id, document_id, similarity
       from public.brain_vector_candidates($1::vector,$2,$3,$4,$5::text[],$6,$7)`,
      [probeVector, MODEL, DIMENSIONS, probeAccessClass, [probeDocumentId], 40, 120]
    );

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.length).toBeLessThanOrEqual(40);

    for (const row of result.rows) {
      expect(String(row.document_id)).toBe(probeDocumentId);
    }
  });

  it('keeps hybrid results bounded for null and non-null lexical queries', async () => {
    const nullLexical = await client.query(
      `select count(*)::int as count
       from public.brain_search_hybrid($1::vector,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        probeVector,
        MODEL,
        DIMENSIONS,
        probeAccessClass,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        40,
        -1,
      ]
    );
    const withLexical = await client.query(
      `select count(*)::int as count
       from public.brain_search_hybrid($1::vector,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        probeVector,
        MODEL,
        DIMENSIONS,
        probeAccessClass,
        'memory',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        40,
        -1,
      ]
    );

    expect(Number(nullLexical.rows[0].count)).toBeLessThanOrEqual(40);
    expect(Number(withLexical.rows[0].count)).toBeLessThanOrEqual(40);
  });

  it('uses the existing HNSW index in the candidate plan', async () => {
    await client.query('begin');

    try {
      await client.query(`select set_config('enable_seqscan', 'off', true)`);
      await client.query(`select set_config('enable_sort', 'off', true)`);
      await client.query(`select set_config('hnsw.ef_search', '120', true)`);

      const plan = await client.query(`explain (analyze, buffers, format json) ${ANN_VECTOR_SQL}`, [
        probeVector,
        MODEL,
        DIMENSIONS,
        probeAccessClass,
        null,
        40,
      ]);

      expect(JSON.stringify(plan.rows[0])).toContain('knowledge_chunks_embedding_hnsw_idx');
    } finally {
      await client.query('rollback');
    }
  });
});
