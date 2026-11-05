import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { extractPlainTextDocument } from '@/lib/knowledge/brain/textExtract';
import { chunkArticle } from '@/lib/knowledge/brain/chunk';

dotenv.config({ path: '.env.production.local' });

(async () => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await supabase.storage.from('brain-sources').download('36/36c4f56c2c50cb4fbc40175e36ea199b0c0f1a7ffb5a0f162fb82591864ee299.txt');
  let raw = Buffer.from(await data!.arrayBuffer()).toString('utf8');
  // Use the same cleaning as the queue-special step.
  const start = raw.indexOf('By Mary Ilyushina');
  const end = raw.indexOf('What readers are saying');
  raw = raw.slice(start, end).trim();
  const title = 'These data centers hold Putin’s AI aspirations. They’re big targets.';
  const subtitle = 'Ukrainian attacks on the facilities — some containing Russia’s most powerful supercomputers — threaten aspirations for entirely Russian-built “sovereign AI.”';
  const text = `${title}\n\n${subtitle}\n\n${raw}`;
  const article = extractPlainTextDocument({
    kind: 'text',
    rawText: text,
    sourceSha256: 'a'.repeat(64),
    title,
    author: 'Mary Ilyushina',
    publishedAt: '2026-10-29T00:00:00.000Z',
    language: 'EN',
  });
  const chunking = chunkArticle(article, 'doc_test');
  console.log('blocks', article.blocks.length, 'text', article.text.length, 'chunks', chunking.chunks.length);
  for (const c of chunking.chunks.slice(0, 12)) console.log(c.chunkIndex, c.content.length, c.charStart, c.charEnd);
})();
