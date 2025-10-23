#!/usr/bin/env node
// scripts/cleanup-test-data.js
// Removes test artifacts created by scripts/test-tags.js: tags (node-test, migration-script, temp),
// any articles with id LIKE 'test-entity-%' and fallback users created with email pattern test+%@example.com

const { Client } = require('pg');

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply') || args.includes('--force');
  const asJson = args.includes('--json') || args.includes('--format=json');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (apply) {
      console.error('No DATABASE_URL found in env to run cleanup with --apply');
      process.exit(1);
    }
    console.log('DATABASE_URL not found — running in simulate mode (no writes). Use --apply to perform deletions with DATABASE_URL set.');
  }
  const client = databaseUrl ? new Client({ connectionString: databaseUrl }) : new Client({ connectionString: 'postgres://invalid' });
  try {
    await client.connect();

    // Delete ArticleToTag rows for test articles
    if (!databaseUrl) {
      const out = { action: 'delete-_ArticleToTag', pattern: 'test-entity-%' };
      if (asJson) console.log(JSON.stringify(out)); else console.log('[simulate] Would delete _ArticleToTag rows for test-entity-*');
    } else if (!apply) {
      console.log('[dry-run] DATABASE_URL present but --apply not provided: would delete _ArticleToTag rows');
    } else {
      const del1 = await client.query("DELETE FROM \"_ArticleToTag\" WHERE \"A\" LIKE 'test-entity-%' RETURNING *");
      console.log('Deleted _ArticleToTag rows:', del1.rowCount);
    }

    // Delete test tags by name
    if (!databaseUrl) {
      const out = { action: 'delete-Tag', names: ['node-test','migration-script','temp'] };
      if (asJson) console.log(JSON.stringify(out)); else console.log('[simulate] Would delete Tag rows by name: node-test, migration-script, temp');
    } else if (!apply) {
      console.log('[dry-run] Would delete Tag rows by name (provide --apply to perform deletions)');
    } else {
      const del2 = await client.query("DELETE FROM \"Tag\" WHERE name IN ('node-test','migration-script','temp') RETURNING id,name");
      console.log('Deleted Tag rows:', del2.rowCount, del2.rows.slice(0,10));
    }

    // Delete test articles
    if (!databaseUrl) {
      const out = { action: 'delete-articles', pattern: "test-entity-%" };
      if (asJson) console.log(JSON.stringify(out)); else console.log('[simulate] Would delete articles with id LIKE test-entity-%');
    } else if (!apply) {
      console.log('[dry-run] Would delete articles rows (provide --apply to perform deletions)');
    } else {
      const del3 = await client.query("DELETE FROM articles WHERE id LIKE 'test-entity-%' RETURNING id");
      console.log('Deleted articles rows:', del3.rowCount, del3.rows.slice(0,10));
    }

    // Delete fallback test users (patterned email and name)
    if (!databaseUrl) {
      const out = { action: 'delete-users', filter: { name: 'test-user', email_like: 'test+%@example.com' } };
      if (asJson) console.log(JSON.stringify(out)); else console.log('[simulate] Would delete fallback users with name=test-user and email pattern');
    } else if (!apply) {
      console.log('[dry-run] Would delete fallback users (provide --apply to perform deletions)');
    } else {
      const del4 = await client.query("DELETE FROM \"User\" WHERE name = 'test-user' AND email LIKE 'test+%@example.com' RETURNING id,email");
      console.log('Deleted fallback users:', del4.rowCount, del4.rows.slice(0,10));
    }

    await client.end();
    console.log('Cleanup finished.');
  } catch (e) {
    console.error('Cleanup failed:', e);
    try { await client.end(); } catch(_){}
    process.exit(1);
  }
}

main();
