import {
  CITATION_HREF_PREFIX,
  citationIndexFromHref,
  hasCitationMarkers,
  prepareCitationMarkdown,
} from '../citations';

describe('inline citations', () => {
  it('turns [1] into a citation link only when a source exists', () => {
    expect(prepareCitationMarkdown('Факт [1] и ещё [2].', 2)).toBe(
      `Факт [1](${CITATION_HREF_PREFIX}1) и ещё [2](${CITATION_HREF_PREFIX}2).`
    );
  });

  it('leaves markers outside the available source range untouched', () => {
    expect(prepareCitationMarkdown('Факт [3].', 2)).toBe('Факт [3].');
  });

  it('does not rewrite ordinary markdown links', () => {
    expect(prepareCitationMarkdown('[1](https://example.com)', 2)).toBe(
      '[1](https://example.com)'
    );
  });

  it('normalizes double brackets', () => {
    expect(prepareCitationMarkdown('Факт [[1]].', 1)).toBe(
      `Факт [1](${CITATION_HREF_PREFIX}1).`
    );
  });

  it('detects marker presence for the fallback cluster', () => {
    expect(hasCitationMarkers('Ответ без ссылок')).toBe(false);
    expect(hasCitationMarkers('Ответ [1]')).toBe(true);
    expect(hasCitationMarkers('Ответ [[2]]')).toBe(true);
  });

  it('parses only valid citation hrefs', () => {
    expect(citationIndexFromHref(`${CITATION_HREF_PREFIX}2`)).toBe(2);
    expect(citationIndexFromHref(`${CITATION_HREF_PREFIX}0`)).toBeNull();
    expect(citationIndexFromHref('https://example.com')).toBeNull();
  });
});
