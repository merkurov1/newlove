import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env.production.local' });

function literal(values: number[]) {
  return `[${values.map((v) => v.toFixed(8)).join(',')}]`;
}

(async () => {
  const query = 'data centers Putin AI aspirations';
  const moduleName = '@huggingface/transformers';
  const transformers = await import(moduleName);
  transformers.env.allowLocalModels = false;
  const extractor = await transformers.pipeline('feature-extraction', 'Xenova/bge-m3', {
    dtype: 'q8',
    device: 'cpu',
  });
  const output = await extractor([query], { pooling: 'cls', normalize: true });
  const vector = Array.from(output.data as Float32Array);
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { rows } = await c.query(
    `select document_title, source_type, similarity, left(content, 260) excerpt
       from brain_search_hybrid($1::vector, 'baai/bge-m3', 1024, 'owner', $2::text,
         null,null,null,null,null,null,null, 3, -1)`,
    [literal(vector), query]
  );
  await c.end();
  console.log(JSON.stringify(rows, null, 2));
})();
