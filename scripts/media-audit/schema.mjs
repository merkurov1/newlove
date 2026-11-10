import { withDb, print } from './lib.mjs';
const tables=['media_archive_records','knowledge_documents','knowledge_chunks','media_analysis_runs','media_quotes','media_analysis_topics','media_editorial_roles','media_analysis_entities','media_record_relations','brain_entities','brain_relationships','brain_ingestion_jobs'];
const result = await withDb(async c=>{
  const r = await c.query(`select table_name, column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns where table_schema='public' and table_name = any($1)
    order by table_name, ordinal_position`,[tables]);
  return r.rows;
});
print(result);
