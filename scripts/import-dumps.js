#!/usr/bin/env node
// Import dumps/articles.sql and dumps/letters.sql safely by converting
// INSERT statements to use ON CONFLICT ("id") DO NOTHING

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

function transformSql(sql) {
  // Very simple transform: replace ') VALUES (' pattern and add ON CONFLICT ("id") DO NOTHING;
  // Handles multiple INSERT statements separated by semicolons.
  return sql
    .split(/;\s*\n/)
    .map(stmt => stmt.trim())
    .filter(Boolean)
    .map(stmt => {
      if (/^INSERT\s+INTO\s+/i.test(stmt)) {
        // If already has ON CONFLICT, leave
        if (/ON\s+CONFLICT/i.test(stmt)) return stmt + ';';
        // Append ON CONFLICT ("id") DO NOTHING
        return stmt + ' ON CONFLICT ("id") DO NOTHING;';
      }
      return stmt + ';';
    })
    .join('\n');
}

async function runFile(filePath) {
  console.log('Importing', filePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  let statements = raw
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);

  // Convert human-readable timestamps in single quotes to ISO strings
  const convertTimestamps = (stmt) => {
    return stmt.replace(/'([^']*GMT[^']*\([^']*\)[^']*)'/g, (m, p1) => {
      try {
        const d = new Date(p1);
        if (isNaN(d.getTime())) return m; // leave as-is if unparsable
        const iso = d.toISOString();
        return `'${iso}'`;
      } catch (e) {
        return m;
      }
    });
  };

  statements = statements.map(convertTimestamps);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    for (const stmt of statements) {
      if (!stmt) continue;
      const toExec = stmt.endsWith(';') ? stmt : stmt + ';';
      try {
        await client.query(toExec);
      } catch (e) {
        if (e.code === '23505') {
          // unique violation, skip
          console.log('Skipped duplicate (23505) for a statement');
          continue;
        }
        console.error('Statement error (continuing):', e.message);
        continue;
      }
    }
    console.log('Imported', filePath);
  } catch (e) {
    console.error('Error importing', filePath, e.message);
  } finally {
    await client.end();
  }
}

(async function main(){
  const dumps = ['dumps/articles.sql','dumps/letters.sql'];
  for(const d of dumps){
    const p = path.join(process.cwd(), d);
    if(!fs.existsSync(p)){
      console.warn('Not found', p);
      continue;
    }
    await runFile(p);
  }
  console.log('Done.');
})();
