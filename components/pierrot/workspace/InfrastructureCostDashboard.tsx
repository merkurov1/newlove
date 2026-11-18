'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CommercialSummary } from '@/lib/pierrot/commercialSummary';
import type {
  ActualStatus,
  CostAllocation,
  CostKind,
  CostLine,
  CostReport,
  DevLedgerBridge,
  SelfFunding,
} from '@/lib/infrastructure/types';
import {
  SCENARIO_LIST,
  scenarioPreset,
  scenarioToQuery,
  type Scenario,
  type ScenarioId,
} from '@/lib/infrastructure/scenarios';
import { buildCostReport } from '@/lib/infrastructure/calculator';
import { buildSelfFunding } from '@/lib/infrastructure/selfFunding';

const KIND_LABEL: Record<CostKind, string> = {
  actual: 'actual',
  'provider-reported': 'provider-reported',
  estimate: 'calculated estimate',
  manual: 'manually configured',
  unknown: 'unknown',
};

const KIND_HINT: Record<CostKind, string> = {
  actual: 'Подтверждённый факт из источника учёта.',
  'provider-reported': 'Провайдер сообщил usage; сумма может быть рассчитана по тарифу.',
  estimate: 'Воспроизводимый расчёт из публичного тарифа и допущений сценария.',
  manual: 'Значение задано вручную: план, SKU или допущение владельца.',
  unknown: 'Нет данных. Не равно нулю и не входит в итог.',
};

const ALLOCATION_LABEL: Record<CostAllocation, string> = {
  production: 'production',
  development: 'development',
  media: 'media',
};

function fmtEur(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: digits,
  }).format(value);
}

function fmtNum(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
}

function fmtNative(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 4,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function fmtDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function pct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

function KindBadge({ kind }: { kind: CostKind }) {
  return (
    <span className={`pw-infra-kind pw-infra-kind-${kind}`} title={KIND_HINT[kind]}>
      {KIND_LABEL[kind]}
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'warn' | 'unknown';
}) {
  return (
    <div className={`pw-infra-metric pw-infra-metric-${tone || 'default'}`}>
      <span className="pw-infra-metric-label">{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function ScenarioInput({
  label,
  value,
  onChange,
  min = 0,
  max = 1_000_000_000,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="pw-infra-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            const next = Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : min;
            onChange(next);
          }}
        />
        {suffix ? <em>{suffix}</em> : null}
      </div>
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="pw-infra-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function scenarioAssumptions(scenario: Scenario): string[] {
  return [
    `Нагрузка: ${fmtNum(scenario.modelRequestsPerMonth, 0)} запросов/мес, средний контекст ${fmtNum(scenario.avgContextTokens, 0)} токенов, ответ ${fmtNum(scenario.avgOutputTokens, 0)} токенов, cache hit ${pct(scenario.cacheHitShare * 100, 0)}, peak ${pct(scenario.peakShare * 100, 0)}.`,
    `Активные пользователи: ${fmtNum(scenario.activeUsers, 0)}. Это параметр сценария, а не подтверждённый MAU.`,
    `Media: фото ${fmtNum(scenario.photoStorageGb)} GB, видео ${fmtNum(scenario.videoStorageGb)} GB, image calls ${fmtNum(scenario.imageCallsPerMonth, 0)}, transcription ${fmtNum(scenario.transcriptionMinutesPerMonth, 0)} мин.`,
    `Vercel: ${fmtNum(scenario.vercelBandwidthGb)} GB transfer, ${fmtNum(scenario.vercelEdgeRequestsM)}M requests, ${fmtNum(scenario.vercelFunctionInvocationsM)}M invocations, ${fmtNum(scenario.vercelCpuHours)} CPU-h, ${fmtNum(scenario.vercelBuildMinutesPerMonth, 0)} build minutes, ${fmtNum(scenario.analyticsEventsPerMonth, 0)} analytics events.`,
    `Supabase: ${scenario.supabaseCompute} compute, ${fmtNum(scenario.dbStorageGb)} GB disk, ${fmtNum(scenario.supabaseMau, 0)} MAU.`,
    `VPS: ${scenario.vpsSku}, extra backup ${fmtNum(scenario.vpsExtraBackupGb)} GB.`,
    `Codespaces: ${scenario.codespaceMachine}, ${fmtNum(scenario.codespaceHoursPerMonth)} ч/мес, ${scenario.codespacePlan} plan. Затраты на выполнение задач из Dev Cost Ledger не добавлены повторно.`,
    `Публичные тарифы проверены 2026-11-18; FX — ECB 2026-11-17. Изменение цены создаёт новую версию тарифа.`,
  ];
}

function CostLineCard({ line }: { line: CostLine }) {
  return (
    <article className="pw-infra-line">
      <header>
        <div className="pw-infra-line-title">
          <span className="pw-infra-provider">{line.providerLabel}</span>
          <strong>{line.label}</strong>
        </div>
        <div className="pw-infra-line-money">
          <strong>{fmtEur(line.eurAmount)}</strong>
          <span>{fmtNative(line.nativeAmount, line.currency)}</span>
        </div>
      </header>
      <p className="pw-infra-line-desc">{line.description}</p>
      <div className="pw-infra-line-badges">
        <KindBadge kind={line.amountKind} />
        <span className="pw-infra-badge">{line.costClass}</span>
        <span className="pw-infra-badge">{ALLOCATION_LABEL[line.allocation]}</span>
        <span className="pw-infra-badge">{line.category}</span>
        <span className={`pw-infra-confidence pw-infra-confidence-${line.confidence}`}>
          confidence: {line.confidence}
        </span>
      </div>
      <dl className="pw-infra-line-meta">
        <div>
          <dt>Currency</dt>
          <dd>{line.currency}</dd>
        </div>
        <div>
          <dt>Billing basis</dt>
          <dd>{line.billingBasis}</dd>
        </div>
        <div>
          <dt>Usage</dt>
          <dd>
            {line.usageQuantity === null
              ? '—'
              : `${fmtNum(line.usageQuantity, 2)} ${line.usageUnit || ''}`}
          </dd>
        </div>
        <div>
          <dt>Included / overage</dt>
          <dd>
            {line.includedQuantity === null ? '—' : fmtNum(line.includedQuantity, 2)} /{' '}
            {line.overageQuantity === null ? '—' : fmtNum(line.overageQuantity, 2)}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {line.source.startsWith('http') ? (
              <a href={line.source} target="_blank" rel="noreferrer">
                {line.source.replace(/^https?:\/\//, '').split('/')[0]}
              </a>
            ) : (
              line.source
            )}
          </dd>
        </div>
        <div>
          <dt>Checked</dt>
          <dd>{fmtDate(line.checkedAt)}</dd>
        </div>
        <div>
          <dt>Pricing version</dt>
          <dd>{line.pricingVersion}</dd>
        </div>
      </dl>
      {line.unknownReason ? (
        <p className="pw-infra-line-warning">unknown: {line.unknownReason}</p>
      ) : null}
      {line.requiredPermission ? (
        <p className="pw-infra-line-permission">Потребуется доступ: {line.requiredPermission}</p>
      ) : null}
      {line.assumptions.length > 0 ? (
        <details className="pw-infra-line-details">
          <summary>Допущения ({line.assumptions.length})</summary>
          <ul>
            {line.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function ProviderTable({ report }: { report: CostReport }) {
  return (
    <div className="pw-infra-table-wrap">
      <table className="pw-infra-table">
        <thead>
          <tr>
            <th>Провайдер</th>
            <th>EUR / мес</th>
            <th>Доля</th>
            <th>Fixed / variable</th>
            <th>Production / dev / media</th>
            <th>Типы</th>
          </tr>
        </thead>
        <tbody>
          {report.summary.byProvider.map((provider) => (
            <tr key={provider.provider}>
              <td>
                <strong>{provider.providerLabel}</strong>
                {provider.unknownLines > 0 ? (
                  <small className="pw-infra-unknown-note">{provider.unknownLines} unknown</small>
                ) : null}
              </td>
              <td>{fmtEur(provider.eur)}</td>
              <td>{pct(provider.sharePct)}</td>
              <td>
                {fmtEur(provider.fixedEur)} / {fmtEur(provider.variableEur)}
              </td>
              <td>
                {fmtEur(provider.productionEur)} / {fmtEur(provider.developmentEur)} /{' '}
                {fmtEur(provider.mediaEur)}
              </td>
              <td className="pw-infra-kinds">
                {provider.kinds.map((kind) => (
                  <KindBadge key={kind} kind={kind} />
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SelfFundingCard({ selfFunding }: { selfFunding: SelfFunding }) {
  const coverage = selfFunding.coveragePct;
  return (
    <section className="pw-infra-section" aria-labelledby="pw-infra-self-funding">
      <div className="pw-infra-section-head">
        <div>
          <p className="pw-kicker">SELF-FUNDING · {selfFunding.periodLabel}</p>
          <h2 id="pw-infra-self-funding">Выручка, coverage и реинвестирование</h2>
        </div>
        <span className="pw-infra-badge">
          {fmtDate(selfFunding.periodStart)} — {fmtDate(selfFunding.periodEnd)}
        </span>
      </div>

      <div className="pw-infra-self-grid">
        <Metric
          label="Подтверждённая выручка"
          value={selfFunding.revenueEur === null ? 'неизвестно' : fmtEur(selfFunding.revenueEur)}
          sub={
            selfFunding.revenueSourcesComplete
              ? 'actual · только подтверждённые покупки/донаты'
              : selfFunding.revenueUnknownReason || 'источники неполные'
          }
          tone={selfFunding.revenueEur === null ? 'unknown' : 'default'}
        />
        <Metric
          label="Infrastructure cost"
          value={fmtEur(selfFunding.infrastructureCostEur)}
          sub={
            selfFunding.infrastructureCostComplete
              ? 'estimate/manual · все компоненты известны'
              : 'есть unknown; coverage — нижняя граница'
          }
          tone={selfFunding.infrastructureCostComplete ? 'default' : 'warn'}
        />
        <Metric
          label="Coverage"
          value={coverage === null ? '—' : pct(coverage)}
          sub={
            selfFunding.productionCoveragePct === null
              ? 'production-only coverage недоступен'
              : `production-only: ${pct(selfFunding.productionCoveragePct)}`
          }
          tone={coverage !== null && coverage >= 100 ? 'default' : 'warn'}
        />
        <Metric
          label={
            selfFunding.reinvestmentEur !== null && selfFunding.reinvestmentEur < 0
              ? 'Shortfall'
              : 'Reinvestment'
          }
          value={
            selfFunding.reinvestmentEur === null
              ? 'не рассчитывается'
              : fmtEur(Math.abs(selfFunding.reinvestmentEur))
          }
          sub={
            selfFunding.reinvestmentEur === null
              ? 'пока есть unknown или revenue неизвестна'
              : selfFunding.reinvestmentEur < 0
                ? 'выручки не хватает на известную инфраструктуру'
                : 'до налогов, эквайринга и других расходов'
          }
          tone={
            selfFunding.reinvestmentEur !== null && selfFunding.reinvestmentEur < 0
              ? 'warn'
              : 'default'
          }
        />
      </div>

      <div className="pw-infra-coverage">
        <div className="pw-infra-coverage-bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(0, coverage ?? 0))}%` }} />
        </div>
        <div className="pw-infra-coverage-caption">
          <span>
            Предыдущий период:{' '}
            {selfFunding.previousRevenueEur === null
              ? 'неизвестно'
              : fmtEur(selfFunding.previousRevenueEur)}
          </span>
          <span>
            Δ:{' '}
            {selfFunding.revenueDeltaEur === null
              ? '—'
              : `${selfFunding.revenueDeltaEur >= 0 ? '+' : ''}${fmtEur(selfFunding.revenueDeltaEur)}`}{' '}
            {selfFunding.revenueDeltaPct === null
              ? ''
              : `(${selfFunding.revenueDeltaPct >= 0 ? '+' : ''}${pct(selfFunding.revenueDeltaPct)})`}
          </span>
          <span>Flow-подписок: {selfFunding.subscriptionCount}</span>
        </div>
      </div>

      <div className="pw-infra-milestones">
        <span className="pw-kicker">Следующий milestone</span>
        <strong>
          {selfFunding.nextMilestone
            ? `€${selfFunding.nextMilestone.targetEur} / мес · осталось ${fmtEur(selfFunding.nextMilestone.remainingEur)}`
            : 'Все milestone €50 / €100 / €200 / €500 достигнуты'}
        </strong>
        <div className="pw-infra-milestone-list">
          {selfFunding.milestones.map((milestone) => (
            <span
              key={milestone.targetEur}
              className={`pw-infra-milestone ${milestone.reached ? 'is-reached' : ''}`}
            >
              €{milestone.targetEur}
            </span>
          ))}
        </div>
      </div>

      <ul className="pw-infra-notes">
        {selfFunding.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}

function ActualsPanel({ actuals }: { actuals: ActualStatus[] }) {
  return (
    <section className="pw-infra-section" aria-labelledby="pw-infra-actuals">
      <div className="pw-infra-section-head">
        <div>
          <p className="pw-kicker">FORECAST VS ACTUAL</p>
          <h2 id="pw-infra-actuals">Доступные billing / usage API</h2>
        </div>
      </div>
      <p className="pw-infra-section-intro">
        Фактические суммы счетов показываются только там, где источник их реально отдаёт. Отсутствие
        интеграции — это unknown, а не €0.
      </p>
      <div className="pw-infra-table-wrap">
        <table className="pw-infra-table">
          <thead>
            <tr>
              <th>Провайдер</th>
              <th>Статус</th>
              <th>Фактическая сумма</th>
              <th>Usage / причина</th>
              <th>Что нужно</th>
            </tr>
          </thead>
          <tbody>
            {actuals.map((actual) => (
              <tr key={actual.provider}>
                <td>
                  <strong>{actual.providerLabel}</strong>
                  <small>{actual.source}</small>
                </td>
                <td>
                  <span className={`pw-infra-status pw-infra-status-${actual.status}`}>
                    {actual.status}
                  </span>
                </td>
                <td>{actual.actualChargeEur === null ? '—' : fmtEur(actual.actualChargeEur)}</td>
                <td>
                  {actual.usageSummary ? <p>{actual.usageSummary}</p> : null}
                  <p>{actual.reason || '—'}</p>
                </td>
                <td>{actual.requiredPermission || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DevLedgerPanel({ devBridge }: { devBridge: DevLedgerBridge }) {
  return (
    <section className="pw-infra-section" aria-labelledby="pw-infra-dev-ledger">
      <div className="pw-infra-section-head">
        <div>
          <p className="pw-kicker">DEV COST LEDGER · BRIDGE</p>
          <h2 id="pw-infra-dev-ledger">Разработка не дублируется</h2>
        </div>
        <span
          className={`pw-infra-status ${devBridge.available ? 'pw-infra-status-provider-reported' : 'pw-infra-status-unavailable'}`}
        >
          {devBridge.available ? 'connected' : 'unavailable'}
        </span>
      </div>
      <p className="pw-infra-section-intro">{devBridge.note}</p>
      <div className="pw-infra-self-grid pw-infra-self-grid-3">
        <Metric
          label="Ledger actual (estimated)"
          value={devBridge.actualEstimatedEur === null ? '—' : fmtEur(devBridge.actualEstimatedEur)}
          sub={
            devBridge.actualEstimatedUsd === null
              ? 'USD unavailable'
              : `${fmtNative(devBridge.actualEstimatedUsd, 'USD')} за ${devBridge.periodDays} дн.`
          }
        />
        <Metric
          label="Pre-queue estimate"
          value={devBridge.expectedUsd === null ? '—' : fmtNative(devBridge.expectedUsd, 'USD')}
          sub="ожидаемая стоимость задач"
        />
        <Metric
          label="Variance"
          value={devBridge.varianceUsd === null ? '—' : fmtNative(devBridge.varianceUsd, 'USD')}
          sub={devBridge.variancePct === null ? 'unknown' : pct(devBridge.variancePct)}
          tone={devBridge.varianceUsd !== null && devBridge.varianceUsd > 0 ? 'warn' : 'default'}
        />
      </div>
      <ul className="pw-infra-notes">
        <li>
          Сумма Dev Cost Ledger не добавлена к monthly run rate: она пересекается с
          Codespaces-линией.
        </li>
        <li>Попыток без полной стоимости: {devBridge.attemptsMissingCost}.</li>
        {devBridge.unknown.map((item) => (
          <li key={item}>unknown: {item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function InfrastructureCostDashboard({
  initialReport,
  actuals,
  commercial,
  devBridge,
}: {
  initialReport: CostReport;
  actuals: ActualStatus[];
  commercial: CommercialSummary;
  devBridge: DevLedgerBridge;
}) {
  const pathname = usePathname() || '/admin/pierrot/infrastructure';
  const [scenario, setScenario] = useState<Scenario>(initialReport.scenario);
  const rates = initialReport.fx;

  const report = useMemo(() => buildCostReport({ scenario, rates }), [scenario, rates]);
  const rateMap = useMemo(
    () => ({
      EUR: rates.find((rate) => rate.currency === 'EUR')!,
      USD: rates.find((rate) => rate.currency === 'USD')!,
      CHF: rates.find((rate) => rate.currency === 'CHF')!,
      GBP: rates.find((rate) => rate.currency === 'GBP')!,
    }),
    [rates]
  );
  const selfFunding = useMemo(
    () =>
      buildSelfFunding({
        summary: commercial,
        infrastructureCostEur: report.summary.monthlyKnownEur,
        infrastructureCostComplete: report.summary.complete,
        productionCostEur: report.summary.byAllocation.production,
        rates: rateMap,
      }),
    [commercial, rateMap, report]
  );

  useEffect(() => {
    const query = scenarioToQuery(scenario, 'url');
    const url = query ? `${pathname}?${query}` : pathname;
    window.history.replaceState(null, '', url);
  }, [scenario, pathname]);

  function updateNumber(key: keyof Scenario, value: number) {
    setScenario((current) => ({
      ...current,
      [key]: value,
      id: 'custom',
      label: 'Custom',
    }));
  }

  function updateText(key: keyof Scenario, value: string) {
    setScenario((current) => ({
      ...current,
      [key]: value,
      id: 'custom',
      label: 'Custom',
    }));
  }

  function applyPreset(id: ScenarioId) {
    setScenario(scenarioPreset(id));
  }

  const grouped = useMemo(() => {
    const map = new Map<string, CostLine[]>();
    for (const line of report.lines) {
      const bucket = map.get(line.providerLabel) || [];
      bucket.push(line);
      map.set(line.providerLabel, bucket);
    }
    return [...map.entries()];
  }, [report.lines]);

  const sources = useMemo(() => {
    const map = new Map<string, { source: string; checkedAt: string; version: string }>();
    for (const line of report.lines) {
      map.set(`${line.source}|${line.pricingVersion}`, {
        source: line.source,
        checkedAt: line.checkedAt,
        version: line.pricingVersion,
      });
    }
    return [...map.values()];
  }, [report.lines]);

  const knownMonthly = report.summary.monthlyKnownEur;
  const incomplete = !report.summary.complete;

  return (
    <div className="pw-page pw-infra">
      <div className="pw-infra-inner">
        <header className="pw-infra-head">
          <div>
            <p className="pw-kicker">PIERROT · INFRASTRUCTURE</p>
            <h1>Стоимость эксплуатации</h1>
            <p className="pw-infra-subtitle">
              Recurring production infrastructure, сценарии и Self-Funding. Это не стоимость
              разработки задач и не факт счёта, если источник не подтверждён.
            </p>
            <p className="pw-infra-audit">
              Prices checked 2026-11-18 · FX ECB 2026-11-17 · {report.lines.length} cost lines ·{' '}
              {report.summary.unknownLineCount} unknown
            </p>
          </div>
          <Link className="pw-infra-back" href="/admin/pierrot/dash">
            ← DASH
          </Link>
        </header>

        <div className={`pw-infra-budget pw-infra-budget-${report.budget.status}`}>
          <strong>{report.budget.message}</strong>
          <span>
            Budget €{fmtNum(report.scenario.budgetEur, 0)} · warning at{' '}
            {fmtNum(report.scenario.warnAtPct, 0)}%
          </span>
        </div>

        <section className="pw-infra-metrics" aria-label="Ключевые суммы">
          <Metric
            label={incomplete ? 'Monthly run rate · известная часть' : 'Monthly run rate'}
            value={fmtEur(knownMonthly)}
            sub={`${report.summary.knownLineCount} из ${report.summary.lineCount} строк известны`}
            tone={incomplete ? 'warn' : 'default'}
          />
          <Metric
            label={incomplete ? 'Annual projection · минимум' : 'Annual projection'}
            value={fmtEur(report.summary.annualKnownEur)}
            sub="recurring × 12 + one-off"
            tone={incomplete ? 'warn' : 'default'}
          />
          <Metric
            label="Unknown"
            value={`${report.summary.unknownLineCount} компонент(ов)`}
            sub="не приравнены к нулю"
            tone={report.summary.unknownLineCount > 0 ? 'unknown' : 'default'}
          />
          <Metric
            label="Fixed / variable"
            value={`${fmtEur(report.summary.fixedEur, 0)} / ${fmtEur(report.summary.variableEur, 0)}`}
            sub={`overage: ${fmtEur(report.summary.overageEur)}`}
          />
          <Metric
            label="Production / dev / media"
            value={`${fmtEur(report.summary.byAllocation.production, 0)} / ${fmtEur(report.summary.byAllocation.development, 0)} / ${fmtEur(report.summary.byAllocation.media, 0)}`}
            sub="аллокация общих fixed-хостов раскрыта в строках"
          />
        </section>

        <section className="pw-infra-section" aria-labelledby="pw-infra-scenario">
          <div className="pw-infra-section-head">
            <div>
              <p className="pw-kicker">SCENARIO</p>
              <h2 id="pw-infra-scenario">Lean / Comfortable / Intensive</h2>
            </div>
            <div className="pw-infra-presets" role="group" aria-label="Сценарий">
              {SCENARIO_LIST.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={scenario.id === preset.id ? 'is-active' : ''}
                  onClick={() => applyPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
              <span className="pw-infra-preset-current">{scenario.label}</span>
            </div>
          </div>

          <div className="pw-infra-form">
            <fieldset>
              <legend>Нагрузка и AI</legend>
              <ScenarioInput
                label="Активные пользователи"
                value={scenario.activeUsers}
                onChange={(value) => updateNumber('activeUsers', value)}
                max={1_000_000}
              />
              <ScenarioInput
                label="Запросов к моделям / мес"
                value={scenario.modelRequestsPerMonth}
                onChange={(value) => updateNumber('modelRequestsPerMonth', value)}
                max={100_000_000}
              />
              <ScenarioInput
                label="Средний контекст, токены"
                value={scenario.avgContextTokens}
                onChange={(value) => updateNumber('avgContextTokens', value)}
                max={2_000_000}
              />
              <ScenarioInput
                label="Средний ответ, токены"
                value={scenario.avgOutputTokens}
                onChange={(value) => updateNumber('avgOutputTokens', value)}
                max={400_000}
              />
              <ScenarioInput
                label="Cache hit"
                value={Math.round(scenario.cacheHitShare * 100)}
                onChange={(value) => updateNumber('cacheHitShare', value / 100)}
                min={0}
                max={100}
                suffix="%"
              />
              <ScenarioInput
                label="Peak hours"
                value={Math.round(scenario.peakShare * 100)}
                onChange={(value) => updateNumber('peakShare', value / 100)}
                min={0}
                max={100}
                suffix="%"
              />
              <ScenarioInput
                label="Image calls / мес"
                value={scenario.imageCallsPerMonth}
                onChange={(value) => updateNumber('imageCallsPerMonth', value)}
                max={10_000_000}
              />
              <ScenarioInput
                label="Transcription, мин / мес"
                value={scenario.transcriptionMinutesPerMonth}
                onChange={(value) => updateNumber('transcriptionMinutesPerMonth', value)}
                max={10_000_000}
              />
              <ScenarioInput
                label="Embeddings, M tokens"
                value={scenario.embeddingTokensPerMonth / 1_000_000}
                onChange={(value) => updateNumber('embeddingTokensPerMonth', value * 1_000_000)}
                step={0.1}
              />
            </fieldset>

            <fieldset>
              <legend>Media и egress</legend>
              <ScenarioInput
                label="Фото, GB"
                value={scenario.photoStorageGb}
                onChange={(value) => updateNumber('photoStorageGb', value)}
              />
              <ScenarioInput
                label="Видео, GB"
                value={scenario.videoStorageGb}
                onChange={(value) => updateNumber('videoStorageGb', value)}
              />
              <ScenarioInput
                label="Production egress, GB"
                value={scenario.egressGb}
                onChange={(value) => updateNumber('egressGb', value)}
              />
              <ScenarioInput
                label="Media egress, GB"
                value={scenario.mediaEgressGb}
                onChange={(value) => updateNumber('mediaEgressGb', value)}
              />
              <ScenarioInput
                label="Image transforms, K"
                value={scenario.vercelImageTransformsK}
                onChange={(value) => updateNumber('vercelImageTransformsK', value)}
                step={0.1}
              />
              <ScenarioInput
                label="Analytics events / мес"
                value={scenario.analyticsEventsPerMonth}
                onChange={(value) => updateNumber('analyticsEventsPerMonth', value)}
              />
            </fieldset>

            <fieldset>
              <legend>Vercel и Supabase</legend>
              <ScenarioInput
                label="Vercel bandwidth, GB"
                value={scenario.vercelBandwidthGb}
                onChange={(value) => updateNumber('vercelBandwidthGb', value)}
              />
              <ScenarioInput
                label="Edge requests, M"
                value={scenario.vercelEdgeRequestsM}
                onChange={(value) => updateNumber('vercelEdgeRequestsM', value)}
                step={0.1}
              />
              <ScenarioInput
                label="Function invocations, M"
                value={scenario.vercelFunctionInvocationsM}
                onChange={(value) => updateNumber('vercelFunctionInvocationsM', value)}
                step={0.1}
              />
              <ScenarioInput
                label="Active CPU, hours"
                value={scenario.vercelCpuHours}
                onChange={(value) => updateNumber('vercelCpuHours', value)}
              />
              <ScenarioInput
                label="Build minutes / мес"
                value={scenario.vercelBuildMinutesPerMonth}
                onChange={(value) => updateNumber('vercelBuildMinutesPerMonth', value)}
              />
              <ScenarioInput
                label="Database disk, GB"
                value={scenario.dbStorageGb}
                onChange={(value) => updateNumber('dbStorageGb', value)}
              />
              <ScenarioInput
                label="MAU"
                value={scenario.supabaseMau}
                onChange={(value) => updateNumber('supabaseMau', value)}
              />
              <ScenarioInput
                label="Supabase edge, M"
                value={scenario.supabaseEdgeInvocationsM}
                onChange={(value) => updateNumber('supabaseEdgeInvocationsM', value)}
                step={0.1}
              />
              <SelectField
                label="Supabase compute"
                value={scenario.supabaseCompute}
                onChange={(value) => updateText('supabaseCompute', value)}
                options={[
                  { value: 'micro', label: 'Micro · $10' },
                  { value: 'small', label: 'Small · $15' },
                  { value: 'medium', label: 'Medium · $60' },
                ]}
              />
            </fieldset>

            <fieldset>
              <legend>VPS и Codespaces</legend>
              <SelectField
                label="VPS SKU"
                value={scenario.vpsSku}
                onChange={(value) => updateText('vpsSku', value)}
                options={[
                  { value: 'vpsLite1', label: 'VPS Lite 1 · CHF 2.70' },
                  { value: 'vpsLite3', label: 'VPS Lite 3 · CHF 7.20' },
                  { value: 'vpsCloudEntry', label: 'VPS Cloud entry · CHF 38.41' },
                ]}
              />
              <ScenarioInput
                label="VPS backup, GB"
                value={scenario.vpsExtraBackupGb}
                onChange={(value) => updateNumber('vpsExtraBackupGb', value)}
              />
              <SelectField
                label="Codespaces machine"
                value={scenario.codespaceMachine}
                onChange={(value) => updateText('codespaceMachine', value)}
                options={[
                  { value: 'basicLinux32gb', label: '2-core' },
                  { value: 'standardLinux32gb', label: '4-core' },
                  { value: 'premiumLinux', label: '8-core' },
                  { value: 'largePremiumLinux', label: '16-core' },
                ]}
              />
              <ScenarioInput
                label="Codespaces, ч / мес"
                value={scenario.codespaceHoursPerMonth}
                onChange={(value) => updateNumber('codespaceHoursPerMonth', value)}
                max={744}
              />
              <ScenarioInput
                label="Codespaces storage, GB"
                value={scenario.codespaceStorageGb}
                onChange={(value) => updateNumber('codespaceStorageGb', value)}
              />
              <SelectField
                label="GitHub plan"
                value={scenario.codespacePlan}
                onChange={(value) => updateText('codespacePlan', value)}
                options={[
                  { value: 'free', label: 'Free · 120 core-h' },
                  { value: 'pro', label: 'Pro · 180 core-h' },
                ]}
              />
            </fieldset>

            <fieldset>
              <legend>Email и бюджет</legend>
              <SelectField
                label="Resend plan"
                value={scenario.emailPlan}
                onChange={(value) => updateText('emailPlan', value)}
                options={[
                  { value: 'free', label: 'Free · 3,000' },
                  { value: 'pro', label: 'Pro · 50,000' },
                ]}
              />
              <ScenarioInput
                label="Emails / мес"
                value={scenario.emailCountPerMonth}
                onChange={(value) => updateNumber('emailCountPerMonth', value)}
              />
              <ScenarioInput
                label="Budget, € / мес"
                value={scenario.budgetEur}
                onChange={(value) => updateNumber('budgetEur', value)}
              />
              <ScenarioInput
                label="Warning at"
                value={scenario.warnAtPct}
                onChange={(value) => updateNumber('warnAtPct', value)}
                min={1}
                max={100}
                suffix="%"
              />
            </fieldset>
          </div>

          <div className="pw-infra-form-actions">
            <button
              type="button"
              onClick={() => {
                const query = scenarioToQuery(scenario, 'link');
                const url = `${window.location.origin}${pathname}${query ? `?${query}` : ''}`;
                void navigator.clipboard?.writeText(url);
              }}
            >
              Скопировать ссылку сценария
            </button>
            <span>Параметры закодированы в URL, поэтому сценарий воспроизводим.</span>
          </div>
        </section>

        <section className="pw-infra-section" aria-labelledby="pw-infra-breakdown">
          <div className="pw-infra-section-head">
            <div>
              <p className="pw-kicker">BREAKDOWN</p>
              <h2 id="pw-infra-breakdown">Провайдеры, категории и типы</h2>
            </div>
            <span className="pw-infra-badge">monthly · EUR</span>
          </div>

          <ProviderTable report={report} />

          <div className="pw-infra-split-grid">
            <div>
              <h3>По категориям</h3>
              <ul className="pw-infra-bars">
                {report.summary.byCategory.map((category) => {
                  const max = report.summary.byCategory[0]?.eur || 1;
                  return (
                    <li key={category.category}>
                      <span>{category.category}</span>
                      <div>
                        <i style={{ width: `${Math.min(100, (category.eur / max) * 100)}%` }} />
                      </div>
                      <strong>{fmtEur(category.eur)}</strong>
                      {category.unknownLines > 0 ? <em>{category.unknownLines} unknown</em> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3>Тип значения</h3>
              <ul className="pw-infra-kinds-list">
                {(
                  ['actual', 'provider-reported', 'estimate', 'manual', 'unknown'] as CostKind[]
                ).map((kind) => (
                  <li key={kind}>
                    <KindBadge kind={kind} />
                    <strong>
                      {kind === 'unknown'
                        ? `${report.summary.unknownLineCount} строк`
                        : fmtEur(report.summary.byKind[kind])}
                    </strong>
                  </li>
                ))}
              </ul>
              <p className="pw-infra-hint">
                Actual и estimate не складываются в одну «фактическую» цифру. Unknown показывается
                отдельно и не входит в run rate.
              </p>
            </div>
          </div>
        </section>

        <SelfFundingCard selfFunding={selfFunding} />

        <section className="pw-infra-section" aria-labelledby="pw-infra-lines">
          <div className="pw-infra-section-head">
            <div>
              <p className="pw-kicker">COST LINES</p>
              <h2 id="pw-infra-lines">Все строки с источником и типом</h2>
            </div>
            <span className="pw-infra-badge">{report.lines.length} строк</span>
          </div>
          <div className="pw-infra-groups">
            {grouped.map(([providerLabel, lines]) => (
              <div key={providerLabel} className="pw-infra-group">
                <h3>{providerLabel}</h3>
                {lines.map((line) => (
                  <CostLineCard key={line.id} line={line} />
                ))}
              </div>
            ))}
          </div>
        </section>

        <ActualsPanel actuals={actuals} />
        <DevLedgerPanel devBridge={devBridge} />

        <section className="pw-infra-section" aria-labelledby="pw-infra-unknown">
          <div className="pw-infra-section-head">
            <div>
              <p className="pw-kicker">UNKNOWN</p>
              <h2 id="pw-infra-unknown">Что неизвестно и почему</h2>
            </div>
          </div>
          {report.summary.unknown.length === 0 ? (
            <p className="pw-infra-section-intro">
              В этом сценарии все строки имеют известное значение или явно включённую квоту.
            </p>
          ) : (
            <ul className="pw-infra-unknown-list">
              {report.summary.unknown.map((item) => (
                <li key={item.lineId}>
                  <strong>{item.providerLabel}</strong> · {item.label}
                  <p>{item.reason}</p>
                  {item.requiredPermission ? (
                    <small>Потребуется: {item.requiredPermission}</small>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pw-infra-section" aria-labelledby="pw-infra-assumptions">
          <div className="pw-infra-section-head">
            <div>
              <p className="pw-kicker">ASSUMPTIONS & SOURCES</p>
              <h2 id="pw-infra-assumptions">Допущения и проверенные источники</h2>
            </div>
          </div>
          <div className="pw-infra-assumption-grid">
            <div>
              <h3>Сценарий</h3>
              <ul className="pw-infra-notes">
                {scenarioAssumptions(scenario).map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>FX</h3>
              <ul className="pw-infra-notes">
                {report.fx.map((rate) => (
                  <li key={rate.currency}>
                    {rate.currency}: 1 {rate.currency} = {rate.eurPerUnit.toFixed(4)} EUR ·
                    проверено {fmtDate(rate.checkedAt)} · {rate.source}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Тарифы</h3>
              <ul className="pw-infra-notes">
                {sources.map((source) => (
                  <li key={`${source.source}-${source.version}`}>
                    {source.source.startsWith('http') ? (
                      <a href={source.source} target="_blank" rel="noreferrer">
                        {source.source}
                      </a>
                    ) : (
                      source.source
                    )}{' '}
                    · {source.version} · {fmtDate(source.checkedAt)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
