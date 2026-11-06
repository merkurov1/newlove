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
  it('keeps the Heart & Angel rail item icon-only and points it at the public World inside the shell', () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell>
        <div>content</div>
      </WorkspaceShell>
    );
    const $ = cheerio.load(html);
    const heart = $('a[href="/heartandangel/world"]');

    expect(heart).toHaveLength(1);
    expect(heart.attr('aria-label')).toBe('HEART & ANGEL');
    expect(heart.attr('class')).toContain('pw-rail-link--icon-only');
    expect(heart.find('span')).toHaveLength(0);
    expect(heart.text().trim()).toBe('');
    expect(heart.find('svg')).toHaveLength(1);
  });

  it('orders the primary workspaces before the separated utility group', () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell>
        <div>content</div>
      </WorkspaceShell>
    );
    const $ = cheerio.load(html);

    const primary = $('.pw-rail-group--primary a')
      .map((_, node) => $(node).attr('href'))
      .get();
    const bottom = $('.pw-rail-group--bottom a')
      .map((_, node) => $(node).attr('href'))
      .get();

    expect(primary).toEqual([
      '/admin/pierrot',
      '/admin/pierrot/flow',
      '/admin/pierrot/art-engine',
      '/heartandangel/world',
    ]);
    expect(bottom.slice(0, 3)).toEqual([
      '/admin/pierrot/brain',
      '/admin/pierrot/dash',
      '/admin/pierrot/dev',
    ]);
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
