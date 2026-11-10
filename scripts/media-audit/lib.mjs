import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({ path: '.env.production.local', quiet: true });
const { Client } = pg;
const conn = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!conn) throw new Error('no db url');
export async function withDb(fn){
  const client = new Client({connectionString: conn, ssl: {rejectUnauthorized:false}});
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}
export function print(rows){ console.log(JSON.stringify(rows,null,2)); }
