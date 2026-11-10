import { withDb, print } from './lib.mjs';
const out = await withDb(async c => {
  const q=async(s)=>(await c.query(s)).rows;
  return {
    failedJobs: await q(`select j.id, j.source_type, j.status, j.attempts, j.max_attempts, j.error_code, left(j.error_detail,160) detail,
      m.outlet, m.title, j.media_record_id, j.created_at, j.processed_at
      from brain_ingestion_jobs j left join media_archive_records m on m.id=j.media_record_id
      where j.status in ('failed','partial') order by j.source_type, j.processed_at desc`),
    latestByMedia: await q(`select distinct on (j.media_record_id) j.media_record_id, j.status, j.attempts, j.error_code, j.created_at
      from brain_ingestion_jobs j where j.media_record_id is not null order by j.media_record_id, j.created_at desc`),
    retryable: await q(`select j.id,j.status,j.attempts,j.max_attempts,j.error_code,m.outlet,m.title
      from brain_ingestion_jobs j left join media_archive_records m on m.id=j.media_record_id
      where j.status='failed' and j.error_code = any(array['fetch_timeout','fetch_failed','dns_failed','http_status_500','http_status_502','http_status_503','http_status_504','http_status_429','embedding_timeout','embedding_failed'])
      order by j.created_at desc`),
  };
});
print(out);
