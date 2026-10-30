/** @jest-environment node */

import { parseMediaBulkBody, planMediaBulkInputs } from '../bulk';

describe('Media bulk planning', () => {
  it('parses textarea and array input with a hard limit', () => {
    expect(parseMediaBulkBody({ urls: 'https://a.example\nhttps://b.example' })).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(parseMediaBulkBody({ urls: ['https://a.example', 'https://b.example'] })).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(parseMediaBulkBody({ urls: 'a\nb\nc' }, 2)).toEqual(['a', 'b']);
  });

  it('deduplicates normalized URLs and reports invalid rows', () => {
    const rows = planMediaBulkInputs([
      'https://example.com/article?utm_source=feed',
      'http://example.com/article#section',
      'not a url',
      'https://example.com/other',
      'https://example.com/other',
    ]);

    expect(rows[0]).toMatchObject({
      status: 'candidate',
      normalizedUrl: 'https://example.com/article',
    });
    expect(rows[1]).toMatchObject({ status: 'duplicate_in_input' });
    expect(rows[2]).toMatchObject({ status: 'invalid' });
    expect(rows[3]).toMatchObject({
      status: 'candidate',
      normalizedUrl: 'https://example.com/other',
    });
    expect(rows[4]).toMatchObject({ status: 'duplicate_in_input' });
  });
});
