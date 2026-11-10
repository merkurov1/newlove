import { withDb } from './lib.mjs';
const q = async (c, sql, params=[]) => (await c.query(sql, params)).rows;
const out = await withDb(async c => ({
  mediaNoDoc: await q(c, `select m.id, m.title, m.outlet, m.published_date, m.status, m.indexing_status, m.indexing_error, m.url, m.kind
    from media_archive_records m left join knowledge_documents d on d.media_record_id=m.id where d.id is null order by m.published_date`),
  nonMediaDocs: await q(c, `select d.id, d.title, d.source_type, d.source_url, d.ingestion_status, d.extraction_status, d.created_at
    from knowledge_documents d where d.media_record_id is null order by d.source_type, d.created_at`),
  docsNoChunks: await q(c, `select d.id, d.title, d.media_record_id, d.media_coverage_status, d.media_text_quality, d.chunk_count, d.ingestion_status
    from knowledge_documents d left join knowledge_chunks c on c.document_id=d.id
    where c.id is null order by d.media_record_id nulls last`),
  docsChunkMismatch: await q(c, `select d.id, d.title, d.chunk_count, count(c.id)::int actual_chunks
    from knowledge_documents d left join knowledge_chunks c on c.document_id=d.id
    group by d.id, d.title, d.chunk_count having d.chunk_count <> count(c.id) order by abs(d.chunk_count-count(c.id)) desc`),
  failedDocs: await q(c, `select d.id, d.title, d.media_record_id, d.media_outlet, d.media_published_date, d.media_coverage_status, d.media_text_quality,
      d.media_coverage_error_code, d.media_coverage_error_detail, d.extraction_status, d.ingestion_status, d.media_coverage_diagnostics,
      m.indexing_error
    from knowledge_documents d left join media_archive_records m on m.id=d.media_record_id
    where d.media_coverage_status in ('failed','blocked') or d.extraction_status in ('failed','blocked','needs_review')
    order by d.media_coverage_status, d.media_outlet`),
  partialDocs: await q(c, `select d.id, d.title, d.media_record_id, d.media_outlet, d.media_published_date, d.media_coverage_status, d.media_text_quality,
      d.media_coverage_error_code, d.media_coverage_error_detail, d.extraction_status, d.ingestion_status, d.media_coverage_diagnostics
    from knowledge_documents d where d.media_coverage_status='partial' or d.media_text_quality in ('partial_text','metadata_only')
    order by d.media_text_quality, d.media_outlet`),
  embedMismatchDocs: await q(c, `select d.id, d.title, d.embedding_model, d.embedding_dimensions, d.chunk_count,
      count(c.id)::int chunks, count(c.id) filter (where c.embedding is null)::int null_embedding
    from knowledge_documents d left join knowledge_chunks c on c.document_id=d.id
    where d.embedding_model <> 'baai/bge-m3' or d.embedding_dimensions<>1024
       or exists (select 1 from knowledge_chunks cc where cc.document_id=d.id and (cc.embedding is null or cc.embedding_model<>'baai/bge-m3' or cc.embedding_dimensions<>1024))
    group by d.id, d.title, d.embedding_model, d.embedding_dimensions, d.chunk_count`),
  duplicateCanonical: await q(c, `select canonical_url, count(*)::int n, array_agg(id) ids, array_agg(title) titles
    from media_archive_records where canonical_url is not null and canonical_url<>'' group by canonical_url having count(*)>1 order by n desc`),
  duplicateUrl: await q(c, `select url, count(*)::int n, array_agg(id) ids, array_agg(title) titles
    from media_archive_records where url is not null and url<>'' group by url having count(*)>1 order by n desc`),
  duplicateTitle: await q(c, `select lower(btrim(title)) t, outlet, published_date, count(*)::int n, array_agg(id) ids
    from media_archive_records group by 1,2,3 having count(*)>1 order by n desc`),
  duplicateContentHash: await q(c, `select content_hash, count(*)::int n, array_agg(id) ids from media_archive_records where content_hash is not null group by 1 having count(*)>1 order by n desc`),
  duplicateQuotes: await q(c, `select quote_hash, count(*)::int n, array_agg(distinct media_record_id) ids from media_quotes where is_current group by 1 having count(*)>1 order by n desc`),
  dateMismatch: await q(c, `select m.id, m.published_date, d.media_published_date, d.published_at::date doc_date, d.title
    from media_archive_records m join knowledge_documents d on d.media_record_id=m.id
    where d.media_published_date is distinct from m.published_date or (d.published_at is not null and d.published_at::date <> m.published_date)
    order by m.published_date desc limit 100`),
  outletMismatch: await q(c, `select m.id, m.outlet, d.media_outlet, d.title from media_archive_records m join knowledge_documents d on d.media_record_id=m.id
    where d.media_outlet is distinct from m.outlet limit 100`),
  topicMismatch: await q(c, `select t.id, t.media_record_id, t.primary_topic, m.topic, t.is_current from media_analysis_topics t join media_archive_records m on m.id=t.media_record_id
    where t.is_current and t.primary_topic is distinct from m.topic limit 100`),
  multiCurrentTopic: await q(c, `select media_record_id, count(*)::int n from media_analysis_topics where is_current group by 1 having count(*)>1`),
  multiCurrentRole: await q(c, `select media_record_id, count(*)::int n from media_editorial_roles where is_current group by 1 having count(*)>1`),
  runsFailed: await q(c, `select id, media_record_id, document_id, status, attempt, max_attempts, error_code, error_detail, created_at from media_analysis_runs where status<>'completed' order by created_at desc`),
  brainMediaDocs: await q(c, `select count(distinct d.id)::int linked_docs, count(distinct r.provenance_document_id)::int docs_with_relationships
    from knowledge_documents d left join brain_relationships r on r.provenance_document_id=d.id where d.media_record_id is not null`),
  relationsInvalid: await q(c, `select r.id, r.source_media_record_id, r.target_media_record_id, r.relation_type
    from media_record_relations r left join media_archive_records s on s.id=r.source_media_record_id left join media_archive_records t on t.id=r.target_media_record_id
    where s.id is null or t.id is null or r.source_media_record_id=r.target_media_record_id`),
}));
for (const [k,v] of Object.entries(out)) { console.log('\n### '+k+' ('+v.length+')'); console.log(JSON.stringify(v,null,1)); }
