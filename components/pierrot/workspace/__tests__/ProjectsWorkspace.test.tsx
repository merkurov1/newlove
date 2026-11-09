import React from 'react';
import { render, screen } from '@testing-library/react';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import ProjectsWorkspace from '../ProjectsWorkspace';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function project(overrides: Partial<PierrotProject>): PierrotProject {
  return {
    id: 'project-1',
    ownerUserId: 'owner',
    slug: 'journal',
    name: 'Journal',
    description: 'Еженедельный выпуск.',
    objective: '',
    status: 'active',
    priority: 0,
    ownerRating: null,
    ownerRatingUpdatedAt: null,
    conversationId: null,
    projectBrief: '',
    briefRevision: 1,
    lastActivityAt: '2026-11-09T10:00:00.000Z',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-09T10:00:00.000Z',
    ...overrides,
  };
}

describe('ProjectsWorkspace', () => {
  it('renders an editorial list where each project opens its chat', () => {
    render(
      <ProjectsWorkspace
        initialProjects={[
          project({}),
          project({ id: 'project-2', slug: 'art-engine', name: 'Art Engine' }),
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Проекты' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Journal/ })).toHaveAttribute(
      'href',
      '/admin/pierrot?project=journal'
    );
    expect(
      screen.getAllByRole('link', { name: /Art Engine/ }).some(
        (link) => link.getAttribute('href') === '/admin/pierrot?project=art-engine'
      )
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'Art Engine →' })).toHaveAttribute(
      'href',
      '/admin/pierrot/art-engine'
    );
  });

  it('does not reintroduce the removed project card grid', () => {
    const { container } = render(<ProjectsWorkspace initialProjects={[project({})]} />);

    expect(container.querySelectorAll('.pw-project-card')).toHaveLength(0);
    expect(container.querySelectorAll('.pw-project-row')).toHaveLength(1);
  });
});
