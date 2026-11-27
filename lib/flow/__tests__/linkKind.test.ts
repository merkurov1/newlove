/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  flowLinkKind,
  internalFlowPath,
  isInternalFlowHref,
} from '../linkKind';

describe('Flow link kinds', () => {
  it('recognises Telegram destinations', () => {
    expect(flowLinkKind('https://t.me/unframed_am/42')).toBe('telegram');
    expect(flowLinkKind('https://www.t.me/PierrotAi_bot')).toBe('telegram');
    expect(flowLinkKind('https://telegram.me/merkurov')).toBe('telegram');
    expect(flowLinkKind('https://telegram.org/')).toBe('telegram');
  });

  it('recognises internal merkurov.love destinations', () => {
    expect(flowLinkKind('https://merkurov.love/flow/note')).toBe('internal');
    expect(flowLinkKind('https://www.merkurov.love/flow/note?x=1#top')).toBe(
      'internal'
    );
    expect(flowLinkKind('https://journal.merkurov.love/issue')).toBe('internal');
  });

  it('keeps every other destination external', () => {
    expect(flowLinkKind('https://example.com/article')).toBe('external');
    expect(flowLinkKind('https://merkurov.love.evil.example/flow')).toBe(
      'external'
    );
    expect(flowLinkKind('https://notmerkurov.love/flow')).toBe('external');
    expect(flowLinkKind('javascript:alert(1)')).toBe('external');
    expect(flowLinkKind('')).toBe('external');
    expect(flowLinkKind(null)).toBe('external');
  });

  it('returns a route only for internal links', () => {
    expect(internalFlowPath('https://www.merkurov.love/flow/note?x=1#top')).toBe(
      '/flow/note?x=1#top'
    );
    expect(internalFlowPath('https://merkurov.love/')).toBe('/');
    expect(internalFlowPath('https://t.me/unframed_am/42')).toBeNull();
    expect(internalFlowPath('https://example.com/article')).toBeNull();
  });

  it('treats relative markdown links as internal', () => {
    expect(isInternalFlowHref('/flow/note')).toBe(true);
    expect(isInternalFlowHref('https://www.merkurov.love/flow')).toBe(true);
    expect(isInternalFlowHref('//evil.example/flow')).toBe(false);
    expect(isInternalFlowHref('https://example.com/flow')).toBe(false);
  });
});
