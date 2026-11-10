import { withDb } from './lib.mjs';
const result = await withDb(async c=>{
  const r = await c.query(`select table_name, string_agg(column_name||':'||udt_name, ', ' order by ordinal_position) cols
    from information_schema.columns where table_schema='public' and table_name = any($1) group by table_name order by table_name`,
    [['media_archive_records','knowledge_documents','knowledge_chunks','media_analysis_runs','media_quotes','media_analysis_topics','media_editorial_roles','media_analysis_entities','media_record_relations']]);
  return r.rows;
});
for (const row of result) console.log(row.table_name+'\n  '+row.cols+'\n');
