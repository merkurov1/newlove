import { withDb } from './lib.mjs';
const out = await withDb(async c => {
  const src = (await c.query(`select ch.id chunk_id, ch.embedding::text emb, m.title, m.outlet, m.published_date::date d, d.id doc
    from knowledge_chunks ch join knowledge_documents d on d.id=ch.document_id join media_archive_records m on m.id=d.media_record_id
    where m.published_date >= '2026-01-01' and d.media_text_quality='full_text' order by ch.id limit 1`)).rows[0];
  const run = async (params) => (await c.query(`select * from public.media_search($1::vector,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, params)).rows;
  const base = [src.emb,'baai/bge-m3',1024,'owner',12,-1,null,null,null,null,null];
  const all = await run(base);
  const owner = await run(['['+Array(1024).fill(0).join(',')+']','baai/bge-m3',1024,'owner',12,-1,null,null,null,null,null]);
  const pub = await run(['['+Array(1024).fill(0).join(',')+']','baai/bge-m3',1024,'public',12,-1,null,null,null,null,null]);
  const filtered = await run([src.emb,'baai/bge-m3',1024,'owner',12,-1,'2026-01-01','2026-12-31',null,null,['The Washington Post']]);
  return { src, all: all.map(r=>({doc:r.document_id,title:r.title,outlet:r.outlet,d:r.published_date,sim:r.similarity})), zeroOwnerCount: owner.length, zeroPublicCount: pub.length, filtered: filtered.map(r=>({title:r.title,outlet:r.outlet,d:r.published_date,sim:r.similarity})) };
});
console.log(JSON.stringify(out,null,2));
