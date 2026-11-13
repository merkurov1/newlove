/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { isAllowedPierrotImageUrl, safePierrotImageUrl } from '../images';
import { parsePierrotResponse } from '../schema';
import { PIERROT_RESPONSE_VERSION } from '../types';

describe('Pierrot response schema', () => {
  it('accepts a simple text block', () => {
    const parsed = parsePierrotResponse({
      version: PIERROT_RESPONSE_VERSION,
      language: 'ru',
      blocks: [{ type: 'text', markdown: 'Короткий ответ.' }],
    });

    expect(parsed?.blocks).toHaveLength(1);
    expect(parsed?.blocks[0]).toMatchObject({ type: 'text' });
  });

  it('strips unknown fields instead of passing them to the renderer', () => {
    const parsed = parsePierrotResponse({
      version: PIERROT_RESPONSE_VERSION,
      blocks: [
        {
          type: 'metric',
          metrics: [{ label: 'Подписчики', value: 33, onClick: 'alert(1)' }],
          dangerouslySetInnerHTML: { __html: '<script>alert(1)</script>' },
        },
      ],
    });

    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toContain('onClick');
    expect(JSON.stringify(parsed)).not.toContain('dangerouslySetInnerHTML');
    expect(JSON.stringify(parsed)).not.toContain('alert(1)');
  });

  it('rejects an unsupported version and malformed blocks', () => {
    expect(
      parsePierrotResponse({
        version: 999,
        blocks: [{ type: 'text', markdown: 'x' }],
      })
    ).toBeNull();

    expect(
      parsePierrotResponse({
        version: PIERROT_RESPONSE_VERSION,
        blocks: [{ type: 'chart', data: [], xKey: 'x', series: [] }],
      })
    ).toBeNull();

    expect(
      parsePierrotResponse({
        version: PIERROT_RESPONSE_VERSION,
        blocks: [],
      })
    ).toBeNull();
  });

  it('accepts valid empty chart and table datasets without inventing values', () => {
    const chart = parsePierrotResponse({
      version: PIERROT_RESPONSE_VERSION,
      blocks: [
        {
          type: 'chart',
          chart: 'bar',
          title: 'Empty',
          data: [],
          xKey: 'x',
          series: [{ key: 'value', label: 'Value' }],
        },
      ],
    });
    const table = parsePierrotResponse({
      version: PIERROT_RESPONSE_VERSION,
      blocks: [
        {
          type: 'table',
          title: 'Empty',
          columns: [{ key: 'name', label: 'Name' }],
          rows: [],
        },
      ],
    });

    expect(chart).not.toBeNull();
    expect(table).not.toBeNull();
  });

  it('accepts partial rows and rejects invalid numeric chart values', () => {
    const partial = parsePierrotResponse({
      version: PIERROT_RESPONSE_VERSION,
      blocks: [
        {
          type: 'chart',
          chart: 'line',
          data: [{ day: 'Mon', value: 3 }, { day: 'Tue', value: null }],
          xKey: 'day',
          series: [{ key: 'value', label: 'Value' }],
        },
      ],
    });
    expect(partial).not.toBeNull();

    const malformed = parsePierrotResponse({
      version: PIERROT_RESPONSE_VERSION,
      blocks: [
        {
          type: 'chart',
          chart: 'line',
          data: [{ day: 'Mon', value: Number.POSITIVE_INFINITY }],
          xKey: 'day',
          series: [{ key: 'value', label: 'Value' }],
        },
      ],
    });
    expect(malformed).toBeNull();
  });

  it('rejects diagram edges that reference missing nodes', () => {
    expect(
      parsePierrotResponse({
        version: PIERROT_RESPONSE_VERSION,
        blocks: [
          {
            type: 'diagram',
            diagram: 'flow',
            nodes: [{ id: 'a', label: 'A' }],
            edges: [{ from: 'a', to: 'missing' }],
          },
        ],
      })
    ).toBeNull();
  });

  it('limits oversized collections', () => {
    const metrics = Array.from({ length: 13 }, (_, index) => ({
      label: `Metric ${index}`,
      value: index,
    }));

    expect(
      parsePierrotResponse({
        version: PIERROT_RESPONSE_VERSION,
        blocks: [{ type: 'metric', metrics }],
      })
    ).toBeNull();
  });
});

describe('verified image policy', () => {
  it('allows same-origin and configured editorial hosts only', () => {
    expect(isAllowedPierrotImageUrl('/images/work.jpg')).toBe(true);
    expect(isAllowedPierrotImageUrl('https://merkurov.love/images/work.jpg')).toBe(true);
    expect(isAllowedPierrotImageUrl('https://tracking.example/pixel.gif')).toBe(false);
    expect(isAllowedPierrotImageUrl('//tracking.example/pixel.gif')).toBe(false);
    expect(isAllowedPierrotImageUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedPierrotImageUrl('data:image/png;base64,abc')).toBe(false);
    expect(safePierrotImageUrl('https://tracking.example/pixel.gif')).toBeNull();
  });
});
