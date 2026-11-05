'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  DecisionObservatoryReport,
  DecisionObservatoryRun,
} from '@/lib/pierrot/observatory/types';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function confidenceStyle(label: string): string {
  switch (label) {
    case 'confirmed':
      return 'border-[#B9CBB5] bg-[#EEF4EC] text-[#3F5A3C]';
    case 'supported':
      return 'border-[#D8C9A6] bg-[#F7F2E6] text-[#6E5625]';
    case 'temporal_only':
      return 'border-[#D6D0C9] bg-[#F3F1ED] text-[#625D58]';
    default:
      return 'border-[#E3C3C3] bg-[#F8EAEA] text-[#7E0C33]';
  }
}

export default function DecisionObservatoryClient() {
  const [latest, setLatest] = useState<DecisionObservatoryRun | null>(null);
  const [runs, setRuns] = useState<DecisionObservatoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/decision-observatory', { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as {
        latest?: DecisionObservatoryRun | null;
        runs?: DecisionObservatoryRun[];
        error?: string;
      } | null;

      if (!response.ok) throw new Error(payload?.error || 'Observatory unavailable.');
      setLatest(payload?.latest ?? null);
      setRuns(payload?.runs ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Observatory unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runNow() {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/decision-observatory', { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as {
        run?: DecisionObservatoryRun;
        error?: string;
      } | null;

      if (!response.ok || !payload?.run) {
        throw new Error(payload?.error || 'Observatory run failed.');
      }

      setLatest(payload.run);
      setRuns((current) => [payload.run as DecisionObservatoryRun, ...current].slice(0, 8));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Observatory run failed.');
    } finally {
      setRunning(false);
    }
  }

  const report: DecisionObservatoryReport | null = latest?.report ?? null;

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#D9D3CD] pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#89827B]">
            Manual analysis
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#625D58]">
            One on-demand pass over stored decisions and their later status events. Nothing runs on
            page open, on a schedule or in the background. Temporal order is not treated as proof of
            cause.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={running}
          className="border border-[#990F3D] bg-[#990F3D] px-5 py-3 text-xs uppercase tracking-[0.12em] text-white transition hover:bg-[#7E0C33] disabled:opacity-50"
        >
          {running ? 'Анализ…' : 'Запустить анализ'}
        </button>
      </div>

      {error && (
        <p className="mt-5 border border-[#E3C3C3] bg-[#F8EAEA] px-4 py-3 text-sm text-[#7E0C33]">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-[#89827B]">Загружаю последний отчёт…</p>
      ) : !report ? (
        <div className="mt-8 border border-[#D9D3CD] bg-white/60 px-6 py-10">
          <p className="font-serif text-2xl text-[#211F1F]">Отчётов пока нет.</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#625D58]">
            Запустите анализ вручную. Если записей или событий недостаточно, отчёт прямо скажет об
            этом, а не будет выдумывать причинность.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-px border border-[#E5E1DC] bg-[#E5E1DC] sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Решения', report.decisionCount],
              ['События', report.eventCount],
              ['Подтверждено', report.summary.confirmed],
              ['Недостаточно данных', report.summary.insufficient],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-white px-4 py-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                  {label}
                </p>
                <p className="mt-2 font-serif text-3xl text-[#211F1F]">{value}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-[#89827B]">
            Последний запуск: {formatDate(report.generatedAt)}
          </p>

          {report.insufficientData && (
            <p className="mt-4 border border-[#D8C9A6] bg-[#F7F2E6] px-4 py-3 text-sm leading-relaxed text-[#6E5625]">
              Данных недостаточно для полноценного анализа. Ниже показаны только проверяемые
              наблюдения; отсутствие результата не считается неудачей решения.
            </p>
          )}

          <div className="mt-8 space-y-8">
            {report.observations.map((observation) => (
              <article key={observation.decisionId} className="border-t border-[#D9D3CD] pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                      {observation.kind} · {observation.status}
                      {observation.project ? ` · ${observation.project}` : ''}
                    </p>
                    <h2 className="mt-2 max-w-3xl font-serif text-2xl leading-tight text-[#211F1F]">
                      {observation.title}
                    </h2>
                  </div>
                  <span
                    className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${confidenceStyle(
                      observation.confidenceLabel
                    )}`}
                  >
                    {observation.confidenceLabel} · {observation.confidence.toFixed(2)}
                  </span>
                </div>

                <dl className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
                      Исходное предположение
                    </dt>
                    <dd className="mt-1 text-sm leading-relaxed text-[#4F4A45]">
                      {observation.assumption || 'Не записано.'}
                      {observation.assumptionSource === 'not_recorded' && (
                        <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-[#A29B94]">
                          источник: не записан
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
                      Ожидаемый результат
                    </dt>
                    <dd className="mt-1 text-sm leading-relaxed text-[#4F4A45]">
                      {observation.expectedResult}
                      <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-[#A29B94]">
                        источник: {observation.expectedSource}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
                      Наблюдаемый результат
                    </dt>
                    <dd className="mt-1 text-sm leading-relaxed text-[#4F4A45]">
                      {observation.observedResult}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
                      Причинность
                    </dt>
                    <dd className="mt-1 text-sm leading-relaxed text-[#4F4A45]">
                      Не установлена. Показана только временная связь и записанные подтверждения.
                    </dd>
                  </div>
                </dl>

                {(observation.confirmations.length > 0 || observation.discrepancies.length > 0) && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#3F5A3C]">
                        Подтверждения
                      </p>
                      <ul className="mt-1 space-y-1 text-sm text-[#4F4A45]">
                        {observation.confirmations.length === 0 ? (
                          <li className="text-[#89827B]">Нет.</li>
                        ) : (
                          observation.confirmations.map((item, index) => (
                            <li key={index}>— {item}</li>
                          ))
                        )}
                      </ul>
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#7E0C33]">
                        Расхождения
                      </p>
                      <ul className="mt-1 space-y-1 text-sm text-[#4F4A45]">
                        {observation.discrepancies.length === 0 ? (
                          <li className="text-[#89827B]">Нет записанных расхождений.</li>
                        ) : (
                          observation.discrepancies.map((item, index) => (
                            <li key={index}>— {item}</li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#89827B]">
                    Выводы, которые можно использовать
                  </p>
                  <ul className="mt-1 space-y-1 text-sm leading-relaxed text-[#4F4A45]">
                    {observation.conclusions.map((item, index) => (
                      <li key={index}>— {item}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-10 border-t border-[#D9D3CD] pt-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
              Ограничения
            </p>
            <ul className="mt-2 space-y-1 text-sm leading-relaxed text-[#625D58]">
              {report.limitations.map((item, index) => (
                <li key={index}>— {item}</li>
              ))}
            </ul>
          </div>

          {runs.length > 1 && (
            <div className="mt-8">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                История запусков
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[#625D58]">
                {runs.map((run) => (
                  <li key={run.id}>
                    {formatDate(run.generatedAt)} · решений {run.decisionCount} · событий{' '}
                    {run.eventCount}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
