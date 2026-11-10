import { withDb, print } from './lib.mjs';
const q = async (c, sql, params=[]) => (await c.query(sql, params)).rows;
const out = await withDb(async c => {
  const one = async (sql, params=[]) => (await q(c, sql, params))[0] || {};
  return {
    mediaTotal: await one(`select count(*)::int total, count(*) filter (where status='published')::int published from media_archive_records`),
    mediaByStatus: await q(c, `select status, count(*)::int n from media_archive_records group by status order by n desc`),
    mediaByIndexing: await q(c, `select indexing_status, count(*)::int n from media_archive_records group by indexing_status order by n desc`),
    mediaByKind: await q(c, `select kind, count(*)::int n from media_archive_records group by kind order by n desc`),
    mediaByYear: await q(c, `select extract(year from published_date)::int y, count(*)::int n from media_archive_records where published_date is not null group by 1 order by 1`),
    mediaNullDates: await one(`select count(*)::int n from media_archive_records where published_date is null`),
    outlets: await q(c, `select outlet, count(*)::int n from media_archive_records group by outlet order by n desc limit 40`),
    outletCount: await one(`select count(distinct outlet)::int n from media_archive_records`),
    languages: await q(c, `select coalesce(lang,'(null)') lang, count(*)::int n from media_archive_records group by 1 order by n desc`),
    topics: await q(c, `select coalesce(topic,'(null)') topic, count(*)::int n from media_archive_records group by 1 order by n desc`),
    docs: await one(`select count(*)::int total, count(*) filter (where media_record_id is not null)::int media from knowledge_documents`),
    docSourceTypes: await q(c, `select source_type, count(*)::int n from knowledge_documents group by 1 order by n desc`),
    docIngestion: await q(c, `select ingestion_status, count(*)::int n from knowledge_documents group by 1 order by n desc`),
    docExtraction: await q(c, `select extraction_status, count(*)::int n from knowledge_documents group by 1 order by n desc`),
    mediaCoverage: await q(c, `select media_coverage_status, count(*)::int n from knowledge_documents where media_record_id is not null group by 1 order by n desc`),
    textQuality: await q(c, `select media_text_quality, count(*)::int n from knowledge_documents where media_record_id is not null group by 1 order by n desc`),
    embedModels: await q(c, `select embedding_model, embedding_dimensions, count(*)::int n from knowledge_chunks group by 1,2 order by n desc`),
    docEmbedModels: await q(c, `select embedding_model, embedding_dimensions, count(*)::int n from knowledge_documents group by 1,2 order by n desc`),
    chunks: await one(`select count(*)::int total, count(*) filter (where embedding is null)::int null_embedding from knowledge_chunks`),
    runs: await q(c, `select status, count(*)::int n from media_analysis_runs group by 1 order by n desc`),
    quotes: await one(`select count(*)::int total, count(*) filter (where is_current)::int current, count(distinct quote_hash)::int distinct_hash from media_quotes`),
    quoteTypes: await q(c, `select quote_type, verification_status, count(*)::int n from media_quotes where is_current group by 1,2 order by n desc`),
    topicsAnalysis: await q(c, `select primary_topic, count(*)::int n from media_analysis_topics where is_current group by 1 order by n desc`),
    roles: await q(c, `select role, count(*)::int n from media_editorial_roles where is_current group by 1 order by n desc`),
    entities: await one(`select count(*)::int total from media_analysis_entities where is_current`),
    relations: await q(c, `select relation_type, count(*)::int n from media_record_relations where is_current group by 1 order by n desc`),
    brain: await one(`select (select count(*) from brain_entities)::int entities, (select count(*) from brain_relationships)::int relationships, (select count(distinct provenance_document_id) from brain_relationships)::int rel_docs`),
    brainJobs: await q(c, `select source_type, status, count(*)::int n from brain_ingestion_jobs group by 1,2 order by n desc`),
  };
});
print(out);
