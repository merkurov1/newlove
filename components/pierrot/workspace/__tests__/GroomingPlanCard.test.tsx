import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GroomingPlanCard from '../GroomingPlanCard';
import type { GroomingPlanView } from '@/lib/pierrot/grooming/types';

const plan: GroomingPlanView = {
  auditId: 'audit-1',
  scope: 'all',
  warnings: ['GitHub read unavailable'],
  ambiguous: ['Task requires manual verification'],
  proposals: [
    {
      id: 'p1',
      ordinal: 1,
      operation: 'create_context_summary',
      title: 'Create summary',
      reason: 'Conversation volume reached the threshold.',
      expectedResult: 'Summary version created; messages stay intact.',
      risk: 'safe',
      projectName: null,
      sourceRefs: [
        {
          type: 'context_summary',
          id: 'conv-1',
          title: 'Conversation',
          url: null,
          quote: null,
          createdAt: null,
          metadata: null,
        },
      ],
    },
    {
      id: 'p2',
      ordinal: 2,
      operation: 'archive_task',
      title: 'Archive stale task',
      reason: 'Task is stale.',
      expectedResult: 'Task is archived and recoverable.',
      risk: 'confirmation',
      projectName: 'Journal',
      sourceRefs: [],
    },
  ],
};

describe('GroomingPlanCard', () => {
  it('preselects safe operations and submits selected ordinals', () => {
    const onSubmit = jest.fn();
    render(<GroomingPlanCard plan={plan} onSubmit={onSubmit} />);

    const safe = screen.getByRole('checkbox', {
      name: /Create summary/,
    }) as HTMLInputElement;
    const confirmation = screen.getByRole('checkbox', {
      name: /Archive stale task/,
    }) as HTMLInputElement;
    expect(safe.checked).toBe(true);
    expect(confirmation.checked).toBe(false);

    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole('button', { name: /Подтвердить выбранное \(2\)/ }));
    expect(onSubmit).toHaveBeenCalledWith('подтверди 1,2');
  });

  it('supports safe/all/reject batch actions and exposes sources', () => {
    const onSubmit = jest.fn();
    render(<GroomingPlanCard plan={plan} onSubmit={onSubmit} />);

    expect(screen.getByText('Conversation')).toBeInTheDocument();
    expect(screen.getByText(/Неоднозначное/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Всё безопасное' }));
    fireEvent.click(screen.getByRole('button', { name: 'Весь план' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отклонить всё' }));
    expect(onSubmit.mock.calls.map((call) => call[0])).toEqual([
      'подтверди всё безопасное',
      'подтверди всё',
      'отклони всё',
    ]);
  });
});
