import { withDb, print } from './lib.mjs';
const out = await withDb(async c => {
  const q=async(s)=>(await c.query(s)).rows;
  return {
    authors: await q(`select coalesce(author,'(null)') author, count(*)::int n from media_archive_records group by 1 order by n desc limit 30`),
    ownKinds: await q(`select kind, count(*)::int n from media_archive_records where lower(kind) in ('column','blog') group by 1`),
    publicRetrieval: await q(`select source_type, count(*)::int n from knowledge_documents where public_retrieval_allowed=true group by 1`),
    rls: await q(`select relname, relrowsecurity from pg_class where relname in ('media_archive_records','knowledge_documents','knowledge_chunks') and relnamespace='public'::regnamespace`),
    grants: await q(`select table_name, grantee, string_agg(privilege_type,',') privs from information_schema.role_table_grants where table_schema='public' and table_name in ('media_archive_records','knowledge_documents','knowledge_chunks') group by 1,2 order by 1,2`),
  };
});
print(out);
