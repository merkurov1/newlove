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
  it('starts with chat and then exposes the editorial site sections', () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell>
        <div>content</div>
      </WorkspaceShell>
    );
    const $ = cheerio.load(html);

    expect($('.pw-topbar-avatar')).toHaveLength(1);
    expect(
      $('.pw-topbar-nav a')
        .map((_, node) => $(node).attr('href'))
        .get()
    ).toEqual(['/admin/pierrot', '/journal', '/heartandangel', '/art-engine', '/lobby']);
    expect($('.pw-topbar-actions button[aria-label="Открыть память"]')).toHaveLength(1);
    expect($('.pw-topbar-actions button[aria-label="Открыть Flow"]')).toHaveLength(1);
  });

  it('does not expose technical routes as primary navigation', () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell>
        <div>content</div>
      </WorkspaceShell>
    );
    const $ = cheerio.load(html);

    for (const href of [
      '/admin/pierrot/flow',
      '/admin/pierrot/art-engine',
      '/admin/pierrot/brain',
      '/admin/pierrot/dash',
      '/admin/pierrot/dev',
      '/admin/pierrot/projects',
      '/heartandangel/world',
    ]) {
      expect($(`a[href="${href}"]`)).toHaveLength(0);
    }
    expect($('.pw-rail')).toHaveLength(0);
  });
});
