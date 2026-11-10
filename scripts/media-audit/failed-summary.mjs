import { withDb } from './lib.mjs';
const out = await withDb(async c => {
  const r = await c.query(`select d.media_coverage_status status, coalesce(d.media_coverage_error_code, d.extraction_status, 'unknown') reason,
    count(*)::int n from knowledge_documents d where d.media_record_id is not null and d.media_coverage_status in ('failed','blocked','partial')
    group by 1,2 order by 1,3 desc`);
  const rows = await c.query(`select m.id, m.title, m.outlet, m.published_date::date date, m.kind, m.indexing_status, m.indexing_error,
      d.id doc_id, d.media_coverage_status coverage, d.media_text_quality quality, d.media_coverage_error_code error_code,
      d.media_coverage_error_detail error_detail, d.chunk_count, d.media_coverage_diagnostics->>'reason' diag_reason
    from media_archive_records m join knowledge_documents d on d.media_record_id=m.id
    where d.media_coverage_status in ('failed','blocked','partial') or d.media_text_quality in ('metadata_only','blocked','partial_text')
    order by m.outlet, m.published_date`);
  return { groups: r.rows, rows: rows.rows };
});
console.log('GROUPS'); console.table(out.groups);
console.log('ROWS', out.rows.length);
for (const r of out.rows) console.log([r.outlet, r.date, r.title, '|', r.coverage, r.quality, r.error_code, '|', r.chunk_count].join(' | '));
