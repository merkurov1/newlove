'use client';

import { useMemo, useState } from 'react';
import type { GroomingPlanView, GroomingPlanViewProposal } from '@/lib/pierrot/grooming/types';

const GROUPS: Array<{ title: string; operations: string[] }> = [
  {
    title: 'Задачи',
    operations: [
      'create_task',
      'create_reminder',
      'complete_task',
      'merge_tasks',
      'reopen_task',
      'archive_task',
      'move_task',
      'reclassify_task',
      'update_task',
      'link_github_issue',
    ],
  },
  {
    title: 'Материалы',
    operations: ['create_artifact'],
  },
  {
    title: 'Память и Brain',
    operations: [
      'create_memory',
      'update_memory',
      'merge_memory',
      'archive_memory',
      'reclassify_memory',
    ],
  },
  {
    title: 'Проекты',
    operations: ['link_project', 'update_project_context', 'update_project_summary'],
  },
  {
    title: 'GitHub',
    operations: ['create_issue', 'update_issue', 'link_pull_request', 'sync_remote_status'],
  },
  {
    title: 'Контекст диалогов',
    operations: ['create_context_summary', 'update_context_summary', 'archive_context_reference'],
  },
];

const RISK_LABEL: Record<GroomingPlanViewProposal['risk'], string> = {
  safe: 'безопасно',
  reversible: 'обратимо',
  confirmation: 'подтвердить',
};

function sourceLabel(ref: GroomingPlanViewProposal['sourceRefs'][number]): string {
  return ref.title || ref.id || ref.url || ref.type.replace(/_/g, ' ');
}

export default function GroomingPlanCard({
  plan,
  disabled,
  onSubmit,
}: {
  plan: GroomingPlanView;
  disabled?: boolean;
  onSubmit: (command: string) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        plan.proposals
          .filter((proposal) => proposal.risk !== 'confirmation')
          .map((proposal) => proposal.ordinal)
      )
  );

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: plan.proposals.filter((proposal) => group.operations.includes(proposal.operation)),
      })).filter((group) => group.items.length > 0),
    [plan.proposals]
  );

  function toggle(ordinal: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(ordinal)) next.delete(ordinal);
      else next.add(ordinal);
      return next;
    });
  }

  return (
    <section className="pw-grooming-plan" aria-label="План изменений рабочей среды">
      <header className="pw-grooming-plan-head">
        <div>
          <span className="pw-grooming-plan-kicker">APPROVAL · {plan.scope}</span>
          <h3>План изменений</h3>
        </div>
        <span className="pw-grooming-plan-count">{plan.proposals.length} предложений</span>
      </header>

      {plan.proposals.length === 0 ? (
        <p className="pw-grooming-plan-empty">Проблем, требующих изменений, не найдено.</p>
      ) : (
        <>
          <p className="pw-grooming-plan-note">
            Ничего не изменено. Отметь нужные операции и подтверди выбранное.
          </p>
          {grouped.map((group) => (
            <div className="pw-grooming-plan-group" key={group.title}>
              <h4>{group.title}</h4>
              <ul>
                {group.items.map((proposal) => (
                  <li key={proposal.id}>
                    <label className="pw-grooming-plan-item">
                      <input
                        type="checkbox"
                        checked={selected.has(proposal.ordinal)}
                        onChange={() => toggle(proposal.ordinal)}
                        disabled={disabled}
                      />
                      <span className="pw-grooming-plan-item-body">
                        <span className="pw-grooming-plan-item-head">
                          <strong>
                            {proposal.ordinal}. {proposal.title}
                          </strong>
                          <span
                            className={`pw-grooming-plan-risk pw-grooming-plan-risk--${proposal.risk}`}
                          >
                            {RISK_LABEL[proposal.risk]}
                          </span>
                        </span>
                        <span className="pw-grooming-plan-reason">{proposal.reason}</span>
                        {proposal.projectName && (
                          <span className="pw-grooming-plan-project">{proposal.projectName}</span>
                        )}
                        {proposal.sourceRefs.length > 0 && (
                          <details
                            className="pw-grooming-plan-source"
                            open={expanded === proposal.ordinal}
                            onToggle={(event) =>
                              setExpanded(
                                (event.currentTarget as HTMLDetailsElement).open
                                  ? proposal.ordinal
                                  : null
                              )
                            }
                          >
                            <summary>Источник и ожидаемый результат</summary>
                            <p>{proposal.expectedResult}</p>
                            <ul>
                              {proposal.sourceRefs.map((ref, index) => (
                                <li key={`${proposal.id}-${index}`}>
                                  {ref.url ? (
                                    <a href={ref.url} target="_blank" rel="noopener noreferrer">
                                      {sourceLabel(ref)}
                                    </a>
                                  ) : (
                                    sourceLabel(ref)
                                  )}
                                  {ref.quote && ref.quote !== sourceLabel(ref) && (
                                    <span> — «{ref.quote.slice(0, 240)}»</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {plan.ambiguous.length > 0 && (
            <details className="pw-grooming-plan-ambiguous">
              <summary>
                Неоднозначное — не будет изменено автоматически ({plan.ambiguous.length})
              </summary>
              <ul>
                {plan.ambiguous.map((item, index) => (
                  <li key={`ambiguous-${index}`}>{item}</li>
                ))}
              </ul>
            </details>
          )}

          {plan.warnings.length > 0 && (
            <details className="pw-grooming-plan-ambiguous">
              <summary>Предупреждения ({plan.warnings.length})</summary>
              <ul>
                {plan.warnings.map((item, index) => (
                  <li key={`warning-${index}`}>{item}</li>
                ))}
              </ul>
            </details>
          )}

          <footer className="pw-grooming-plan-actions">
            <button
              type="button"
              className="pw-grooming-plan-primary"
              disabled={disabled || selected.size === 0}
              onClick={() =>
                onSubmit(
                  `подтверди ${Array.from(selected)
                    .sort((left, right) => left - right)
                    .join(',')}`
                )
              }
            >
              Подтвердить выбранное ({selected.size})
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSubmit('подтверди всё безопасное')}
            >
              Всё безопасное
            </button>
            <button type="button" disabled={disabled} onClick={() => onSubmit('подтверди всё')}>
              Весь план
            </button>
            <button
              type="button"
              className="pw-grooming-plan-reject"
              disabled={disabled}
              onClick={() => onSubmit('отклони всё')}
            >
              Отклонить всё
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
