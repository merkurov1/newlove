import { withDb, print } from './lib.mjs';
const out = await withDb(async c => {
  const q=async(s)=>(await c.query(s)).rows;
  return {
    scopeCounts: await q(`select
      count(*) filter (where lower(kind) in ('column','blog'))::int own_kind,
      count(*) filter (where author ilike '%меркуров%' or author ilike '%merkurov%')::int own_author,
      count(*) filter (where author ilike '%меркуров%' or author ilike '%merkurov%' or lower(kind) in ('column','blog'))::int own_union,
      count(*) filter (where not (author ilike '%меркуров%' or author ilike '%merkurov%' or lower(kind) in ('column','blog')))::int mentions_union,
      count(*)::int total from media_archive_records`),
    byKindScope: await q(`select kind,
      count(*) filter (where author ilike '%меркуров%' or author ilike '%merkurov%' or lower(kind) in ('column','blog'))::int own,
      count(*) filter (where not (author ilike '%меркуров%' or author ilike '%merkurov%' or lower(kind) in ('column','blog')))::int mention
      from media_archive_records group by kind order by kind`),
    foreign: await q(`select outlet, lang, count(*)::int n from media_archive_records where upper(lang)<>'RU' group by 1,2 order by n desc`),
    columns2026: await q(`select id,title,outlet,published_date::date date,kind,author from media_archive_records where published_date>='2026-01-01' and published_date<'2027-01-01' and (author ilike '%меркуров%' or lower(kind) in ('column','blog')) order by published_date`),
    mentions2026: await q(`select id,title,outlet,published_date::date date,kind,lang from media_archive_records where published_date>='2026-01-01' and published_date<'2027-01-01' and not (author ilike '%меркуров%' or lower(kind) in ('column','blog')) order by published_date`),
    lemonde: await q(`select id,title,outlet,published_date::date date,kind,lang from media_archive_records where lower(outlet)='le monde' order by published_date`),
    wapo: await q(`select id,title,outlet,published_date::date date,kind,lang from media_archive_records where lower(outlet) like '%washington post%' order by published_date`),
  };
});
print(out);
