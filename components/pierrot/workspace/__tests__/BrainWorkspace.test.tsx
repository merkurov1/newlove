import {
  classificationLabel,
  formatLabel,
  isSingleUrl,
  kindFromFile,
  looksLikeMultipleUrls,
} from '../BrainWorkspace';

describe('Brain ingestion source detection', () => {
  it('recognises a single URL without mistaking prose for one', () => {
    expect(isSingleUrl('https://example.com/article')).toBe(true);
    expect(isSingleUrl('  https://example.com/article\n')).toBe(true);
    expect(isSingleUrl('https://example.com/a\nhttps://example.com/b')).toBe(false);
    expect(isSingleUrl('Read https://example.com/article later')).toBe(false);
  });

  it('flags a multi-line URL batch clearly', () => {
    expect(
      looksLikeMultipleUrls('https://example.com/a\nhttps://example.com/b\nhttps://example.com/c')
    ).toBe(true);
    expect(looksLikeMultipleUrls('https://example.com/a\nSome prose')).toBe(false);
  });

  it('classifies media archive sources separately from Brain knowledge', () => {
    expect(classificationLabel('media_coverage')).toBe('Media archive');
    expect(classificationLabel('article')).toBe('Brain knowledge');
    expect(classificationLabel('pdf')).toBe('Brain knowledge');
    expect(classificationLabel('text')).toBe('Brain knowledge');
  });

  it('labels delivery formats without exposing internal metadata', () => {
    expect(formatLabel('url')).toBe('URL');
    expect(formatLabel('pdf')).toBe('PDF');
    expect(formatLabel('txt')).toBe('TXT');
    expect(formatLabel('text')).toBe('текст');
    expect(formatLabel(null)).toBe('источник');
  });

  it('infers PDF and TXT files from extension or MIME type', () => {
    expect(kindFromFile(new File(['x'], 'paper.pdf', { type: 'application/pdf' }))).toBe('pdf');
    expect(kindFromFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBe('txt');
    expect(kindFromFile(new File(['x'], 'notes.md', { type: 'text/markdown' }))).toBe('txt');
  });
});
