/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import * as cheerio from 'cheerio';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/pierrot',
  useRouter: () => ({ push: jest.fn() }),
}));

const WorkspaceShell = require('../WorkspaceShell')
  .default as typeof import('../WorkspaceShell').default;

describe('WorkspaceShell navigation', () => {
  it('keeps the Heart & Angel rail item icon-only and linked to the same route', () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell>
        <div>content</div>
      </WorkspaceShell>
    );
    const $ = cheerio.load(html);
    const heart = $('a[href="/admin/pierrot/heart-and-angel"]');

    expect(heart).toHaveLength(1);
    expect(heart.attr('aria-label')).toBe('HEART & ANGEL');
    expect(heart.attr('class')).toContain('pw-rail-link--icon-only');
    expect(heart.find('span')).toHaveLength(0);
    expect(heart.text().trim()).toBe('');
    expect(heart.find('svg')).toHaveLength(1);
  });

  it('keeps labels on the other rail items', () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell>
        <div>content</div>
      </WorkspaceShell>
    );
    const $ = cheerio.load(html);
    const brain = $('a[href="/admin/pierrot/brain"]');

    expect(brain.find('span').text()).toContain('BRAIN');
    expect(brain.attr('class')).not.toContain('pw-rail-link--icon-only');
  });
});
