#!/usr/bin/env tsx
/**
 * Fill genuinely empty Media Archive summaries from the first linked Brain
 * chunks. Bounded, idempotent and resumable: only rows with an empty summary
 * are touched, and the existing summary is never overwritten.
 *
 *   npx tsx scripts/knowledge/backfill-media-summaries.ts --report
 *   npx tsx scripts/knowledge/backfill-media-summaries.ts --apply --limit 50
 */
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { Client } from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

function has(name: string) {
  return process.argv.includes(name);
}
function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : null;
}

async function connect() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL_missing');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

function excerpt(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[>#*+-]+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function summarize(input: {
  title: string;
  outlet: string;
  language: string;
  text: string;
}): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return excerpt(input.text).slice(0, 320);

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    timeout: 20_000,
    maxRetries: 1,
  });

  const response = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    temperature: 0.1,
    max_tokens: 220,
    messages: [
      {
        role: 'system',
        content:
          'Write a neutral 1–2 sentence summary of the supplied publication. ' +
          'Use only facts present in the text. Do not invent names, dates, quotes or conclusions. ' +
          'Write in the publication language. Return plain text only, at most 350 characters.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          title: input.title,
          outlet: input.outlet,
          language: input.language,
          text: input.text.slice(0, 4000),
        }),
      },
    ],
  });

  const summary = (response.choices[0]?.message?.content || '').replace(/\s+/g, ' ').trim();
  return summary ? summary.slice(0, 400) : excerpt(input.text).slice(0, 320);
}

async function main() {
  const client = await connect();
  try {
    const rows = await client.query<{
      id: string;
      title: string;
      outlet: string;
      lang: string;
      document_id: string;
      text: string;
    }>(
      `select m.id, m.title, m.outlet, m.lang, d.id document_id,
              (select string_agg(c.content, E'\n\n' order by c.chunk_index)
                 from knowledge_chunks c
                where c.document_id=d.id
                  and c.chunk_index < 2) text
         from media_archive_records m
         join knowledge_documents d on d.media_record_id=m.id
        where coalesce(trim(m.summary),'')=''
          and d.chunk_count > 0
        order by m.published_date desc`
    );

    console.log(`[summaries] empty_with_text=${rows.rows.length}`);
    if (has('--report')) return;

    const limit = Math.min(100, Math.max(1, Number(arg('--limit') || 50)));
    let updated = 0;
    let failed = 0;

    for (const row of rows.rows.slice(0, limit)) {
      try {
        const summary = await summarize({
          title: row.title,
          outlet: row.outlet,
          language: row.lang,
          text: excerpt(row.text || ''),
        });
        if (!summary) throw new Error('empty_summary');
        await client.query(
          `update media_archive_records
              set summary=$1, updated_at=now(),
                  ai_metadata = coalesce(ai_metadata,'{}'::jsonb) || $2::jsonb
            where id=$3 and coalesce(trim(summary),'')=''`,
          [
            summary,
            JSON.stringify({
              summary_source: 'brain_first_chunks',
              summary_generated_at: new Date().toISOString(),
            }),
            row.id,
          ]
        );
        updated += 1;
      } catch (error) {
        failed += 1;
        console.error(`[summaries] ${row.id}: ${error instanceof Error ? error.message : error}`);
      }
    }

    console.log(`[summaries] updated=${updated} failed=${failed}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[summaries] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
