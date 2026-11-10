import fs from 'node:fs';
import { withDb } from './lib.mjs';

const dryRun = process.argv.includes('--dry-run');
const result = await withDb(async (client) => {
  await client.query('BEGIN');
  try {
    const before = (await client.query(`
      SELECT d.id, d.title, d.media_outlet, m.outlet AS record_outlet, m.id AS media_record_id
      FROM public.knowledge_documents d
      JOIN public.media_archive_records m ON m.id = d.media_record_id
      WHERE d.media_outlet IS DISTINCT FROM m.outlet
      ORDER BY d.id
    `)).rows;

    const repair = before.filter(
      (row) => row.media_outlet === 'Pasted text' && row.record_outlet
    );

    if (!dryRun && repair.length > 0) {
      await client.query(
        `UPDATE public.knowledge_documents d
         SET media_outlet = m.outlet,
             updated_at = now()
         FROM public.media_archive_records m
         WHERE d.media_record_id = m.id
           AND d.media_outlet = 'Pasted text'
           AND d.media_outlet IS DISTINCT FROM m.outlet`
      );
    }

    if (dryRun) await client.query('ROLLBACK');
    else await client.query('COMMIT');

    return { dryRun, before, repaired: dryRun ? [] : repair };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
});

const logPath = `/tmp/opencode/media-outlet-repair-${Date.now()}.json`;
fs.writeFileSync(logPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log('log:', logPath);
