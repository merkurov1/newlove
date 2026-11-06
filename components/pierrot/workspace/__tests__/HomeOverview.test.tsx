import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import type { BrainStatusSnapshot } from '@/lib/pierrot/memory/brainStatusTypes';
import type { WorkspaceOverview } from '@/lib/pierrot/workspace/types';
import HomeOverview from '../HomeOverview';

const overview: WorkspaceOverview = {
  period: 7,
  from: '2026-11-01T00:00:00.000Z',
  to: '2026-11-08T00:00:00.000Z',
  metrics: [
    ['users', 'Пользователи'],
    ['subscribers', 'Подписчики'],
    ['flow', 'Flow'],
    ['conversations', 'Диалоги'],
    ['media', 'Медиа'],
  ].map(([key, label]) => ({
    key: key as WorkspaceOverview['metrics'][number]['key'],
    label,
    current: 10,
    periodCount: 1,
    previousCount: 1,
    state: 'стоит' as const,
    series: [0, 0, 0, 0, 0, 0, 1],
    available: true,
  })),
  commercial: {
    ...emptyCommercialSummary('last_7_days'),
    complete: true,
    errors: [],
  },
  summary: 'Показатели держатся ровно.',
  generatedAt: '2026-11-08T00:00:00.000Z',
};

const brain: BrainStatusSnapshot = {
  state: 'stable',
  label: 'Stable',
  summary: 'Память актуальна.',
  checkedAt: '2026-11-08T00:00:00.000Z',
  stale: false,
  storageAvailable: true,
  retrievalAvailable: true,
  embeddingProviderAvailable: true,
  metrics: {
    activeRecords: 5,
    archivedRecords: 0,
    uncertainRecords: 0,
    openTasks: 0,
    overdueTasks: 0,
    staleTemporary: 0,
    conflicts: 0,
    embeddingsReady: 5,
    embeddingsPending: 0,
    embeddingsFailed: 0,
    linkedSupersessions: 0,
  },
  issues: [],
};

describe('owner home overview', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('shows one headline and exactly three compact indicators', () => {
    render(
      <HomeOverview
        overview={overview}
        brainStatus={brain}
        onBrainStatusChange={jest.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Показатели держатся ровно.'
    );
    expect(document.querySelectorAll('.pw-home-indicator')).toHaveLength(3);
    expect(screen.getByText('Память актуальна · 5 активных записей · OK')).toBeTruthy();
    expect(screen.getByText('Пока тихо')).toBeTruthy();
    expect(screen.getByText('Ровно')).toBeTruthy();
  });

  it('removes the legacy memory counter and five-row metric list', () => {
    render(
      <HomeOverview
        overview={overview}
        brainStatus={brain}
        onBrainStatusChange={jest.fn()}
      />
    );

    expect(screen.queryByText(/Сохранено ·/)).toBeNull();
    expect(screen.queryByText(/Напоминания ·/)).toBeNull();
    expect(document.querySelectorAll('.pw-status-row')).toHaveLength(0);
    expect(screen.queryByLabelText('Состояние проектов')).toBeNull();
  });

  it('opens DASH from the money indicator', () => {
    render(
      <HomeOverview
        overview={overview}
        brainStatus={brain}
        onBrainStatusChange={jest.fn()}
      />
    );

    const link = screen.getByRole('link', { name: /Деньги/ });
    expect(link).toHaveAttribute('href', '/admin/pierrot/dash');
  });

  it('still opens the existing memory detail', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ ...brain, detail: { temporalMemory: 'ok', brainRetrieval: 'ok', embeddings: 'ok' } }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <HomeOverview
        overview={overview}
        brainStatus={brain}
        onBrainStatusChange={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Память/ }));

    await waitFor(() => {
      expect(screen.getByText(/Состояние Brain/)).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/pierrot/brain-status?detail=1');
  });
});
