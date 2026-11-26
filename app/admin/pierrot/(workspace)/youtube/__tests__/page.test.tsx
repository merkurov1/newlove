/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/lib/serverAuth', () => ({
  requireAdmin: jest.fn(async () => ({ id: 'owner-1' })),
}));

jest.mock('@/components/youtube/YouTubeProjectWorkspace', () => ({
  __esModule: true,
  default: ({ project, notice }: { project: string; notice?: string | null }) => (
    <div data-project={project} data-notice={notice || ''} />
  ),
}));

const { default: YouTubeManagementPage } = require('../page') as {
  default: (props: { searchParams?: Record<string, string> }) => Promise<unknown>;
};

const PROJECT_SLUGS = ['art-engine', 'unframed', 'pierrot', 'heart-and-angel'];

async function renderPage(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(
    (await YouTubeManagementPage({ searchParams })) as never
  );
}

describe('Dedicated YouTube project workspace route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(PROJECT_SLUGS)('selects the %s project for the workspace', async (slug) => {
    const html = await renderPage({ project: slug });

    expect(html).toContain(`data-project="${slug}"`);
    expect(html).toContain(`/admin/pierrot/youtube?project=${slug}`);
  });

  it('keeps every project in the workspace navigation', async () => {
    const html = await renderPage({ project: 'unframed' });

    for (const slug of PROJECT_SLUGS) {
      expect(html).toContain(`/admin/pierrot/youtube?project=${slug}`);
    }
  });

  it('falls back to the Art Engine workspace for an unknown slug', async () => {
    const html = await renderPage({ project: 'not-a-project' });

    expect(html).toContain('data-project="art-engine"');
  });

  it('returns YouTube management OAuth results to the YouTube workspace notice', async () => {
    const html = await renderPage({
      project: 'pierrot',
      youtube_management: 'success',
      yt_channel: 'Pierrot channel',
    });

    expect(html).toContain('data-project="pierrot"');
    expect(html).toContain('Управление YouTube подключено');
    expect(html).toContain('Pierrot channel');
  });
});
