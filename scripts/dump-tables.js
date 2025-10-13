#!/usr/bin/env node
// Dump tables `articles` and `letters` to CSV and SQL INSERTs into ./dumps
// Usage: node scripts/dump-tables.js

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

async function dumpTable(client, tableName) {
  console.log('Dumping table', tableName);
  const res = await client.query(`SELECT * FROM "${tableName}"`);
  const rows = res.rows;
  const outDir = path.join(process.cwd(), 'dumps');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  // CSV
  const csvPath = path.join(outDir, `${tableName}.csv`);
  const cols = res.fields.map(f => f.name);
  const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => {
    const v = r[c];
    if (v === null || v === undefined) return '';
    return '"' + String(v).replace(/"/g, '""') + '"';
  }).join(','))).join('\n');
  fs.writeFileSync(csvPath, csv);

  // SQL INSERTs
  const sqlPath = path.join(outDir, `${tableName}.sql`);
  const inserts = rows.map(r => {
    const colsQuoted = cols.map(c => '"' + c + '"').join(', ');
    const vals = cols.map(c => {
      const v = r[c];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'string') return "'" + v.replace(/'/g, "''") + "'";
      return "'" + String(v) + "'";
    }).join(', ');
    return `INSERT INTO \"${tableName}\" (${colsQuoted}) VALUES (${vals});`;
  }).join('\n');
  fs.writeFileSync(sqlPath, inserts);

  return { rows: rows.length, csvPath, sqlPath };
}

(async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const tables = ['articles', 'letters'];
    const results = {};
    for (const t of tables) {
      try {
        results[t] = await dumpTable(client, t);
      } catch (e) {
        console.error('Failed to dump', t, e.message);
        results[t] = null;
      }
    }
    console.log('Dump results:', results);
  } finally {
    await client.end();
  }
})();
