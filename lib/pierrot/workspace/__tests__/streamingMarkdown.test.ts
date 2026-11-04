/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { stabilizeStreamingMarkdown } from '@/components/pierrot/workspace/WorkspaceMarkdown';

describe('streaming Markdown stabilization', () => {
  it('closes an unfinished fenced code block while tokens are arriving', () => {
    const partial = 'Before\n\n```ts\nconst answer = 42;';
    expect(stabilizeStreamingMarkdown(partial, true)).toBe(`${partial}\n${'```'}`);
  });

  it('does not modify a completed code block', () => {
    const complete = '```ts\nconst answer = 42;\n```';
    expect(stabilizeStreamingMarkdown(complete, true)).toBe(complete);
  });

  it('does not modify non-streaming content', () => {
    expect(stabilizeStreamingMarkdown('```ts\nconst answer = 42;', false)).toBe(
      '```ts\nconst answer = 42;'
    );
  });
});
