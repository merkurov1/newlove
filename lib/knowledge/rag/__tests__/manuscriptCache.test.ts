/**
 * @jest-environment node
 */
import {
  clearManuscriptCache,
  loadManuscriptInventory,
  loadManuscriptText,
} from '../manuscript';

/**
 * P. A repeated chapter/document request must reuse the cached inventory and
 * chunk window instead of issuing the same expensive queries again.
 */
test('reuses the manuscript inventory and chapter text cache', async () => {
  clearManuscriptCache();
  let calls = 0;

  const documentRow = {
    id: 'doc_unframed_manuscript',
    title: 'UNFRAMED',
    source_path: 'app/unframed/Unframed.markdown',
    source_sha256: 'a'.repeat(64),
    parser_version: 'unframed-parser-v1',
    chunker_version: 'unframed-chunker-v1',
    embedding_model: 'baai/bge-m3',
    access_class: 'owner',
    chunk_count: 2,
    source_char_count: 2_000,
    source_type: 'manuscript',
    ingestion_status: 'completed',
    extraction_status: 'complete',
    updated_at: '2026-11-13T00:00:00.000Z',
    metadata: {},
  };

  const chunkRows = [
    {
      id: 'chk_0000',
      chunk_index: 0,
      section_index: 0,
      heading: 'CHAPTER 01: A',
      section_path: ['PART I', 'CHAPTER 01: A'],
      char_start: 0,
      char_end: 1_000,
      line_start: 1,
      line_end: 10,
      content: 'Chapter one content.',
    },
    {
      id: 'chk_0001',
      chunk_index: 1,
      section_index: 0,
      heading: 'CHAPTER 01: A',
      section_path: ['PART I', 'CHAPTER 01: A'],
      char_start: 1_000,
      char_end: 2_000,
      line_start: 11,
      line_end: 20,
      content: 'Chapter one continues.',
    },
  ];

  function builder(table: string) {
    calls += 1;
    if (table === 'knowledge_documents') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: documentRow, error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              range: async () => ({ data: chunkRows, error: null }),
            }),
            gte: () => ({
              lte: () => ({
                order: async () => ({ data: chunkRows, error: null }),
              }),
            }),
          }),
        }),
      }),
    };
  }

  const store = { supabaseUrl: 'memory://manuscript-cache-test', from: builder } as never;

  const first = await loadManuscriptInventory({ store });
  const firstCalls = calls;
  const second = await loadManuscriptInventory({ store });
  expect(second).toBe(first);
  expect(calls).toBe(firstCalls);

  const firstText = await loadManuscriptText({ inventory: first, store, fromChunk: 0, toChunk: 1 });
  const textCalls = calls;
  const secondText = await loadManuscriptText({ inventory: second, store, fromChunk: 0, toChunk: 1 });
  expect(secondText).toEqual(firstText);
  expect(calls).toBe(textCalls);
  expect(firstText).toHaveLength(2);
});
