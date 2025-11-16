const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Read .env.local
const envPath = path.resolve(__dirname, '..', '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const dbUrlLine = envFile.split('\n').find((line) => line.startsWith('DATABASE_URL='));

if (!dbUrlLine) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const connectionString = dbUrlLine.substring('DATABASE_URL='.length).replace(/"/g, '');

// Read SQL queries
const sqlFilePath = path.resolve(
  __dirname,
  '..',
  'migrations',
  '2025-11-09_FULL_DATABASE_DIAGNOSTIC.sql'
);
const sqlFileContent = fs.readFileSync(sqlFilePath, 'utf8');

// Split SQL into individual queries
const queries = sqlFileContent
  .split(';')
  .map((q) => q.trim())
  .filter((q) => q.length > 0);
const queryTitles =
  sqlFileContent.match(/-- ========================================[\s\S]*?--/g) || [];

async function runDiagnostics() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected to the database.');

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const title = queryTitles[i] ? queryTitles[i].replace(/--/g, '').trim() : `Query ${i + 1}`;

      console.log(`\n\n--- ${title} ---\n`);

      try {
        const res = await client.query(query);
        console.table(res.rows);
      } catch (err) {
        console.error(`Error executing query: ${query}`, err.stack);
      }
    }
  } catch (err) {
    console.error('Database connection error', err.stack);
  } finally {
    await client.end();
    console.log('\nDatabase connection closed.');
  }
}

runDiagnostics();
