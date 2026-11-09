/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import * as cheerio from 'cheerio';
import type { WorkspaceNavProject } from '@/lib/pierrot/workspace/navigation';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/pierrot',
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams('history=history-journal'),
}));

const WorkspaceShell = require('../WorkspaceShell')
  .default as typeof import('../WorkspaceShell').default;

const projects: WorkspaceNavProject[] = [
  {
    id: 'project-journal',
    slug: 'journal',
    name: 'Journal',
    historyId: 'history-journal',
    href: '/admin/pierrot?history=history-journal',
  },
  {
    id: 'project-heart',
    slug: 'heart-and-angel',
    name: 'Heart & Angel',
    historyId: 'history-heart',
    href: '/admin/pierrot?history=history-heart',
  },
];

describe('WorkspaceShell navigation', () => {
  it('links the mega chat and every project big chat from the menu', () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell projects={projects}>
        <div>content</div>
      </WorkspaceShell>
    );
    const $ = cheerio.load(html);

    expect($('.pw-topbar-avatar')).toHaveLength(1);
    expect(
      $('.pw-topbar-nav a')
        .map((_, node) => $(node).attr('href'))
        .get()
    ).toEqual([
      '/admin/pierrot',
      '/admin/pierrot?history=history-journal',
      '/admin/pierrot?history=history-heart',
    ]);
    expect(
      $('.pw-topbar-nav a')
        .map((_, node) => $(node).text())
        .get()
    ).toEqual(['Чат', 'Journal', 'Heart & Angel']);
    expect($('.pw-topbar-nav a[aria-current="page"]').text()).toBe('Journal');
    expect($('.pw-topbar-actions button[aria-label="Открыть память"]')).toHaveLength(1);
    expect($('.pw-topbar-actions button[aria-label="Открыть Flow"]')).toHaveLength(1);
  });

  it('does not expose public section paths or technical routes as primary navigation', () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell projects={projects}>
        <div>content</div>
      </WorkspaceShell>
    );
    const $ = cheerio.load(html);

    for (const href of [
      '/journal',
      '/heartandangel',
      '/art-engine',
      '/lobby',
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
