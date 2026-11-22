import { flowIssueCanonicalUrl, flowIssuePath } from '../urls';

describe('flow issue canonical URLs', () => {
  it('uses the content language, not the archive interface language', () => {
    expect(flowIssuePath('ru-issue-24', 'ru')).toBe('/flow-issues/ru-issue-24');
    expect(flowIssuePath('en-issue-16', 'en')).toBe('/en/flow-issues/en-issue-16');
    expect(flowIssuePath('unknown-lang', null)).toBe('/en/flow-issues/unknown-lang');
    expect(flowIssuePath('unknown-lang', undefined)).toBe('/en/flow-issues/unknown-lang');
  });

  it('keeps the slug intact through encoding', () => {
    const slug = 'ru-issue-24-2026-11-10-32cd7843';
    expect(decodeURIComponent(flowIssuePath(slug, 'ru').split('/').pop()!)).toBe(slug);
  });

  it('returns absolute canonical URLs on the www host', () => {
    expect(flowIssueCanonicalUrl('ru-issue-24', 'ru')).toBe(
      'https://www.merkurov.love/flow-issues/ru-issue-24'
    );
    expect(flowIssueCanonicalUrl('en-issue-16', 'en')).toBe(
      'https://www.merkurov.love/en/flow-issues/en-issue-16'
    );
  });
});
