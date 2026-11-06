import { getProjectStatusSummary } from '../status';
import type { PierrotProjectSnapshot } from '../types';

function project(overrides: Partial<PierrotProjectSnapshot> = {}): PierrotProjectSnapshot {
  return {
    id: 'project-1',
    ownerUserId: 'owner-1',
    slug: 'project-1',
    name: 'Project',
    description: '',
    objective: '',
    status: 'active',
    priority: 0,
    ownerRating: null,
    ownerRatingUpdatedAt: null,
    projectBrief: '',
    briefRevision: 0,
    lastActivityAt: '',
    createdAt: '',
    updatedAt: '',
    decisions: [],
    tasks: [],
    conversations: [],
    knowledge: [],
    artifacts: [],
    ...overrides,
  };
}

describe('getProjectStatusSummary', () => {
  it('does not invent an active state for an empty project', () => {
    expect(getProjectStatusSummary(project()).label).toBe('Недостаточно данных');
  });

  it('uses project tasks for the active state', () => {
    expect(
      getProjectStatusSummary(
        project({ tasks: [{ id: 'task', title: 'Task', status: 'in_progress', updatedAt: '' }] })
      ).label
    ).toBe('В работе');
  });

  it('keeps paused and archived states explicit', () => {
    expect(getProjectStatusSummary(project({ status: 'paused' })).label).toBe('Приостановлен');
    expect(getProjectStatusSummary(project({ status: 'archived' })).label).toBe('Архивирован');
  });
});
