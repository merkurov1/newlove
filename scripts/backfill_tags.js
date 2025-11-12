#!/usr/bin/env node
const { Client } = require('pg');

async function run() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('No DATABASE_URL in env. Aborting.');
    process.exit(2);
  }
  const client = new Client({ connectionString: DATABASE_URL, statement_timeout: 60000 });
  await client.connect();
  try {
    console.log('Connected. Beginning backfill for tags: auction, news');
    const slugs = ['auction', 'news'];
    // detect articles columns
    const colRes = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='articles' AND table_schema='public';"
    );
    const cols = colRes.rows.map((r) => r.column_name);
    const hasTagsColumn = cols.includes('tags');

    for (const slug of slugs) {
      console.log('\nProcessing tag:', slug);
      const tagRowRes = await client.query(
        'SELECT id,name,slug FROM public."Tag" WHERE LOWER(slug) = $1 OR LOWER(name) = $1 LIMIT 1',
        [slug]
      );
      if (!tagRowRes.rows || tagRowRes.rows.length === 0) {
        console.warn('Tag not found in Tag table for slug', slug);
        continue;
      }
      const tag = tagRowRes.rows[0];
      const tagId = String(tag.id);
      console.log('Tag id:', tagId, 'name:', tag.name);

      // build candidate set
      const candidates = new Set();
      // search slug/title/content
      const q = `SELECT id FROM public.articles WHERE (LOWER(slug) LIKE $1 OR LOWER(title) LIKE $1 OR LOWER(COALESCE(content,'')) LIKE $1) LIMIT 1000`;
      const likePattern = `%${slug}%`;
      const res1 = await client.query(q, [likePattern]);
      for (const r of res1.rows) candidates.add(String(r.id));

      // if tags column exists, search it
      if (hasTagsColumn) {
        try {
          const resTags = await client.query(
            'SELECT id, tags FROM public.articles WHERE tags IS NOT NULL LIMIT 2000'
          );
          for (const r of resTags.rows) {
            const t = r.tags;
            try {
              const s = typeof t === 'string' ? t : JSON.stringify(t);
              if (s && s.toLowerCase().includes(slug)) candidates.add(String(r.id));
            } catch (e) {}
          }
        } catch (e) {
          console.warn('tags column scanning failed:', String(e));
        }
      }

      console.log('Candidates found:', candidates.size);

      // read full junction and map existing links
      const jRes = await client.query('SELECT * FROM public."_ArticleToTag"');
      const existing = new Set();
      for (const row of jRes.rows) {
        // pick keys
        const pick = (obj, names) => {
          for (const n of names)
            if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] != null) return obj[n];
          return null;
        };
        const aid = pick(row, ['A', 'a', 'article_id', 'articleId', 'A_id', 'a_id', 'article']);
        const bid = pick(row, ['B', 'b', 'tag_id', 'tag', 'B_id']);
        if (!aid || !bid) continue;
        if (String(bid) === tagId) existing.add(String(aid));
      }

      console.log('Existing links for tag:', existing.size);

      const missing = Array.from(candidates).filter((id) => !existing.has(id));
      console.log('Missing links to insert:', missing.length);

      if (missing.length > 0) {
        console.log('Preparing to insert missing rows (will insert one-by-one, safe)...');
        for (const aid of missing) {
          try {
            // double-check not exists
            if (existing.has(aid)) continue;
            await client.query('BEGIN');
            // Insert into _ArticleToTag using columns A and B
            await client.query('INSERT INTO public."_ArticleToTag"("A","B") VALUES ($1,$2)', [
              aid,
              tagId,
            ]);
            await client.query('COMMIT');
            existing.add(aid);
            console.log('Inserted link:', aid, '->', tagId);
          } catch (e) {
            try {
              await client.query('ROLLBACK');
            } catch (_) {}
            console.error('Insert failed for', aid, String(e));
          }
        }
      }

      console.log('Done processing tag', slug);
    }

    // Create view for normalized article_to_tag and indexes in a robust way by checking actual columns
    try {
      const colq = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='_ArticleToTag'"
      );
      const presentCols = colq.rows.map((r) => r.column_name);
      const articleCols = ['A', 'a', 'article_id', 'articleId', 'A_id', 'a_id', 'article'].filter(
        (c) => presentCols.includes(c)
      );
      const tagCols = ['B', 'b', 'tag_id', 'tag', 'B_id'].filter((c) => presentCols.includes(c));

      const makeCoalesce = (cols) => {
        if (!cols || cols.length === 0) return null;
        return 'COALESCE(' + cols.map((c) => '"' + c + '"').join(',') + ')';
      };

      const artExpr = makeCoalesce(articleCols);
      const tagExpr = makeCoalesce(tagCols);

      if (artExpr && tagExpr) {
        const viewSql = `CREATE OR REPLACE VIEW public.article_to_tag_view AS\nSELECT ${artExpr}::text AS article_id, ${tagExpr}::text AS tag_id\nFROM public."_ArticleToTag";`;
        await client.query(viewSql);
        console.log('View public.article_to_tag_view created/replaced');

        // create indexes using the same expressions
        const idxA = `CREATE INDEX IF NOT EXISTS idx_articletotag_a ON public."_ArticleToTag" (( ${artExpr} ));`;
        const idxB = `CREATE INDEX IF NOT EXISTS idx_articletotag_b ON public."_ArticleToTag" (( ${tagExpr} ));`;
        await client.query(idxA);
        await client.query(idxB);
        console.log('Indexes created/ensured on _ArticleToTag');
      } else {
        console.warn(
          'Could not build view/index: required columns not present in _ArticleToTag. Present columns:',
          presentCols.join(',')
        );
      }
    } catch (e) {
      console.error('Failed to create view/indexes:', String(e));
    }

    await client.end();
    console.log('\nBackfill complete.');
    process.exit(0);
  } catch (e) {
    console.error('Backfill failed:', e);
    try {
      await client.end();
    } catch (_) {}
    process.exit(1);
  }
}

run();
