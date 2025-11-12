#!/usr/bin/env node
const { Client } = require('pg');

function uniq(arr) {
  return Array.from(new Set(arr));
}

async function run() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('No DATABASE_URL in env. Aborting.');
    process.exit(2);
  }
  const client = new Client({ connectionString: DATABASE_URL, statement_timeout: 20000 });
  await client.connect();
  try {
    console.log('Connected. Checking tag coverage for auction/news...');

    // find Tag rows for auction/news (case-insensitive)
    const tagsRes = await client.query(
      "SELECT id, name, slug FROM public.\"Tag\" WHERE LOWER(slug) IN ('auction','news') OR LOWER(name) IN ('auction','news');"
    );
    const tags = tagsRes.rows;
    console.log(
      'Found Tag rows:',
      tags.map((t) => ({ id: t.id, slug: t.slug, name: t.name }))
    );

    const tagMap = {};
    for (const t of tags) tagMap[(t.slug || '').toLowerCase()] = t;

    // get junction article ids linked to these tag ids
    const tagIds = tags.map((t) => t.id);
    let linked = {};
    if (tagIds.length > 0) {
      // select raw rows from junction and inspect columns in JS to avoid SQL errors
      const jRes = await client.query(`SELECT * FROM public."_ArticleToTag" LIMIT 10000`);
      for (const row of jRes.rows) {
        // helper to pick first existing key
        const pick = (obj, names) => {
          for (const n of names) {
            if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] != null) return obj[n];
          }
          return null;
        };
        const aid = pick(row, ['A', 'a', 'article_id', 'articleId', 'article', 'A_id', 'a_id']);
        const bid = pick(row, ['B', 'b', 'tag_id', 'tag', 'B_id']);
        if (!aid || !bid) continue;
        const bidStr = String(bid);
        if (!tagIds.map(String).includes(bidStr)) continue;
        if (!linked[bidStr]) linked[bidStr] = [];
        linked[bidStr].push(String(aid));
      }
    }

    // detect if articles table has a tags column
    const colRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='articles' AND table_schema='public';"
    );
    const cols = colRes.rows.map((r) => r.column_name);
    console.log('articles columns:', cols.join(', '));
    const hasTagsColumn =
      cols.includes('tags') ||
      cols.includes('tag') ||
      cols.includes('tags_json') ||
      cols.includes('article_tags');

    // find candidate articles by searching title/slug/content for keywords or tags column
    const candidates = { auction: new Set(), news: new Set() };

    const searchKeywords = [
      ['auction', 'auction'],
      ['news', 'news'],
    ];
    for (const [key, kw] of searchKeywords) {
      // search in slug/title/content (case-insensitive)
      const q = `SELECT id, title, slug FROM public.articles WHERE (LOWER(slug) LIKE '%${kw}%' OR LOWER(title) LIKE '%${kw}%' OR LOWER(COALESCE(content,'')) LIKE '%${kw}%') LIMIT 500;`;
      const res = await client.query(q);
      for (const r of res.rows) candidates[key].add(String(r.id));
    }

    // Also, if tags column exists and is text or array, try to fetch articles where tags contain the slug
    if (cols.includes('tags')) {
      try {
        const resA = await client.query(
          'SELECT id, tags FROM public.articles WHERE tags IS NOT NULL LIMIT 500;'
        );
        for (const r of resA.rows) {
          const tval = r.tags;
          try {
            // tags might be text, json array, etc.
            const s = typeof tval === 'string' ? tval : JSON.stringify(tval);
            if (s && s.toLowerCase().includes('auction')) candidates.auction.add(String(r.id));
            if (s && s.toLowerCase().includes('news')) candidates.news.add(String(r.id));
          } catch (e) {}
        }
      } catch (e) {
        // ignore
      }
    }

    // summarize
    function summarize(keyword) {
      const tagRow = tagMap[keyword];
      const tid = tagRow ? String(tagRow.id) : null;
      const linkedSet = tid && linked[tid] ? new Set(linked[tid]) : new Set();
      const candSet = candidates[keyword];
      const linkedArr = Array.from(linkedSet);
      const candArr = Array.from(candSet);
      const missing = candArr.filter((id) => !linkedSet.has(id));
      return {
        tagRow,
        linkedCount: linkedArr.length,
        candidateCount: candArr.length,
        linked: linkedArr.slice(0, 200),
        candidates: candArr.slice(0, 200),
        missing: missing.slice(0, 200),
      };
    }

    const auctionSummary = summarize('auction');
    const newsSummary = summarize('news');

    console.log('\n--- Auction summary ---');
    console.log(JSON.stringify(auctionSummary, null, 2));
    console.log('\n--- News summary ---');
    console.log(JSON.stringify(newsSummary, null, 2));

    // Print details for missing (fetch titles)
    async function fetchTitles(ids) {
      if (!ids || ids.length === 0) return [];
      const res = await client.query(
        `SELECT id, title, slug FROM public.articles WHERE id = ANY($1::text[]) LIMIT 500`,
        [ids]
      );
      return res.rows;
    }

    const aucMissing = await fetchTitles(auctionSummary.missing);
    const newsMissing = await fetchTitles(newsSummary.missing);

    console.log('\n--- Auction missing details (up to 200) ---');
    console.log(JSON.stringify(aucMissing, null, 2));
    console.log('\n--- News missing details (up to 200) ---');
    console.log(JSON.stringify(newsMissing, null, 2));

    await client.end();
    console.log('\nDone.');
    process.exit(0);
  } catch (e) {
    console.error('Failed:', e);
    try {
      await client.end();
    } catch (_) {}
    process.exit(1);
  }
}

run();
