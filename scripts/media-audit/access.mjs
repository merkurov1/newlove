import { withDb, print } from './lib.mjs';
const out = await withDb(async c => {
  const q=async(s,p=[])=>(await c.query(s,p)).rows;
  return {
    docAccess: await q(`select access_class, ingestion_status, count(*)::int n from knowledge_documents group by 1,2 order by 1,2`),
    chunkAccess: await q(`select c.access_class, count(*)::int n from knowledge_chunks c group by 1 order by 1`),
    mediaAccess: await q(`select d.access_class, d.media_text_quality, count(*)::int n from knowledge_documents d where d.media_record_id is not null group by 1,2 order by 1,2`),
    completedNoChunks: await q(`select count(*)::int n from knowledge_documents d where d.ingestion_status='completed' and d.media_record_id is not null and d.chunk_count=0`),
    failedWithChunks: await q(`select count(*)::int n from knowledge_documents d where d.ingestion_status<>'completed' and d.chunk_count>0`),
    nullCanonicalMedia: await q(`select count(*)::int n from media_archive_records where canonical_url is null or canonical_url=''`),
    nullUrlMedia: await q(`select count(*)::int n from media_archive_records where url is null or url=''`),
    docsPublic: await q(`select count(*)::int n from knowledge_documents where public_retrieval_allowed=true`),
  };
});
print(out);
