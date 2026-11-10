import { withDb, print } from './lib.mjs';
const out = await withDb(async c => {
  const fns = await c.query(`select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_functiondef(p.oid) def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('media_search','knowledge_search','brain_hybrid_search','media_catalog')`);
  const idx = await c.query(`select tablename, indexname, indexdef from pg_indexes where schemaname='public' and tablename in ('knowledge_chunks','knowledge_documents','media_archive_records','media_quotes','media_analysis_topics') order by tablename,indexname`);
  return { fns: fns.rows, idx: idx.rows };
});
for (const f of out.fns) { console.log('\n=== '+f.proname+'('+f.args+') ===\n'+f.def); }
console.log('\n=== INDEXES ==='); print(out.idx);
