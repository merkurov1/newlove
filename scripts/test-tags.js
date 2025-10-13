#!/usr/bin/env node
// scripts/test-tags.js
// Simple script to exercise lib/tags.upsertTagsAndLink against the configured Supabase.

const { createClient } = require('@supabase/supabase-js');
// We'll implement the minimal upsert+link logic inline to avoid importing TS module from a Node script.

async function main() {
  console.log('Starting upsertTagsAndLink test...');
  const args = process.argv.slice(2);
  const apply = args.includes('--apply') || args.includes('--force');
  const asJson = args.includes('--json') || args.includes('--format=json');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  let simulateOnly = false;
  if (!supabaseUrl || !supabaseKey) {
    if (apply) {
      console.error('Missing Supabase env vars: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run with --apply');
      process.exit(1);
    }
    console.log('Supabase env not found — running in simulate mode (no writes). Use --apply to perform changes with env vars set.');
    simulateOnly = true;
  }

  let supabase = null;
  if (!simulateOnly) {
    try {
      // use centralized helper if available
      const clientHelper = require('./supabase-client');
      supabase = clientHelper.getScriptSupabase();
    } catch (err) {
      // fallback to inline creation if helper isn't present or envs missing
      supabase = createClient(supabaseUrl, supabaseKey);
    }
  }
  const crypto = require('crypto');
  const testEntityId = 'test-entity-' + Date.now();
  const tags = ['node-test', 'migration-script', 'temp'];
  try {
    // Upsert tags. Tag.id is TEXT NOT NULL; provide ids to avoid NOT NULL violations.
    const now = new Date().toISOString();
    const normalized = tags.map(t => ({ id: crypto.randomUUID(), name: t, slug: t.replace(/\s+/g, '-').toLowerCase(), createdAt: now, updatedAt: now }));
    if (simulateOnly) {
      const out = { action: 'upsert-tags', tags: normalized.map(n => ({ id: n.id, name: n.name })) };
      if (asJson) console.log(JSON.stringify(out)); else console.log('[simulate] Would upsert tags:', normalized.map(n => n.name).join(', '));
    } else {
      const { data: upserted, error: upsertErr } = await supabase.from('Tag').upsert(normalized, { onConflict: 'name' }).select('id,name');
      if (upsertErr) throw upsertErr;
      console.log('Upserted tags:', (upserted || []).map(n => n.name).join(', '));
    }

    // Ensure a test article exists (so FK from _ArticleToTag -> articles satisfies)
    // Find an existing user to be author
    let users = [];
    let usersErr = null;
    if (simulateOnly) {
      console.log('[simulate] Would fetch one existing user to use as author');
    } else {
      const resp = await supabase.from('User').select('id').limit(1);
      users = resp.data;
      usersErr = resp.error;
    }
    if (usersErr) {
      // If the User table isn't accessible, throw; otherwise try fallback
      throw usersErr;
    }
    let authorId = users && users.length ? users[0].id : null;
    if (!authorId) {
      // Create a minimal fallback user
      const fallbackUser = { id: crypto.randomUUID(), name: 'test-user', email: `test+${Date.now()}@example.com`, createdAt: now };
      if (simulateOnly) {
        const out = { action: 'insert-user', user: { id: fallbackUser.id, email: fallbackUser.email } };
        if (asJson) console.log(JSON.stringify(out)); else console.log('[simulate] Would insert fallback user:', fallbackUser.email);
      } else {
        const { error: insertUserErr } = await supabase.from('User').insert(fallbackUser);
        if (insertUserErr) throw insertUserErr;
      }
      authorId = fallbackUser.id;
    }

    // Insert a minimal article with testEntityId
    const articleRow = {
      id: testEntityId,
      title: 'Test Article for tags script',
      slug: testEntityId,
      content: '[]',
      authorId,
      createdAt: now,
      updatedAt: now
    };
    if (simulateOnly) {
      const out = { action: 'insert-article', articleId: articleRow.id };
      if (asJson) console.log(JSON.stringify(out)); else console.log('[simulate] Would insert article:', articleRow.id);
    } else {
      const { data: createdArticle, error: insertArticleErr } = await supabase.from('articles').insert(articleRow).select().maybeSingle();
      if (insertArticleErr) {
        // If it's a unique violation, ignore; otherwise throw
        const msg = (insertArticleErr && insertArticleErr.message) || String(insertArticleErr);
        if (!/unique|duplicate|23505/i.test(msg)) throw insertArticleErr;
      }
    }

    // Fetch tag ids
    const names = normalized.map(n => n.name);
    let tagRows = [];
    if (simulateOnly) {
      const out = { action: 'fetch-tags', names };
      if (asJson) console.log(JSON.stringify(out));
      tagRows = normalized.map(n => ({ id: n.id, name: n.name }));
    } else {
      const { data: fetched, error: fetchErr } = await supabase.from('Tag').select('id,name').in('name', names);
      if (fetchErr) throw fetchErr;
      tagRows = fetched || [];
    }
    const tokens = (tagRows || []).map(r => ({ A: testEntityId, B: r.id }));
    if (tokens.length > 0) {
      if (simulateOnly) {
        const out = { action: 'upsert-junctions', count: tokens.length, sample: tokens.slice(0,5) };
        if (asJson) console.log(JSON.stringify(out)); else console.log('[simulate] Would upsert junction rows to _ArticleToTag:', tokens.length);
      } else {
        const { error: insertErr } = await supabase.from('_ArticleToTag').upsert(tokens, { onConflict: 'A,B' });
        if (insertErr) throw insertErr;
      }
    }
    if (!asJson) console.log('Tags upsert + linking completed (check supabase for results)');
  } catch (e) {
    console.error('Tags test failed (full error object):', e);
    try {
      // Some errors are complex objects; try to stringify all properties for visibility
      console.error('Tags test error (JSON):', JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
    } catch (err) {
      // ignore stringify failures
    }
    process.exit(1);
  }
}

main();
