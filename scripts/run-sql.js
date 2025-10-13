#!/usr/bin/env node
// Executes SQL files against DATABASE_URL from .env
// Usage: node scripts/run-sql.js <file1.sql> [file2.sql ...]

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

const dangerousPatterns = [
  /DROP\s+TABLE/i,
  /DELETE\s+FROM/i,
  /ALTER\s+TABLE\s+"?User"?/i,
  /DROP\s+TYPE/i,
  /DROP\s+TABLE IF EXISTS "articles"/i,
];

async function runFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log('\n---');
  console.log('File:', filePath);

  const isDangerous = dangerousPatterns.some((re) => re.test(sql));
  if (isDangerous) {
    if (process.env.AUTO_YES === '1' || process.env.AUTO_CONFIRM === '1') {
      console.log('AUTO_YES set: applying destructive file', path.basename(filePath));
    } else {
      const prompt = require('prompt-sync')({ sigint: true });
      const answer = prompt(`File ${path.basename(filePath)} looks destructive. Apply? (yes/no) `);
      if (answer.trim().toLowerCase() !== 'yes') {
        console.log('Skipped', filePath);
        return;
      }
    }
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    console.log('Executing...');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Applied', filePath);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error applying', filePath, e.message);
  } finally {
    await client.end();
  }
}

(async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('No files provided. Usage: node scripts/run-sql.js migrate_postcards.sql ...');
    process.exit(1);
  }

  for (const f of files) {
    const p = path.isAbsolute(f) ? f : path.join(process.cwd(), f);
    if (!fs.existsSync(p)) {
      console.error('Not found:', p);
      continue;
    }
    await runFile(p);
  }
})();
