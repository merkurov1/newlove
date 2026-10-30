import Link from 'next/link';

import {
  loadObservatorySnapshot,
  parseObservatoryFilters,
  type ObservatoryEditorialTopic,
  type ObservatoryMetric,
  type ObservatoryOfferMetrics,
} from '@/lib/analytics/observatory';
import {
  loadConversationExplorer,
  loadOfferEvents,
  loadRetrievalFailures,
  loadTopicDrilldown,
  type ConversationExplorerFilters,
  type DrilldownKind,
} from '@/lib/analytics/observatoryDrilldown';
import { requireAdmin } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-GB');
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function Delta({ metric }: { metric: ObservatoryMetric }) {
  if (metric.previous === null) return null;

  if (metric.deltaPercent === null) {
    return (
      <span className="font-mono text-[10px] text-[#A29B94]">
        prev {formatNumber(metric.previous)}
      </span>
    );
  }

  const positive = metric.deltaPercent > 0;
  const negative = metric.deltaPercent < 0;

  return (
    <span
      className={[
        'font-mono text-[10px]',
        positive ? 'text-[#4F6B4D]' : negative ? 'text-[#8B1E3F]' : 'text-[#89827B]',
      ].join(' ')}
    >
      {positive ? '+' : ''}
      {metric.deltaPercent.toFixed(1)}% · prev {formatNumber(metric.previous)}
    </span>
  );
}

function Metric({
  label,
  metric,
  href,
  detail,
  showComparison = true,
}: {
  label: string;
  metric: ObservatoryMetric;
  href?: string;
  detail?: string;
  showComparison?: boolean;
}) {
  const body = (
    <>
      <p className="text-xs text-[#746D66]">{label}</p>
      <p className="mt-2 font-serif text-3xl text-[#211F1F]">{formatNumber(metric.value)}</p>
      {showComparison && (
        <div className="mt-1">
          <Delta metric={metric} />
        </div>
      )}
      {detail && <p className="mt-1 text-[11px] leading-relaxed text-[#89827B]">{detail}</p>}
    </>
  );

  return (
    <div className="border-t border-[#D9D3CD] py-4">
      {href ? (
        <Link href={href} className="group block">
          <div className="transition group-hover:text-[#8B1E3F]">{body}</div>
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string | number;
  detail?: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">{label}</p>
      <p className="mt-2 font-serif text-2xl text-[#211F1F]">
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
      {detail && <p className="mt-1 text-[11px] leading-relaxed text-[#89827B]">{detail}</p>}
    </>
  );

  return (
    <div className="border border-[#E5E1DC] bg-white/70 p-4">
      {href ? (
        <Link href={href} className="block transition hover:border-[#990F3D]/40">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

function Section({
  title,
  kicker,
  description,
  children,
}: {
  title: string;
  kicker: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[#D9D3CD] pt-5">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#990F3D]">{kicker}</p>
      <h2 className="mt-1 font-serif text-2xl text-[#211F1F]">{title}</h2>
      {description && (
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#746D66]">{description}</p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BarList({
  rows,
  empty,
}: {
  rows: Array<{ label: string; value: number; href?: string; note?: string }>;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[#89827B]">{empty}</p>;
  }

  const max = Math.max(1, ...rows.map((row) => row.value));

  return (
    <ol className="space-y-3">
      {rows.map((row) => (
        <li key={`${row.label}-${row.value}`}>
          <div className="flex items-baseline justify-between gap-4 text-xs">
            {row.href ? (
              <Link
                href={row.href}
                className="truncate text-[#3E3A36] transition hover:text-[#8B1E3F]"
              >
                {row.label}
              </Link>
            ) : (
              <span className="truncate text-[#3E3A36]">{row.label}</span>
            )}
            <span className="shrink-0 font-mono text-[10px] text-[#746D66]">
              {formatNumber(row.value)}
              {row.note ? ` · ${row.note}` : ''}
            </span>
          </div>
          <div className="mt-1 h-1 bg-[#EEE9E4]">
            <div
              className="h-full bg-[#990F3D]"
              style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function OfferFunnel({ offers }: { offers: ObservatoryOfferMetrics[] }) {
  const stages: Array<{ key: keyof ObservatoryOfferMetrics; label: string }> = [
    { key: 'interestedConversations', label: 'Interest' },
    { key: 'eligibleConversations', label: 'Eligible' },
    { key: 'shownConversations', label: 'Shown' },
    { key: 'viewedConversations', label: 'Viewed' },
    { key: 'selectedConversations', label: 'Selected' },
    { key: 'clickedConversations', label: 'Action clicked' },
    { key: 'checkoutConversations', label: 'Checkout' },
    { key: 'purchasedConversations', label: 'Purchased' },
  ];

  return (
    <div className="space-y-5">
      {offers.map((offer) => (
        <div key={offer.offerId} className="border border-[#E5E1DC] bg-white/70 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
              {offer.offerId}
            </h3>
            <Link
              href={`/admin/observatory?section=offers&offer=${encodeURIComponent(offer.offerId)}`}
              className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8B1E3F] hover:underline"
            >
              Inspect events →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {stages.map((stage) => (
              <div key={stage.key}>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#A29B94]">
                  {stage.label}
                </p>
                <p className="mt-1 font-serif text-xl text-[#211F1F]">
                  {formatNumber(offer[stage.key] as number)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EditorialRadar({ topics }: { topics: ObservatoryEditorialTopic[] }) {
  if (topics.length === 0) {
    return (
      <p className="text-sm text-[#89827B]">No recurring unanswered questions in this period.</p>
    );
  }

  return (
    <div className="divide-y divide-[#E5E1DC] border-y border-[#E5E1DC]">
      {topics.map((topic) => (
        <article key={topic.topic} className="py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-serif text-lg text-[#211F1F]">{topic.topic}</h3>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#746D66]">
              {topic.occurrences} occurrence{topic.occurrences === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#746D66]">Routes: {topic.routes.join(', ') || '—'}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#625D58]">{topic.opportunity}</p>
          <Link
            href={`/admin/observatory?section=topics&topic=${encodeURIComponent(topic.topic)}`}
            className="mt-2 inline-block font-mono text-[9px] uppercase tracking-[0.14em] text-[#8B1E3F] hover:underline"
          >
            Supporting conversations →
          </Link>
        </article>
      ))}
    </div>
  );
}

function PresetLink({
  preset,
  active,
  label,
  params,
}: {
  preset: string;
  active: boolean;
  label: string;
  params: Record<string, string | undefined>;
}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  search.set('preset', preset);

  return (
    <Link
      href={`/admin/observatory?${search.toString()}`}
      aria-current={active ? 'page' : undefined}
      className={[
        'border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition',
        active
          ? 'border-[#990F3D] bg-[#F8EAF0] text-[#8B1E3F]'
          : 'border-[#D9D3CD] text-[#746D66] hover:border-[#990F3D] hover:text-[#8B1E3F]',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

function FilterBar({
  filters,
  extra,
}: {
  filters: ReturnType<typeof parseObservatoryFilters>;
  extra?: Record<string, string | undefined>;
}) {
  const shared = {
    ...extra,
    language: filters.language,
    compare: filters.compare ? '1' : '0',
  };

  const compareSearch = new URLSearchParams();
  for (const [key, value] of Object.entries(extra ?? {})) if (value) compareSearch.set(key, value);
  compareSearch.set('preset', filters.preset);
  compareSearch.set('from', filters.from);
  compareSearch.set('to', filters.to);
  if (filters.language) compareSearch.set('language', filters.language);
  compareSearch.set('compare', filters.compare ? '0' : '1');

  return (
    <div className="flex flex-col gap-4 border-y border-[#E5E1DC] py-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <PresetLink
          preset="today"
          active={filters.preset === 'today'}
          label="Today"
          params={shared}
        />
        <PresetLink preset="7d" active={filters.preset === '7d'} label="7 days" params={shared} />
        <PresetLink
          preset="30d"
          active={filters.preset === '30d'}
          label="30 days"
          params={shared}
        />
        <PresetLink
          preset="90d"
          active={filters.preset === '90d'}
          label="90 days"
          params={shared}
        />
        <Link
          href={`/admin/observatory?${compareSearch.toString()}`}
          className="border border-[#D9D3CD] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#746D66] transition hover:border-[#990F3D] hover:text-[#8B1E3F]"
        >
          Compare: {filters.compare ? 'on' : 'off'}
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        {Object.entries(extra ?? {}).map(([key, value]) =>
          value ? <input key={key} type="hidden" name={key} value={value} /> : null
        )}
        <input type="hidden" name="preset" value="custom" />
        <input type="hidden" name="compare" value={filters.compare ? '1' : '0'} />
        <label className="text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          From
          <input
            name="from"
            type="date"
            defaultValue={filters.from.slice(0, 10)}
            className="mt-1 block border border-[#D9D3CD] bg-white px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          To
          <input
            name="to"
            type="date"
            defaultValue={filters.to.slice(0, 10)}
            className="mt-1 block border border-[#D9D3CD] bg-white px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          Language
          <select
            name="language"
            defaultValue={filters.language ?? ''}
            className="mt-1 block border border-[#D9D3CD] bg-white px-2 py-1.5 text-xs"
          >
            <option value="">All</option>
            <option value="ru">RU</option>
            <option value="en">EN</option>
            <option value="und">Undetermined</option>
          </select>
        </label>
        <button
          type="submit"
          className="border border-[#990F3D] bg-[#990F3D] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white"
        >
          Apply
        </button>
      </form>
    </div>
  );
}

const SECTIONS: Array<{ key: DrilldownKind; label: string }> = [
  { key: 'conversations', label: 'Conversation explorer' },
  { key: 'offers', label: 'Offer events' },
  { key: 'retrieval', label: 'Retrieval failures' },
  { key: 'topics', label: 'Editorial radar' },
];

function sectionHref(
  key: DrilldownKind,
  filters: ReturnType<typeof parseObservatoryFilters>,
  extra?: Record<string, string | undefined>
) {
  const search = new URLSearchParams();
  search.set('section', key);
  search.set('preset', filters.preset);
  search.set('from', filters.from);
  search.set('to', filters.to);
  search.set('compare', filters.compare ? '1' : '0');
  if (filters.language) search.set('language', filters.language);
  for (const [name, value] of Object.entries(extra ?? {})) if (value) search.set(name, value);
  return `/admin/observatory?${search.toString()}`;
}

function ConversationExplorer({
  filters,
  query,
}: {
  filters: ReturnType<typeof parseObservatoryFilters>;
  query: SearchParams;
}) {
  const page = Number(one(query, 'page') ?? '1');
  const explorerFilters: ConversationExplorerFilters = {
    from: filters.from,
    to: filters.to,
    language: one(query, 'f_language') || undefined,
    route: one(query, 'f_route') || undefined,
    intent: one(query, 'f_intent') || undefined,
    product: one(query, 'f_product') || undefined,
    status: one(query, 'f_status') || undefined,
    retrieval: (['success', 'failure', 'none'] as const).find(
      (value) => value === one(query, 'f_retrieval')
    ),
    q: one(query, 'f_q') || undefined,
    page: Number.isFinite(page) ? page : 1,
  };

  return (
    <div className="space-y-5">
      <form
        method="get"
        className="grid gap-2 border border-[#E5E1DC] bg-white/70 p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input type="hidden" name="section" value="conversations" />
        <input type="hidden" name="preset" value={filters.preset} />
        <input type="hidden" name="from" value={filters.from} />
        <input type="hidden" name="to" value={filters.to} />
        <input type="hidden" name="compare" value={filters.compare ? '1' : '0'} />
        <label className="text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          Search transcript
          <input
            name="f_q"
            defaultValue={explorerFilters.q ?? ''}
            placeholder="Question contains…"
            className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          Language
          <input
            name="f_language"
            defaultValue={explorerFilters.language ?? ''}
            className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          Route
          <input
            name="f_route"
            defaultValue={explorerFilters.route ?? ''}
            className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          Intent
          <input
            name="f_intent"
            defaultValue={explorerFilters.intent ?? ''}
            className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          Product interest
          <input
            name="f_product"
            defaultValue={explorerFilters.product ?? ''}
            className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          Status
          <input
            name="f_status"
            defaultValue={explorerFilters.status ?? ''}
            className="mt-1 block w-full border border-[#D9D3CD] px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-[9px] uppercase tracking-[0.14em] text-[#746D66]">
          Retrieval
          <select
            name="f_retrieval"
            defaultValue={explorerFilters.retrieval ?? ''}
            className="mt-1 block w-full border border-[#D9D3CD] bg-white px-2 py-1.5 text-xs"
          >
            <option value="">Any</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="none">No retrieval</option>
          </select>
        </label>
        <button
          type="submit"
          className="self-end border border-[#990F3D] bg-[#990F3D] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white"
        >
          Filter
        </button>
      </form>

      <ExplorerTable filters={filters} query={query} explorerFilters={explorerFilters} />
    </div>
  );
}

async function ExplorerTable({
  filters,
  query,
  explorerFilters,
}: {
  filters: ReturnType<typeof parseObservatoryFilters>;
  query: SearchParams;
  explorerFilters: ConversationExplorerFilters;
}) {
  const result = await loadConversationExplorer(explorerFilters);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#746D66]">
        {formatNumber(result.total)} conversations · page {result.page} of {pages}
      </p>

      <div className="overflow-x-auto border border-[#E5E1DC]">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="bg-[#F4F0EB] font-mono text-[9px] uppercase tracking-[0.12em] text-[#746D66]">
            <tr>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Route</th>
              <th className="px-3 py-2">Lang</th>
              <th className="px-3 py-2">Intent</th>
              <th className="px-3 py-2">Products</th>
              <th className="px-3 py-2">Msgs</th>
              <th className="px-3 py-2">Retrieval</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDE8E2]">
            {result.rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/pierrot?conversation=${encodeURIComponent(row.id)}`}
                    className="text-[#8B1E3F] hover:underline"
                  >
                    {formatDate(row.startedAt)}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-[#625D58]">{row.route}</td>
                <td className="px-3 py-2.5 uppercase text-[#625D58]">{row.language}</td>
                <td className="px-3 py-2.5 font-mono text-[10px] text-[#625D58]">
                  {row.latestIntent ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-[#625D58]">{row.products.join(', ') || '—'}</td>
                <td className="px-3 py-2.5 text-[#625D58]">{row.messageCount}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={
                      row.retrieval === 'failure'
                        ? 'text-[#8B1E3F]'
                        : row.retrieval === 'success'
                          ? 'text-[#4F6B4D]'
                          : 'text-[#A29B94]'
                    }
                  >
                    {row.retrieval}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[#625D58]">{row.status}</td>
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-[#89827B]">
                  No conversations match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager filters={filters} query={query} page={result.page} pages={pages} />
    </div>
  );
}

function Pager({
  filters,
  query,
  page,
  pages,
}: {
  filters: ReturnType<typeof parseObservatoryFilters>;
  query: SearchParams;
  page: number;
  pages: number;
}) {
  if (pages <= 1) return null;

  const build = (target: number) => {
    const search = new URLSearchParams();
    search.set('section', 'conversations');
    search.set('preset', filters.preset);
    search.set('from', filters.from);
    search.set('to', filters.to);
    search.set('compare', filters.compare ? '1' : '0');
    if (filters.language) search.set('language', filters.language);
    for (const key of [
      'f_q',
      'f_language',
      'f_route',
      'f_intent',
      'f_product',
      'f_status',
      'f_retrieval',
    ]) {
      const value = one(query, key);
      if (value) search.set(key, value);
    }
    search.set('page', String(target));
    return `/admin/observatory?${search.toString()}`;
  };

  return (
    <div className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link
          href={build(page - 1)}
          className="border border-[#D9D3CD] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#746D66] hover:border-[#990F3D]"
        >
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      {page < pages ? (
        <Link
          href={build(page + 1)}
          className="border border-[#D9D3CD] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#746D66] hover:border-[#990F3D]"
        >
          Next →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

async function OfferDrilldown({
  filters,
  offer,
}: {
  filters: ReturnType<typeof parseObservatoryFilters>;
  offer?: string;
}) {
  const events = await loadOfferEvents(filters.from, filters.to, offer);
  const filtered = events;

  return (
    <div className="space-y-3">
      {offer && (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#746D66]">
          Offer: {offer}
        </p>
      )}
      <div className="overflow-x-auto border border-[#E5E1DC]">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-[#F4F0EB] font-mono text-[9px] uppercase tracking-[0.12em] text-[#746D66]">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Offer</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Conversation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDE8E2]">
            {filtered.slice(0, 200).map((event, index) => (
              <tr key={`${event.conversationId}-${index}-${event.createdAt}`}>
                <td className="px-3 py-2.5 text-[#625D58]">{formatDate(event.createdAt)}</td>
                <td className="px-3 py-2.5 font-mono text-[10px] text-[#211F1F]">
                  {event.eventName}
                </td>
                <td className="px-3 py-2.5 text-[#625D58]">{event.offerId ?? '—'}</td>
                <td className="px-3 py-2.5 text-[#746D66]">{event.reason ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/pierrot?conversation=${encodeURIComponent(event.conversationId)}`}
                    className="font-mono text-[10px] text-[#8B1E3F] hover:underline"
                  >
                    {event.conversationId.slice(-10)}
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[#89827B]">
                  No offer events in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function RetrievalDrilldown({
  filters,
}: {
  filters: ReturnType<typeof parseObservatoryFilters>;
}) {
  const failures = await loadRetrievalFailures(filters.from, filters.to);

  if (failures.length === 0) {
    return <p className="text-sm text-[#89827B]">No retrieval failures in this period.</p>;
  }

  return (
    <div className="divide-y divide-[#E5E1DC] border-y border-[#E5E1DC]">
      {failures.map((failure, index) => (
        <article key={`${failure.conversationId}-${failure.createdAt}-${index}`} className="py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B1E3F]">
              {failure.outcome ?? 'unknown'} · {failure.code ?? 'no code'}
            </p>
            <span className="font-mono text-[10px] text-[#A29B94]">
              {formatDate(failure.createdAt)}
            </span>
          </div>
          {failure.question && (
            <p className="mt-2 font-serif text-base leading-relaxed text-[#211F1F]">
              “{failure.question}”
            </p>
          )}
          {failure.query && failure.query !== failure.question && (
            <p className="mt-1 text-xs text-[#746D66]">Normalized query: {failure.query}</p>
          )}
          <p className="mt-1 font-mono text-[10px] text-[#746D66]">
            trace: method={failure.method ?? '—'} · candidates=
            {formatNumber(failure.candidateCount)} · top similarity=
            {failure.topSimilarity === null ? '—' : failure.topSimilarity.toFixed(3)}
            {failure.queryHash ? ` · query ${failure.queryHash}` : ''}
          </p>
          {failure.ranking.length > 0 && (
            <ul className="mt-2 space-y-1">
              {failure.ranking.map((entry) => (
                <li
                  key={`${entry.documentId}-${entry.combinedScore ?? 'x'}`}
                  className="font-mono text-[10px] text-[#625D58]"
                >
                  {entry.documentId}
                  {entry.sourceClass ? ` · ${entry.sourceClass}` : ''}
                  {entry.combinedScore === null ? '' : ` · score ${entry.combinedScore.toFixed(3)}`}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-[#89827B]">
            <Link
              href={`/admin/pierrot?conversation=${encodeURIComponent(failure.conversationId)}`}
              className="font-mono uppercase tracking-[0.12em] text-[#8B1E3F] hover:underline"
            >
              Open conversation →
            </Link>
            {failure.documentIds.length > 0 && (
              <span>documents: {failure.documentIds.join(', ')}</span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

async function TopicDrilldown({
  filters,
  selected,
}: {
  filters: ReturnType<typeof parseObservatoryFilters>;
  selected?: string;
}) {
  const topics = await loadTopicDrilldown(filters.from, filters.to);
  const topic = selected ? topics.find((entry) => entry.topic === selected) : undefined;

  if (topic) {
    return (
      <div className="space-y-5">
        <Link
          href={sectionHref('topics', filters)}
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8B1E3F] hover:underline"
        >
          ← All topics
        </Link>
        <div>
          <h3 className="font-serif text-xl text-[#211F1F]">{topic.topic}</h3>
          <p className="mt-1 text-xs text-[#746D66]">
            Routes: {topic.routes.join(', ') || '—'} · Documents:{' '}
            {topic.documentIds.join(', ') || '—'}
          </p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#A29B94]">
            Supporting questions
          </p>
          <ul className="mt-2 space-y-2">
            {topic.questions.map((question) => (
              <li key={question} className="border-l border-[#E7C9D2] pl-3 text-sm text-[#3E3A36]">
                {question}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#A29B94]">
            Conversations
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {topic.conversationIds.map((id) => (
              <li key={id}>
                <Link
                  href={`/admin/pierrot?conversation=${encodeURIComponent(id)}`}
                  className="border border-[#E5E1DC] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#746D66] hover:border-[#990F3D] hover:text-[#8B1E3F]"
                >
                  {id.slice(-10)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <p className="text-sm text-[#89827B]">No clustered unanswered questions in this period.</p>
    );
  }

  return (
    <div className="divide-y divide-[#E5E1DC] border-y border-[#E5E1DC]">
      {topics.map((entry) => (
        <article key={entry.topic} className="py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link
              href={sectionHref('topics', filters, { topic: entry.topic })}
              className="font-serif text-lg text-[#211F1F] hover:text-[#8B1E3F]"
            >
              {entry.topic}
            </Link>
            <span className="font-mono text-[10px] text-[#746D66]">
              {entry.occurrences} occurrence{entry.occurrences === 1 ? '' : 's'}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#746D66]">
            {entry.routes.join(', ') || '—'} · {entry.documentIds.length} retrieved documents
          </p>
        </article>
      ))}
    </div>
  );
}

function Drilldown({
  section,
  filters,
  query,
}: {
  section: DrilldownKind;
  filters: ReturnType<typeof parseObservatoryFilters>;
  query: SearchParams;
}) {
  const title = SECTIONS.find((entry) => entry.key === section)?.label ?? 'Drill-down';

  return (
    <section className="border border-[#E5E1DC] bg-[#FBF9F6] p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#990F3D]">
            Drill-down
          </p>
          <h2 className="mt-1 font-serif text-2xl text-[#211F1F]">{title}</h2>
        </div>
        <Link
          href={`/admin/observatory?${new URLSearchParams({
            preset: filters.preset,
            from: filters.from,
            to: filters.to,
            compare: filters.compare ? '1' : '0',
            ...(filters.language ? { language: filters.language } : {}),
          }).toString()}`}
          className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#746D66] hover:text-[#8B1E3F]"
        >
          Close ✕
        </Link>
      </div>

      <div className="mt-5">
        {section === 'conversations' && <ConversationExplorer filters={filters} query={query} />}
        {section === 'offers' && <OfferDrilldown filters={filters} offer={one(query, 'offer')} />}
        {section === 'retrieval' && <RetrievalDrilldown filters={filters} />}
        {section === 'topics' && (
          <TopicDrilldown filters={filters} selected={one(query, 'topic')} />
        )}
      </div>
    </section>
  );
}

export default async function ObservatoryPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdmin();

  const query = searchParams ?? {};
  const filters = parseObservatoryFilters(query);
  const snapshot = await loadObservatorySnapshot(filters);
  const sectionRaw = one(query, 'section');
  const section = SECTIONS.find((entry) => entry.key === sectionRaw)?.key;

  const languageLabel = filters.language ? filters.language.toUpperCase() : 'All languages';
  const periodLabel = `${formatDay(snapshot.period.from)} → ${formatDay(snapshot.period.to)}`;

  return (
    <div className="space-y-8 pb-16">
      <header>
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-[#990F3D]">
          Merkurov Observatory
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-[-0.02em] text-[#211F1F] sm:text-5xl">
          Intelligence, without theatre.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#746D66]">
          Owner-only view of Pierrot conversations, interest, commerce and retrieval quality. Every
          number is computed from Supabase records for the selected period.
        </p>
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#A29B94]">
          {periodLabel} · {languageLabel} · generated {formatDate(snapshot.generatedAt)}
        </p>
      </header>

      <FilterBar filters={filters} extra={section ? { section } : undefined} />

      {section && <Drilldown section={section} filters={filters} query={query} />}

      <Section
        kicker="01 — Overview"
        title="Conversation volume"
        description="Conversations and messages are counted from pierrot_conversations and pierrot_messages. Returning sessions are sessions that started more than one conversation; they are not verified unique visitors."
      >
        <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Conversations today"
            metric={{
              value: snapshot.overview.conversationsToday,
              previous: null,
              deltaPercent: null,
            }}
            href={sectionHref('conversations', filters, { preset: 'today' })}
          />
          <Metric
            label="Conversations this week"
            metric={{
              value: snapshot.overview.conversationsThisWeek,
              previous: null,
              deltaPercent: null,
            }}
          />
          <Metric
            label="Conversations this month"
            metric={{
              value: snapshot.overview.conversationsThisMonth,
              previous: null,
              deltaPercent: null,
            }}
          />
          <Metric
            label="Total conversations in period"
            metric={snapshot.overview.totalConversations}
            href={sectionHref('conversations', filters)}
            showComparison={filters.compare}
          />
          <Metric
            label="Total messages"
            metric={snapshot.overview.totalMessages}
            showComparison={filters.compare}
          />
          <Metric
            label="Average messages / conversation"
            metric={snapshot.overview.averageMessagesPerConversation}
            showComparison={filters.compare}
          />
          <Metric
            label="Active conversations"
            metric={{
              value: snapshot.overview.activeConversations,
              previous: null,
              deltaPercent: null,
            }}
            href={sectionHref('conversations', filters, { f_status: 'active' })}
          />
          <Metric
            label="Returning sessions"
            metric={{
              value: snapshot.overview.returningSessions,
              previous: null,
              deltaPercent: null,
            }}
            detail={`${formatNumber(snapshot.overview.returningConversations)} conversations in returning sessions`}
          />
        </div>
      </Section>

      <Section
        kicker="02 — Interest"
        title="What visitors ask about"
        description="Topics are derived from classified intents that include a topic label. Destinations are navigation and action events. Source pages are conversation entry pages."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#A29B94]">
              Most discussed topics
            </h3>
            <div className="mt-3">
              <BarList
                rows={snapshot.interest.topTopics.map((topic) => ({
                  label: topic.topic,
                  value: topic.eventCount,
                  note: `${topic.conversationCount} conv.`,
                  href: sectionHref('conversations', filters, { f_intent: topic.topic }),
                }))}
                empty="No classified topics in this period."
              />
            </div>
          </div>
          <div>
            <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#A29B94]">
              Intent distribution
            </h3>
            <div className="mt-3">
              <BarList
                rows={snapshot.interest.intentDistribution.map((intent) => ({
                  label: intent.intent,
                  value: intent.conversationCount,
                  href: sectionHref('conversations', filters, { f_intent: intent.intent }),
                }))}
                empty="No classified intents in this period."
              />
            </div>
          </div>
          <div>
            <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#A29B94]">
              Navigation destinations
            </h3>
            <div className="mt-3">
              <BarList
                rows={snapshot.interest.destinations.map((destination) => ({
                  label: destination.sectionId,
                  value: destination.eventCount,
                  note: `${destination.conversationCount} conv.`,
                }))}
                empty="No navigation events in this period."
              />
            </div>
          </div>
          <div>
            <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#A29B94]">
              Popular source pages
            </h3>
            <div className="mt-3">
              <BarList
                rows={snapshot.interest.sourcePages.map((page) => ({
                  label: page.route,
                  value: page.conversationCount,
                }))}
                empty="No conversations in this period."
              />
            </div>
          </div>
          <div>
            <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#A29B94]">
              Language distribution
            </h3>
            <div className="mt-3">
              <BarList
                rows={snapshot.interest.languages.map((language) => ({
                  label: language.language.toUpperCase(),
                  value: language.conversationCount,
                }))}
                empty="No conversations in this period."
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        kicker="03 — Commercial"
        title="Offer funnel"
        description="Commercial stages are counted per conversation. A CTA click or checkout start is never treated as a purchase. Confirmed purchases come from trusted payment handlers and deduplicated legacy events."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Offers shown"
            value={snapshot.commercial.offersShown}
            href={sectionHref('offers', filters)}
          />
          <Stat
            label="Offers selected"
            value={snapshot.commercial.offersSelected}
            href={sectionHref('offers', filters)}
          />
          <Stat
            label="Checkout starts"
            value={snapshot.commercial.checkoutStarts}
            href={sectionHref('offers', filters)}
          />
          <Stat
            label="Confirmed purchases"
            value={snapshot.commercial.confirmedPurchases}
            href={sectionHref('offers', filters)}
          />
          <Stat
            label="Funnel abandonment"
            value={snapshot.commercial.funnelAbandonment}
            detail="Checkout starts without a confirmed purchase in the same period."
          />
          <Stat
            label="Abandonment rate"
            value={formatPercent(snapshot.commercial.abandonmentRate)}
            detail="Abandonment ÷ checkout starts. Not a conversion rate."
          />
          <Stat label="Art service inquiries" value={snapshot.commercial.serviceInquiries} />
          <Stat
            label="Qualified inquiries"
            value={snapshot.commercial.serviceInquiriesQualified}
            detail="Leads whose status is no longer new."
          />
        </div>

        <div className="mt-6">
          <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#A29B94]">
            Per-product funnel
          </h3>
          <div className="mt-3">
            <OfferFunnel offers={snapshot.commercial.offers} />
          </div>
        </div>
      </Section>

      <Section
        kicker="04 — Intelligence"
        title="Quality and gaps"
        description="Failures are observable retrieval outcomes, not guesses. Unanswered questions are user messages with no following assistant reply after five minutes. The editorial radar clusters these questions."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Unknown intents"
            value={snapshot.intelligence.unknownIntents}
            href={sectionHref('conversations', filters, { f_intent: 'unknown' })}
          />
          <Stat
            label="Uncertain intents"
            value={snapshot.intelligence.uncertainIntents}
            href={sectionHref('conversations', filters, { f_intent: 'uncertain' })}
          />
          <Stat
            label="Retrieval failures"
            value={snapshot.intelligence.retrievalFailures}
            detail={formatPercent(snapshot.intelligence.retrievalFailureRate)}
            href={sectionHref('retrieval', filters)}
          />
          <Stat
            label="Questions without answers"
            value={snapshot.intelligence.unansweredQuestions}
            href={sectionHref('topics', filters)}
          />
          <Stat
            label="Negative feedback"
            value={snapshot.intelligence.negativeFeedback}
            detail="Thumbs-down answer feedback."
          />
          <Stat
            label="Assistant failures"
            value={snapshot.intelligence.assistantFailures}
            detail="assistant_failed events."
          />
          <Stat
            label="Average response latency"
            value={
              snapshot.intelligence.averageResponseLatencyMs === null
                ? '—'
                : `${formatNumber(snapshot.intelligence.averageResponseLatencyMs)} ms`
            }
            detail="Where assistant_replied includes latency_ms."
          />
          <Stat
            label="Documents retrieved"
            value={snapshot.intelligence.topDocuments.length}
            detail="Distinct document ids in retrieval events."
          />
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#A29B94]">
              Documents most frequently retrieved
            </h3>
            <div className="mt-3">
              <BarList
                rows={snapshot.intelligence.topDocuments.map((document) => ({
                  label: document.documentId,
                  value: document.retrievalCount,
                }))}
                empty="No retrieval documents in this period."
              />
            </div>
          </div>
          <div>
            <h3 className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#A29B94]">
              Editorial radar · topics requiring content
            </h3>
            <div className="mt-3">
              <EditorialRadar topics={snapshot.intelligence.editorialRadar} />
            </div>
          </div>
        </div>
      </Section>

      <Section
        kicker="05 — Explorer"
        title="Recent conversations"
        description="A bounded recent view. Open the full explorer for filters, transcript search and pagination."
      >
        <div className="overflow-x-auto border border-[#E5E1DC]">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-[#F4F0EB] font-mono text-[9px] uppercase tracking-[0.12em] text-[#746D66]">
              <tr>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Route</th>
                <th className="px-3 py-2">Lang</th>
                <th className="px-3 py-2">Intent</th>
                <th className="px-3 py-2">Msgs</th>
                <th className="px-3 py-2">Retrieval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE8E2]">
              {snapshot.conversations.slice(0, 10).map((conversation) => (
                <tr key={conversation.id}>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/pierrot?conversation=${encodeURIComponent(conversation.id)}`}
                      className="text-[#8B1E3F] hover:underline"
                    >
                      {formatDate(conversation.startedAt)}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[#625D58]">{conversation.route}</td>
                  <td className="px-3 py-2.5 uppercase text-[#625D58]">{conversation.language}</td>
                  <td className="px-3 py-2.5 font-mono text-[10px] text-[#625D58]">
                    {conversation.latestIntent ?? '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[#625D58]">{conversation.messageCount}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={
                        conversation.retrieval === 'failure'
                          ? 'text-[#8B1E3F]'
                          : conversation.retrieval === 'success'
                            ? 'text-[#4F6B4D]'
                            : 'text-[#A29B94]'
                      }
                    >
                      {conversation.retrieval}
                    </span>
                  </td>
                </tr>
              ))}
              {snapshot.conversations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[#89827B]">
                    No conversations in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <Link
            href={sectionHref('conversations', filters)}
            className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8B1E3F] hover:underline"
          >
            Open conversation explorer →
          </Link>
        </div>
      </Section>

      <footer className="border-t border-[#D9D3CD] pt-4 text-[10px] leading-relaxed text-[#A29B94]">
        Owner-only. Conversation and session counts are not unique-visitor counts. Purchases are
        attributed only when a trusted order or payment record links to the conversation; otherwise
        they remain unattributed.
      </footer>
    </div>
  );
}
