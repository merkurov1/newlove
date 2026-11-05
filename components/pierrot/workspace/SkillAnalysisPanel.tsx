'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Loader2, RefreshCw, ScanSearch } from 'lucide-react';
import type {
  SkillAnalysisReport,
  SkillAnalysisSourceStatus,
  SkillAnalysisProposal,
  SkillAnalysisReview,
  SkillDefinition,
  StoredSkillAnalysis,
} from '@/lib/pierrot/skills/types';
import { skillStatusLabel } from '@/lib/pierrot/skills/types';

type AnalysisResponse = {
  available: boolean;
  analysis: StoredSkillAnalysis | null;
  recent?: StoredSkillAnalysis[];
  reason?: string;
  persisted?: boolean;
  status?: string;
};

function sourceTone(source: SkillAnalysisSourceStatus): string {
  if (source.status === 'available') return 'is-available';
  if (source.status === 'partial') return 'is-partial';
  if (source.status === 'unavailable') return 'is-unavailable';
  return 'is-neutral';
}

function problemCategoryLabel(category: string): string {
  switch (category) {
    case 'repeated_without_skill':
      return 'повтор без навыка';
    case 'repeated_explanation':
      return 'повторное объяснение';
    case 'repeated_failure':
      return 'повторяющийся сбой';
    case 'missing_context':
      return 'потеря контекста';
    case 'unused_capability':
      return 'неиспользованная возможность';
    case 'skill_overlap':
      return 'пересечение навыков';
    case 'skill_incomplete':
      return 'неполный навык';
    default:
      return category.replace(/_/g, ' ');
  }
}

function sourceStatusLabel(source: SkillAnalysisSourceStatus): string {
  if (source.status === 'available') return 'доступен';
  if (source.status === 'partial') return 'частично';
  if (source.status === 'unavailable') return 'недоступен';
  return 'не используется';
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function proposalLabel(proposal: SkillAnalysisProposal): string {
  return proposal.kind === 'improve' ? 'CREATE REVISION DRAFT' : 'CREATE SKILL DRAFT';
}

function AnalysisEvidenceLinks({
  evidence,
}: {
  evidence: Array<{ id: string; label: string; href?: string | null; date?: string | null }>;
}) {
  if (evidence.length === 0) return null;

  return (
    <ul className="pw-analysis-evidence">
      {evidence.map((item) => (
        <li key={`${item.id}-${item.label.slice(0, 20)}`}>
          {item.href ? (
            <a href={item.href}>
              {item.label}
              <ArrowUpRight size={11} aria-hidden="true" />
            </a>
          ) : (
            <span>{item.label}</span>
          )}
          {item.date ? <em>{item.date.slice(0, 10)}</em> : null}
        </li>
      ))}
    </ul>
  );
}

function ReviewBlock({ review }: { review: SkillAnalysisReview }) {
  return (
    <li className="pw-analysis-review">
      <div>
        <strong>{review.name}</strong>
        <span>{skillStatusLabel(review.status)}</span>
      </div>
      <ul>
        {review.issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      <p>{review.recommendation}</p>
      <AnalysisEvidenceLinks evidence={review.evidence} />
    </li>
  );
}

export default function SkillAnalysisPanel({
  onCreateDraft,
}: {
  onCreateDraft: (
    definition: SkillDefinition,
    changelog: string,
    label: string,
    relatedSkillId?: string
  ) => void;
}) {
  const [analysis, setAnalysis] = useState<StoredSkillAnalysis | null>(null);
  const [recent, setRecent] = useState<StoredSkillAnalysis[]>([]);
  const [days, setDays] = useState(60);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/pierrot/skills/analysis', { cache: 'no-store' });
      const data = (await response.json().catch(() => null)) as AnalysisResponse | null;

      if (!response.ok || !data?.available) {
        setMigrationRequired(data?.reason === 'migration_required');
        if (data?.reason && data.reason !== 'migration_required') {
          setError('Анализ пока недоступен.');
        }
        return;
      }

      setMigrationRequired(false);
      setAnalysis(data.analysis);
      setRecent(data.recent || []);
    } catch {
      setError('Не удалось загрузить сохранённый анализ.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAnalysis() {
    setRunning(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch('/api/pierrot/skills/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      const data = (await response.json().catch(() => null)) as AnalysisResponse | null;

      if (!response.ok || !data?.available || !data.analysis) {
        setMigrationRequired(data?.reason === 'migration_required');
        setError(
          data?.reason === 'migration_required'
            ? 'Таблица анализа ещё не применена. Подготовленная миграция: migrations/2026-11-20_pierrot_skill_analyses.sql.'
            : 'Анализ не выполнен. Данные не выдаются за успешный результат.'
        );
        return;
      }

      setAnalysis(data.analysis);
      setNotice(
        data.persisted === false
          ? 'Отчёт построен, но не сохранён: примените миграцию анализа.'
          : data.status === 'failed'
            ? 'Основные источники недоступны. Отчёт сохранён как неуспешный, без имитации результата.'
            : data.status === 'partial'
              ? 'Отчёт сохранён. Часть источников была недоступна — это указано ниже.'
              : 'Анализ завершён и сохранён.'
      );
      await load();
    } catch {
      setError('Не удалось запустить анализ.');
    } finally {
      setRunning(false);
    }
  }

  const report: SkillAnalysisReport | null = analysis?.report ?? null;

  return (
    <section className="pw-analysis" aria-labelledby="pw-analysis-title">
      <div className="pw-analysis-head">
        <div>
          <p className="pw-kicker">ANALYZE MY WORK · только владелец</p>
          <h2 id="pw-analysis-title" className="pw-analysis-title">
            Что повторяется в работе?
          </h2>
          <p className="pw-analysis-lede">
            Один явный запуск по истории диалогов, памяти и Dev Mode. Отчёт сохраняется; страница не
            пересчитывает его при открытии.
          </p>
        </div>

        <div className="pw-analysis-controls">
          <label className="pw-label">
            Период
            <select
              className="pw-input pw-analysis-select"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              disabled={running}
            >
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={60}>60 дней</option>
              <option value={90}>90 дней</option>
              <option value={180}>180 дней</option>
            </select>
          </label>
          <button
            type="button"
            className="pw-button pw-button-primary"
            onClick={() => void runAnalysis()}
            disabled={running}
          >
            {running ? (
              <Loader2 size={15} className="pw-spin" aria-hidden="true" />
            ) : (
              <ScanSearch size={15} aria-hidden="true" />
            )}
            {running ? 'Анализирую…' : 'ANALYZE MY WORK'}
          </button>
          <button
            type="button"
            className="pw-button pw-button-small"
            onClick={() => void load()}
            disabled={running || loading}
            aria-label="Обновить сохранённый анализ"
          >
            <RefreshCw size={13} aria-hidden="true" />
            Обновить
          </button>
        </div>
      </div>

      {migrationRequired && (
        <div className="pw-notice pw-notice-warning" role="status">
          Сохранение анализов ещё не включено: подготовленная миграция{' '}
          <code>migrations/2026-11-20_pierrot_skill_analyses.sql</code> не применена. Отчёт можно
          построить, но он не сохранится между открытиями.
        </div>
      )}

      {error && (
        <p className="pw-notice pw-notice-warning" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="pw-notice">{notice}</p>}

      {loading && !report ? (
        <p className="pw-inspector-empty">Загружаю последний анализ…</p>
      ) : !report ? (
        <div className="pw-analysis-empty">
          <p>
            Сохранённого анализа нет. Запустите его вручную — Пьеро не анализирует работу
            автоматически при каждом сообщении.
          </p>
          {recent.length > 0 && (
            <p className="pw-kicker">
              Последний сохранённый отчёт: {dateLabel(recent[0]?.createdAt)}
            </p>
          )}
        </div>
      ) : (
        <div className="pw-analysis-report">
          <div className="pw-analysis-meta">
            <span>{dateLabel(analysis?.createdAt)}</span>
            <span>
              {dateLabel(report.periodStart)} — {dateLabel(report.periodEnd)}
            </span>
            <span className={`pw-analysis-status is-${analysis?.status || 'partial'}`}>
              {analysis?.status === 'failed'
                ? 'источники недоступны'
                : analysis?.status === 'partial'
                  ? 'частичный анализ'
                  : 'анализ завершён'}
            </span>
          </div>

          <div className="pw-analysis-sources" aria-label="Доступные источники">
            {report.sources.map((source) => (
              <span key={source.key} className={`pw-analysis-source ${sourceTone(source)}`}>
                <strong>{source.label}</strong>
                <span>{source.count}</span>
                <em>{sourceStatusLabel(source)}</em>
              </span>
            ))}
          </div>

          <p className="pw-analysis-overview">{report.overview}</p>

          <section className="pw-analysis-section" aria-labelledby="pw-analysis-procedures">
            <div className="pw-analysis-section-head">
              <h3 id="pw-analysis-procedures" className="pw-section-title">
                Обнаруженные процедуры · {report.procedures.length}
              </h3>
            </div>

            {report.procedures.length === 0 ? (
              <p className="pw-notice">
                Подтверждённых повторяемых процедур нет. Это честный результат, а не сбой.
              </p>
            ) : (
              <div className="pw-analysis-procedures">
                {report.procedures.map((procedure) => (
                  <details key={procedure.id} className="pw-analysis-procedure">
                    <summary>
                      <span>{procedure.name}</span>
                      <em>
                        {procedure.exampleCount} примеров · повторяемость {procedure.repeatability}
                      </em>
                    </summary>
                    <p>{procedure.description}</p>
                    <p className="pw-analysis-usefulness">{procedure.usefulness}</p>

                    <div className="pw-analysis-columns">
                      <div>
                        <h4>Последовательность</h4>
                        <ol>
                          {procedure.sequence.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <h4>Инструменты</h4>
                        <p>{procedure.tools.join(', ') || 'не зафиксированы'}</p>
                        {procedure.relatedSkillIds.length > 0 && (
                          <p className="pw-kicker">
                            Связанные навыки: {procedure.relatedSkillIds.length}
                          </p>
                        )}
                      </div>
                    </div>

                    <h4>Подтверждающие источники</h4>
                    <AnalysisEvidenceLinks evidence={procedure.evidence} />
                  </details>
                ))}
              </div>
            )}
          </section>

          <section className="pw-analysis-section" aria-labelledby="pw-analysis-problems">
            <h3 id="pw-analysis-problems" className="pw-section-title">
              Проблемные места · {report.problems.length}
            </h3>
            {report.problems.length === 0 ? (
              <p className="pw-notice">Повторяющихся проблем в выбранном периоде не найдено.</p>
            ) : (
              <ul className="pw-analysis-problems">
                {report.problems.map((problem) => (
                  <li key={problem.id}>
                    <strong>{problemCategoryLabel(problem.category)}</strong>
                    <p>{problem.description}</p>
                    <AnalysisEvidenceLinks evidence={problem.evidence} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pw-analysis-section" aria-labelledby="pw-analysis-proposals">
            <h3 id="pw-analysis-proposals" className="pw-section-title">
              Предложения навыков · {report.proposals.length}
            </h3>
            {report.proposals.length === 0 ? (
              <p className="pw-notice">
                Новых черновиков нет. Повторяемость без воспроизводимой процедуры не превращается в
                навык.
              </p>
            ) : (
              <div className="pw-analysis-proposals">
                {report.proposals.map((proposal) => (
                  <article key={proposal.id} className="pw-analysis-proposal">
                    <p className="pw-kicker">
                      {proposal.kind === 'improve' ? 'НОВАЯ ВЕРСИЯ' : 'НОВЫЙ НАВЫК'}
                    </p>
                    <h4>{proposal.name}</h4>
                    <p>{proposal.problem}</p>
                    <p>{proposal.howItWorks}</p>
                    <p className="pw-analysis-difference">{proposal.difference}</p>
                    {proposal.limitations.length > 0 && (
                      <ul>
                        {proposal.limitations.map((limitation) => (
                          <li key={limitation}>{limitation}</li>
                        ))}
                      </ul>
                    )}
                    <AnalysisEvidenceLinks evidence={proposal.evidence} />
                    <button
                      type="button"
                      className="pw-button pw-button-small"
                      onClick={() =>
                        onCreateDraft(
                          proposal.definition,
                          proposal.changelog,
                          proposal.kind === 'improve'
                            ? 'Черновик новой версии из анализа. Активный навык не изменён.'
                            : 'Черновик из анализа. Ничего не создано и не утверждено.',
                          proposal.relatedSkillId
                        )
                      }
                    >
                      {proposalLabel(proposal)}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          {report.skillReviews.length > 0 && (
            <section className="pw-analysis-section" aria-labelledby="pw-analysis-reviews">
              <h3 id="pw-analysis-reviews" className="pw-section-title">
                Проверка существующих навыков · {report.skillReviews.length}
              </h3>
              <ul className="pw-analysis-reviews">
                {report.skillReviews.map((review) => (
                  <ReviewBlock key={review.skillId} review={review} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
