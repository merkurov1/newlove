import {
  buildChapterWindows,
  buildManuscriptStructure,
  formatCoverage,
  parseChapterHeading,
  resolveManuscriptChapter,
  validateManuscriptInventory,
  type ManuscriptChunk,
  type ManuscriptChunkMeta,
} from '@/lib/knowledge/rag/manuscriptStructure';

function meta(
  index: number,
  heading: string,
  start: number,
  end: number,
  sectionIndex = 0,
  sectionPath = [heading]
): ManuscriptChunkMeta {
  return {
    chunkId: `chk_${String(index).padStart(4, '0')}`,
    chunkIndex: index,
    sectionIndex,
    heading,
    sectionPath,
    charStart: start,
    charEnd: end,
    lineStart: index * 10 + 1,
    lineEnd: index * 10 + 9,
  };
}

const chunks: ManuscriptChunkMeta[] = [
  meta(0, 'INTRODUCTION: UNFRAMED', 100, 1_100),
  meta(1, 'PART I', 1_100, 1_200),
  meta(2, 'CHAPTER 14: THE LONDON SHUTTLE', 1_200, 2_500, 1, ['PART II', 'CHAPTER 14: THE LONDON SHUTTLE']),
  meta(3, 'CHAPTER 14: THE LONDON SHUTTLE', 2_200, 3_400, 1, ['PART II', 'CHAPTER 14: THE LONDON SHUTTLE']),
  meta(4, 'CHAPTER 36: THE SILENT CITY AND THE NEW DEAL', 3_400, 4_600, 2, ['PART III', 'CHAPTER 36: THE SILENT CITY AND THE NEW DEAL']),
  meta(5, 'EPILOGUE: THE RETURN ON INVESTMENT', 4_600, 5_000, 3, ['PART IV', 'EPILOGUE: THE RETURN ON INVESTMENT']),
];

describe('manuscript structure and coverage', () => {
  it('parses chapter, introduction and epilogue headings', () => {
    expect(parseChapterHeading('CHAPTER 14: THE LONDON SHUTTLE')).toMatchObject({
      kind: 'chapter',
      number: 14,
      title: 'THE LONDON SHUTTLE',
    });
    expect(parseChapterHeading('INTRODUCTION: UNFRAMED')?.kind).toBe('introduction');
    expect(parseChapterHeading('EPILOGUE: THE RETURN ON INVESTMENT')?.kind).toBe('epilogue');
  });

  it('detects missing chunks, duplicates, gaps and low coverage', () => {
    const broken = [
      meta(0, 'CHAPTER 01: A', 0, 1_000),
      meta(2, 'CHAPTER 01: A', 1_500, 2_500),
      meta(2, 'CHAPTER 01: A', 1_500, 2_500),
    ];
    const coverage = validateManuscriptInventory({
      chunks: broken,
      sourceCharCount: 10_000,
      expectedChunkCount: 4,
    });
    expect(coverage.complete).toBe(false);
    expect(coverage.missingChunkIndices).toEqual([1, 3]);
    expect(coverage.duplicateChunkIndices).toEqual([2]);
    expect(coverage.boundaryGaps[0]).toMatchObject({ beforeChunk: 0, afterChunk: 2, gapChars: 500 });
    expect(coverage.warnings.some((warning) => warning.includes('coverage_below_97_percent'))).toBe(
      true
    );
  });

  it('validates a complete inventory and reports 100% union coverage', () => {
    const coverage = validateManuscriptInventory({
      chunks,
      sourceCharCount: 5_000,
      expectedChunkCount: 6,
    });
    expect(coverage.complete).toBe(true);
    expect(coverage.coverageRatio).toBe(0.98);
    expect(formatCoverage(coverage)).toContain('6/6 chunks');
  });

  it('builds parts and chapter ranges with chunk references', () => {
    const structure = buildManuscriptStructure({
      chunks,
      sourceCharCount: 5_000,
      expectedChunkCount: 6,
    });
    const chapter14 = structure.chapterByKey.get('chapter:14');
    expect(chapter14).toMatchObject({
      label: 'CHAPTER 14: THE LONDON SHUTTLE',
      startChunkIndex: 2,
      endChunkIndex: 3,
      chunkCount: 2,
      part: 'PART II',
    });
    expect(structure.parts.find((part) => part.label === 'PART II')?.chapterKeys).toEqual([
      'chapter:14',
    ]);
  });

  it('resolves chapters by number, title and relative position', () => {
    const structure = buildManuscriptStructure({
      chunks,
      sourceCharCount: 5_000,
      expectedChunkCount: 6,
    });
    expect(resolveManuscriptChapter(structure, { number: 36 }).chapter?.number).toBe(36);
    expect(resolveManuscriptChapter(structure, { title: 'LONDON' }).chapter?.number).toBe(14);
    expect(
      resolveManuscriptChapter(structure, {
        relative: 'previous',
        activeChapterNumber: 36,
      }).chapter?.number
    ).toBe(14);
  });

  it('creates sequential reading windows without dropping text', () => {
    const textChunks: ManuscriptChunk[] = [
      { ...chunks[2], content: 'A'.repeat(1_300) },
      { ...chunks[3], content: 'B'.repeat(1_200) },
    ];
    const windows = buildChapterWindows({ chunks: textChunks, maxCharsPerWindow: 1_500 });
    expect(windows.length).toBe(2);
    expect(windows.map((window) => window.text.length).reduce((sum, value) => sum + value, 0)).toBe(
      2_500
    );
    expect(windows[0].chunkIds).toEqual(['chk_0002']);
    expect(windows[1].chunkIds).toEqual(['chk_0003']);
  });

  it('marks a partial inventory as incomplete rather than silently claiming full reading', () => {
    const coverage = validateManuscriptInventory({
      chunks: chunks.slice(0, 3),
      sourceCharCount: 5_000,
      expectedChunkCount: 6,
    });
    expect(coverage.complete).toBe(false);
    expect(coverage.warnings).toContain('chunk_count_mismatch:3/6');
  });
});
