'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Section =
  | 'overview'
  | 'timeline'
  | 'topics'
  | 'outlets'
  | 'quotes'
  | 'relations'
  | 'roles'
  | 'analysis'
  | 'quality'
  | 'search';

type Filters = {
  from: string;
  to: string;
  topic: string;
  language: string;
  outlet: string;
  status: string;
  kind: string;
  role: string;
  page: number;
  pageSize: number;
};

type FilterOptions = {
  topics: string[];
  languages: string[];
  outlets: string[];
  kinds: string[];
  roles: string[];
  range: { from: string | null; to: string | null };
};

type Overview = {
  total: number;
  byStatus: { published: number; draft: number };
  outlets: number;
  languages: Array<{ language: string; count: number }>;
  range: { from: string | null; to: string | null };
  quotes: {
    direct: number;
    indirect: number;
    mentions: number;
    verifiedDirect: number;
    pending: number;
    unconfirmedAttribution: number;
  };
  fullTextShare: number | null;
  awaitingReviewShare: number | null;
  awaitingReviewPublications: number;
  missingDates: number;
  extractionErrors: number;
  coverage: {
    fullText: number;
    partialText: number;
    blocked: number;
    missing: number;
  };
  analysis: {
    eligible: number;
    analyzed: number;
    stale: number;
    notAnalyzed: number;
    queued: number;
    failed: number;
  };
  roles: Array<{ role: string; count: number }>;
  entities: Array<{ entity_type: string; name: string; count: number }>;
};

type Timeline = {
  months: Array<{
    month: string;
    publications: number;
    direct_quotes: number;
    indirect_quotes: number;
    mentions: number;
  }>;
  years: Array<{ year: string; publications: number }>;
  topicTimeline: Array<{ month: string; topic: string; publications: number }>;
};

type Topics = {
  distribution: Array<{
    topic: string;
    publications: number;
    full_text: number;
    direct_quotes: number;
  }>;
  subtopics: Array<{ subtopic: string; count: number }>;
  characteristic: Array<{
    id: string;
    title: string;
    outlet: string;
    effective_date: string | null;
    effective_topic: string;
    direct_quotes: number;
  }>;
};

type Outlets = {
  rows: Array<{
    outlet: string;
    publications: number;
    languages: string[];
    full_text: number;
    direct_quotes: number;
    last_publication: string | null;
    country: string | null;
  }>;
  total: number;
  countries: Array<{ country: string; publications: number }>;
};

type Quotes = {
  counts: {
    direct: number;
    indirect: number;
    mentions: number;
    verified_direct: number;
    unconfirmed: number;
    total: number;
  };
  topics: Array<{ topic: string; quotes: number; verified: number }>;
  outlets: Array<{ outlet: string; direct_quotes: number }>;
  publications: Array<{
    id: string;
    title: string;
    outlet: string;
    effective_date: string | null;
    quotes: number;
    direct_quotes: number;
    verified: number;
  }>;
  pending: Array<{
    id: string;
    media_record_id: string;
    title: string;
    outlet: string;
    canonical_url: string | null;
    quote_text: string;
    quote_type: string;
    attribution: string;
    confidence: number;
  }>;
  pendingTotal: number;
};

type Relations = {
  counts: Array<{
    relation_type: string;
    count: number;
    confirmed: number;
    review: number;
  }>;
  rows: Array<{
    id: string;
    relation_type: string;
    confidence: number;
    detected_by: string;
    review_status: string;
    target_media_record_id: string;
    target_title: string;
    target_outlet: string;
    target_canonical_url: string;
  }>;
  total: number;
  clusters: Array<{ topic: string; publications: number; subtopics: string[] }>;
};

type Quality = {
  counts: {
    missing_dates: number;
    without_text: number;
    extraction_errors: number;
    duplicate_groups: number;
    pending_quotes: number;
    missing_embeddings: number;
  };
  missingDates: Array<{ id: string; title: string; outlet: string }>;
  withoutText: Array<{
    id: string;
    title: string;
    outlet: string;
    media_coverage_status: string | null;
    media_text_quality: string | null;
    chunk_count: number | null;
  }>;
  extractionErrors: Array<{
    id: string;
    title: string;
    outlet: string;
    media_coverage_status: string | null;
    media_text_quality: string | null;
  }>;
  duplicates: Array<{ content_hash: string; count: number; titles: string[] }>;
  pendingQuotes: Array<{
    id: string;
    title: string;
    outlet: string;
    quote_text: string;
    verification_status: string;
    attribution: string;
  }>;
  missingEmbeddings: Array<{
    id: string;
    title: string;
    outlet: string;
    chunk_count: number;
  }>;
};

type AnalysisData = {
  counts: {
    eligible: number;
    analyzed: number;
    stale: number;
    not_analyzed: number;
    pending: number;
    processing: number;
    failed: number;
    not_eligible: number;
  };
  queue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    oldestPendingAt: string | null;
  };
  rows: Array<{
    id: string;
    title: string;
    outlet: string;
    canonical_url: string | null;
    effective_date: string | null;
    kind: string;
    language: string | null;
    effective_topic: string | null;
    media_text_quality: string | null;
    chunk_count: number | null;
    analysis_status: string;
    latest_run_id: string | null;
    latest_run_status: string | null;
    latest_run_at: string | null;
    error_code: string | null;
    quote_count: number | null;
    relation_count: number | null;
    analyzer_version: string | null;
    effective_role: string | null;
  }>;
  runs: Array<{
    id: string;
    media_record_id: string;
    title: string | null;
    outlet: string | null;
    status: string;
    attempt: number;
    max_attempts: number;
    error_code: string | null;
    error_detail: string | null;
    quote_count: number;
    relation_count: number;
    topic_count: number;
    rejected_candidate_count: number;
    analyzer_version: string;
    requested_via: string;
    created_at: string;
    completed_at: string | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

type RolesData = {
  roles: Array<{
    role: string;
    publications: number;
    confidence: number | null;
    direct_quotes: number;
  }>;
  roleOutlets: Array<{ role: string; outlet: string; publications: number }>;
  rolePublications: Array<{
    id: string;
    title: string;
    outlet: string;
    canonical_url: string | null;
    effective_date: string | null;
    role: string;
    confidence: number | null;
  }>;
  entities: Array<{
    entity_type: string;
    name: string;
    mentions: number;
    publications: number;
  }>;
  entityTypes: Array<{ entity_type: string; count: number }>;
  interactions: Array<{ interaction_type: string; publications: number }>;
};

type SearchResult = {
  summary: string;
  facts: Array<{
    text: string;
    documentId: string;
    chunkId: string;
    title: string;
    outlet: string;
  }>;
  interpretation: string[];
  insufficient: boolean;
  count: number;
  results: Array<{
    chunkId: string;
    documentId: string;
    mediaRecordId: string;
    title: string;
    outlet: string;
    canonicalUrl: string;
    publishedDate: string | null;
    language: string | null;
    content: string;
    heading: string;
    similarity: number;
    topic: string | null;
    quotes: Array<{
      id: string;
      quoteText: string;
      quoteType: string;
      verificationStatus: string;
      attribution: string;
    }>;
  }>;
};

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'overview', label: 'Общая картина' },
  { id: 'timeline', label: 'Хронология' },
  { id: 'topics', label: 'Темы' },
  { id: 'outlets', label: 'Издания' },
  { id: 'quotes', label: 'Цитирование' },
  { id: 'relations', label: 'Связи' },
  { id: 'roles', label: 'Роли и участники' },
  { id: 'analysis', label: 'Анализ и очередь' },
  { id: 'quality', label: 'Качество данных' },
  { id: 'search', label: 'Семантический поиск' },
];

const inputClass =
  'w-full border border-[#D9D3CD] bg-white px-2.5 py-2 text-xs text-[#211F1F] outline-none focus:border-[#990F3D]';

function number(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('en-GB');
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;
}

function date(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="border-t border-[#D9D3CD] py-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">{label}</p>
      <p className="mt-1.5 font-serif text-2xl text-[#211F1F]">{value}</p>
      {detail && <p className="mt-1 text-[10px] leading-relaxed text-[#89827B]">{detail}</p>}
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-b border-[#D9D3CD] pb-4">
      <h2 className="font-serif text-2xl text-[#211F1F]">{title}</h2>
      {description && (
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#746D66]">{description}</p>
      )}
    </div>
  );
}

function Bar({
  value,
  max,
  label,
  right,
}: {
  value: number;
  max: number;
  label: string;
  right?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="truncate">{label}</span>
        <span className="shrink-0 font-mono text-[10px]">{right ?? value}</span>
      </div>
      <div className="mt-1 h-1.5 bg-[#EEE9E4]">
        <div
          className="h-full bg-[#990F3D]"
          style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }}
        />
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="border-b border-[#EEE9E4] py-6 text-xs text-[#89827B]">{children}</p>;
}

export default function MediaIntelligenceDashboard() {
  const [section, setSection] = useState<Section>('overview');
  const [filters, setFilters] = useState<Filters>({
    from: '',
    to: '',
    topic: '',
    language: '',
    outlet: '',
    status: '',
    kind: '',
    role: '',
    page: 1,
    pageSize: 20,
  });
  const [options, setOptions] = useState<FilterOptions>({
    topics: [],
    languages: [],
    outlets: [],
    kinds: [],
    roles: [],
    range: { from: null, to: null },
  });
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');
  const [queueBusy, setQueueBusy] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.topic) params.set('topic', filters.topic);
    if (filters.language) params.set('language', filters.language);
    if (filters.outlet) params.set('outlet', filters.outlet);
    if (filters.status) params.set('status', filters.status);
    if (filters.kind) params.set('kind', filters.kind);
    if (filters.role) params.set('role', filters.role);
    params.set('page', String(filters.page));
    params.set('pageSize', String(filters.pageSize));

    return params.toString();
  }, [filters]);

  useEffect(() => {
    fetch('/api/admin/media/intelligence/filters', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => {
        if (json?.data) setOptions(json.data as FilterOptions);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (section === 'search') return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/admin/media/intelligence/${section}?${queryString}`, {
        cache: 'no-store',
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(json.error || 'Не удалось загрузить аналитику.');
      setData(json.data ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить аналитику.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString, section]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]): void {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === 'page' || key === 'pageSize' ? (value as number) : 1,
    }));
  }

  async function runSearch(): Promise<void> {
    if (!query.trim()) return;

    setSearching(true);
    setError('');

    try {
      const response = await fetch('/api/admin/media/intelligence/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          filters: {
            from: filters.from,
            to: filters.to,
            topic: filters.topic,
            language: filters.language,
            outlet: filters.outlet,
            status: filters.status,
            kind: filters.kind,
            role: filters.role,
          },
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(json.error || 'Поиск недоступен.');
      setSearch(json.data as SearchResult);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Поиск недоступен.');
      setSearch(null);
    } finally {
      setSearching(false);
    }
  }

  async function runBatch(
    mode: 'all' | 'selected' | 'retry_failed',
    options: { force?: boolean; run?: boolean } = {}
  ): Promise<void> {
    if (mode === 'selected' && selectedRecords.length === 0) {
      setBatchMessage('Выберите хотя бы одну публикацию.');
      return;
    }

    setBatchBusy(true);
    setBatchMessage('');

    try {
      const response = await fetch('/api/admin/media/analysis/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          recordIds: mode === 'selected' ? selectedRecords : undefined,
          force: Boolean(options.force),
          run: Boolean(options.run),
          limit: mode === 'all' ? 200 : selectedRecords.length,
          maxJobs: 3,
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(json.error || 'Не удалось запустить анализ.');

      const enqueued = json.enqueued || {};
      const processed = json.processed;
      const parts = [
        `Eligible: ${enqueued.eligible ?? 0}`,
        `queued: ${enqueued.queued ?? 0}`,
        `already queued: ${enqueued.alreadyQueued ?? 0}`,
        `up to date: ${enqueued.upToDate ?? 0}`,
        `not eligible: ${enqueued.notEligible ?? 0}`,
      ];

      if (processed) {
        parts.push(
          `processed: ${processed.processed ?? 0}, retried: ${processed.retried ?? 0}, failed: ${processed.failed ?? 0}`
        );
      }

      setBatchMessage(parts.join(' · '));
      setSelectedRecords([]);

      if (section === 'analysis') await load();
    } catch (error) {
      setBatchMessage(error instanceof Error ? error.message : 'Не удалось запустить анализ.');
    } finally {
      setBatchBusy(false);
    }
  }

  async function processQueue(): Promise<void> {
    setQueueBusy(true);
    setBatchMessage('');

    try {
      const response = await fetch('/api/admin/media/analysis/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 3, maxDurationMs: 180000 }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(json.error || 'Очередь недоступна.');

      const result = json.result || {};
      setBatchMessage(
        `Очередь: claimed ${result.claimed ?? 0} · processed ${result.processed ?? 0} · retried ${result.retried ?? 0} · failed ${result.failed ?? 0}`
      );

      if (section === 'analysis') await load();
    } catch (error) {
      setBatchMessage(error instanceof Error ? error.message : 'Очередь недоступна.');
    } finally {
      setQueueBusy(false);
    }
  }

  async function rebuildRelations(): Promise<void> {
    setQueueBusy(true);
    setBatchMessage('');

    try {
      const response = await fetch('/api/admin/media/analysis/relations/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1000 }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(json.error || 'Не удалось пересобрать связи.');

      const result = json.result || {};
      setBatchMessage(
        `Связи пересобраны: ${result.records ?? 0} публикаций · ${result.relations ?? 0} связей`
      );

      if (section === 'analysis' || section === 'relations') await load();
    } catch (error) {
      setBatchMessage(error instanceof Error ? error.message : 'Не удалось пересобрать связи.');
    } finally {
      setQueueBusy(false);
    }
  }

  async function runAction(runId: string, action: 'retry' | 'cancel'): Promise<void> {
    setBatchMessage('');

    try {
      const response = await fetch(`/api/admin/media/analysis/runs/${runId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(json.error || 'Не удалось обновить запуск.');

      setBatchMessage(action === 'retry' ? 'Запуск возвращён в очередь.' : 'Запуск отменён.');
      await load();
    } catch (error) {
      setBatchMessage(error instanceof Error ? error.message : 'Не удалось обновить запуск.');
    }
  }

  function toggleSelected(id: string): void {
    setSelectedRecords((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  const overview = data as Overview | null;
  const timeline = data as Timeline | null;
  const topics = data as Topics | null;
  const outlets = data as Outlets | null;
  const quotes = data as Quotes | null;
  const relations = data as Relations | null;
  const quality = data as Quality | null;
  const analysisData = data as AnalysisData | null;
  const rolesData = data as RolesData | null;

  return (
    <div className="space-y-7">
      <header className="border-b border-[#D9D3CD] pb-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#990F3D]">
          Media Intelligence
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl tracking-tight text-[#211F1F] sm:text-4xl">
              Аналитика медиа-архива
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#746D66]">
              Точные показатели считаются SQL по архиву, цитатам, темам и связям. RAG используется
              только для смыслового поиска и интерпретации, а не для подсчёта статистики.
            </p>
          </div>
          <Link href="/admin/media" className="text-xs text-[#8B1E3F] underline underline-offset-2">
            ← Медиа-публикации
          </Link>
        </div>
      </header>

      <section className="grid gap-3 border border-[#E5E1DC] bg-white/70 p-4 sm:grid-cols-2 lg:grid-cols-9">
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          С
          <input
            type="date"
            className={`${inputClass} mt-1`}
            value={filters.from}
            onChange={(event) => updateFilter('from', event.target.value)}
          />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          По
          <input
            type="date"
            className={`${inputClass} mt-1`}
            value={filters.to}
            onChange={(event) => updateFilter('to', event.target.value)}
          />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          Тема
          <select
            className={`${inputClass} mt-1`}
            value={filters.topic}
            onChange={(event) => updateFilter('topic', event.target.value)}
          >
            <option value="">Все</option>
            {options.topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          Язык
          <select
            className={`${inputClass} mt-1`}
            value={filters.language}
            onChange={(event) => updateFilter('language', event.target.value)}
          >
            <option value="">Все</option>
            {options.languages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          Издание
          <select
            className={`${inputClass} mt-1`}
            value={filters.outlet}
            onChange={(event) => updateFilter('outlet', event.target.value)}
          >
            <option value="">Все</option>
            {options.outlets.map((outlet) => (
              <option key={outlet} value={outlet}>
                {outlet}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          Статус
          <select
            className={`${inputClass} mt-1`}
            value={filters.status}
            onChange={(event) => updateFilter('status', event.target.value)}
          >
            <option value="">Все</option>
            <option value="published">published</option>
            <option value="draft">draft</option>
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          Тип
          <select
            className={`${inputClass} mt-1`}
            value={filters.kind}
            onChange={(event) => updateFilter('kind', event.target.value)}
          >
            <option value="">Все</option>
            {options.kinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-[#89827B]">
          Роль
          <select
            className={`${inputClass} mt-1`}
            value={filters.role}
            onChange={(event) => updateFilter('role', event.target.value)}
          >
            <option value="">Все</option>
            {(options.roles.length > 0
              ? options.roles
              : [
                  'expert_comment',
                  'interview',
                  'quoted_expert',
                  'profile',
                  'author',
                  'mention',
                  'republication',
                  'unknown',
                ]
            ).map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="self-end border border-[#D9D3CD] px-3 py-2 text-xs text-[#625D58] hover:border-[#990F3D]"
          onClick={() =>
            setFilters({
              from: '',
              to: '',
              topic: '',
              language: '',
              outlet: '',
              status: '',
              kind: '',
              role: '',
              page: 1,
              pageSize: 20,
            })
          }
        >
          Сбросить
        </button>
      </section>

      <nav className="flex flex-wrap gap-1 border-b border-[#D9D3CD] pb-2">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSection(item.id);
              setFilters((current) => ({ ...current, page: 1 }));
            }}
            className={[
              'border px-3 py-1.5 text-xs transition',
              section === item.id
                ? 'border-[#E7C9D2] bg-[#F8EAF0] text-[#7E0C33]'
                : 'border-transparent text-[#625D58] hover:border-[#D9D3CD] hover:bg-white',
            ].join(' ')}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="flex flex-wrap items-center gap-2 border border-[#E5E1DC] bg-white/70 p-3">
        <button
          type="button"
          className="border border-[#990F3D] bg-[#990F3D] px-3 py-1.5 text-xs text-white disabled:opacity-40"
          disabled={batchBusy}
          onClick={() => void runBatch('all', { run: true })}
        >
          {batchBusy ? 'Запуск…' : 'Analyze all eligible (batch 3)'}
        </button>
        <button
          type="button"
          className="border border-[#D9D3CD] px-3 py-1.5 text-xs text-[#625D58] disabled:opacity-40"
          disabled={batchBusy || selectedRecords.length === 0}
          onClick={() => void runBatch('selected', { run: true })}
        >
          Analyze selected ({selectedRecords.length})
        </button>
        <button
          type="button"
          className="border border-[#D9D3CD] px-3 py-1.5 text-xs text-[#625D58] disabled:opacity-40"
          disabled={batchBusy}
          onClick={() => void runBatch('retry_failed', { run: true })}
        >
          Retry failed
        </button>
        <button
          type="button"
          className="border border-[#D9D3CD] px-3 py-1.5 text-xs text-[#625D58] disabled:opacity-40"
          disabled={batchBusy}
          onClick={() => void runBatch('all', { force: true, run: true })}
        >
          Force refresh (batch 3)
        </button>
        <button
          type="button"
          className="border border-[#D9D3CD] px-3 py-1.5 text-xs text-[#625D58] disabled:opacity-40"
          disabled={queueBusy}
          onClick={() => void processQueue()}
        >
          {queueBusy ? 'Обработка…' : 'Process queue'}
        </button>
        <button
          type="button"
          className="border border-[#D9D3CD] px-3 py-1.5 text-xs text-[#625D58] disabled:opacity-40"
          disabled={queueBusy}
          onClick={() => void rebuildRelations()}
        >
          Rebuild relations
        </button>
        <button
          type="button"
          className="border border-[#D9D3CD] px-3 py-1.5 text-xs text-[#625D58]"
          onClick={() => void load()}
        >
          Обновить
        </button>
        {batchMessage && (
          <span className="text-[11px] text-[#625D58]" role="status" aria-live="polite">
            {batchMessage}
          </span>
        )}
      </section>

      {error && <p className="border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}

      {section !== 'search' && loading && (
        <p className="py-8 text-center text-xs text-[#89827B]">Загрузка…</p>
      )}

      {section !== 'search' && !loading && data !== null && (
        <div className="space-y-7">
          {section === 'overview' && overview && (
            <>
              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Всего публикаций" value={number(overview.total)} />
                <Metric label="Published" value={number(overview.byStatus.published)} />
                <Metric label="Draft" value={number(overview.byStatus.draft)} />
                <Metric label="Изданий" value={number(overview.outlets)} />
                <Metric
                  label="Период"
                  value={`${date(overview.range.from)} — ${date(overview.range.to)}`}
                />
                <Metric label="Полный текст" value={percent(overview.fullTextShare)} />
                <Metric
                  label="Ожидают проверки"
                  value={percent(overview.awaitingReviewShare)}
                  detail={`${number(overview.awaitingReviewPublications)} публикаций`}
                />
                <Metric label="Без даты" value={number(overview.missingDates)} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle
                    title="Покрытие Brain"
                    description="Сколько публикаций имеют пригодный текст для анализа."
                  />
                  <div className="grid gap-x-6 sm:grid-cols-2">
                    <Metric label="Full text" value={number(overview.coverage.fullText)} />
                    <Metric label="Partial text" value={number(overview.coverage.partialText)} />
                    <Metric label="Blocked / metadata" value={number(overview.coverage.blocked)} />
                    <Metric label="Нет Brain document" value={number(overview.coverage.missing)} />
                  </div>
                </section>
                <section className="space-y-3">
                  <SectionTitle
                    title="Аналитическое покрытие"
                    description="Статус последнего анализа относительно текущего content hash и версии анализатора."
                  />
                  <div className="grid gap-x-6 sm:grid-cols-2">
                    <Metric label="Eligible" value={number(overview.analysis.eligible)} />
                    <Metric label="Analyzed" value={number(overview.analysis.analyzed)} />
                    <Metric label="Stale" value={number(overview.analysis.stale)} />
                    <Metric label="Not analyzed" value={number(overview.analysis.notAnalyzed)} />
                    <Metric label="В очереди" value={number(overview.analysis.queued)} />
                    <Metric label="Failed" value={number(overview.analysis.failed)} />
                  </div>
                </section>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="Редакционные роли" />
                  {overview.roles.length === 0 ? (
                    <Empty>Роли ещё не извлечены.</Empty>
                  ) : (
                    <div className="space-y-2">
                      {overview.roles.map((item) => (
                        <Bar
                          key={item.role}
                          label={item.role}
                          value={item.count}
                          max={Math.max(...overview.roles.map((entry) => entry.count))}
                        />
                      ))}
                    </div>
                  )}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Участники и организации" />
                  {overview.entities.length === 0 ? (
                    <Empty>Участники ещё не извлечены.</Empty>
                  ) : (
                    <div className="space-y-2">
                      {overview.entities.slice(0, 12).map((item) => (
                        <p
                          key={`${item.entity_type}-${item.name}`}
                          className="flex justify-between border-b border-[#EEE9E4] py-2 text-xs"
                        >
                          <span className="truncate">
                            {item.name}
                            <span className="ml-2 text-[10px] uppercase text-[#89827B]">
                              {item.entity_type}
                            </span>
                          </span>
                          <span className="font-mono">{item.count}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="Цитирование" />
                  <div className="grid gap-x-6 sm:grid-cols-2">
                    <Metric label="Прямые цитаты" value={number(overview.quotes.direct)} />
                    <Metric label="Косвенные" value={number(overview.quotes.indirect)} />
                    <Metric label="Упоминания" value={number(overview.quotes.mentions)} />
                    <Metric
                      label="Подтверждённые прямые"
                      value={number(overview.quotes.verifiedDirect)}
                    />
                    <Metric label="Ожидают проверки" value={number(overview.quotes.pending)} />
                    <Metric
                      label="Атрибуция неясна"
                      value={number(overview.quotes.unconfirmedAttribution)}
                    />
                  </div>
                </section>

                <section className="space-y-3">
                  <SectionTitle title="Языки" />
                  {overview.languages.length === 0 ? (
                    <Empty>Нет данных о языках.</Empty>
                  ) : (
                    <div className="space-y-2">
                      {overview.languages.slice(0, 12).map((item) => (
                        <Bar
                          key={item.language}
                          label={item.language}
                          value={item.count}
                          max={Math.max(...overview.languages.map((entry) => entry.count))}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {section === 'timeline' && timeline && (
            <>
              <SectionTitle
                title="Хронология"
                description="Публикации по месяцам и динамика прямого/косвенного цитирования."
              />
              {timeline.months.length === 0 ? (
                <Empty>Нет публикаций с датами в выбранном периоде.</Empty>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const max = Math.max(1, ...timeline.months.map((item) => item.publications));
                    return timeline.months.map((item) => (
                      <div
                        key={item.month}
                        className="grid grid-cols-[88px_1fr_auto] items-center gap-3"
                      >
                        <span className="font-mono text-[10px] text-[#89827B]">{item.month}</span>
                        <div className="h-3 bg-[#EEE9E4]">
                          <div
                            className="h-full bg-[#990F3D]"
                            style={{ width: `${(item.publications / max) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[#625D58]">
                          {item.publications} публ. · {item.direct_quotes} direct ·{' '}
                          {item.indirect_quotes} indirect · {item.mentions} mention
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="По годам" />
                  {timeline.years.map((item) => (
                    <p
                      key={item.year}
                      className="flex justify-between border-b border-[#EEE9E4] py-2 text-xs"
                    >
                      <span>{item.year}</span>
                      <span className="font-mono">{item.publications}</span>
                    </p>
                  ))}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Темы во времени" />
                  {timeline.topicTimeline.slice(-24).map((item) => (
                    <p
                      key={`${item.month}-${item.topic}`}
                      className="flex justify-between border-b border-[#EEE9E4] py-2 text-xs"
                    >
                      <span className="truncate">
                        {item.month} · {item.topic}
                      </span>
                      <span className="font-mono">{item.publications}</span>
                    </p>
                  ))}
                </section>
              </div>
            </>
          )}

          {section === 'topics' && topics && (
            <>
              <SectionTitle
                title="Темы"
                description="Существующая классификация и уточнённые подтемы."
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="Распределение" />
                  {topics.distribution.map((item) => (
                    <Bar
                      key={item.topic}
                      label={item.topic}
                      value={item.publications}
                      max={Math.max(1, ...topics.distribution.map((entry) => entry.publications))}
                      right={`${item.publications} · ${item.direct_quotes} direct`}
                    />
                  ))}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Подтемы" />
                  {topics.subtopics.length === 0 ? (
                    <Empty>Подтемы пока не извлечены.</Empty>
                  ) : (
                    topics.subtopics.map((item) => (
                      <Bar
                        key={item.subtopic}
                        label={item.subtopic}
                        value={item.count}
                        max={Math.max(...topics.subtopics.map((entry) => entry.count))}
                      />
                    ))
                  )}
                </section>
              </div>
              <section className="space-y-3">
                <SectionTitle title="Характерные публикации" />
                <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead className="bg-[#F7F5F2] text-[#89827B]">
                      <tr>
                        <th className="px-3 py-2">Тема</th>
                        <th className="px-3 py-2">Публикация</th>
                        <th className="px-3 py-2">Издание</th>
                        <th className="px-3 py-2">Дата</th>
                        <th className="px-3 py-2">Direct</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topics.characteristic.map((item) => (
                        <tr
                          key={`${item.effective_topic}-${item.id}`}
                          className="border-t border-[#EEE9E4]"
                        >
                          <td className="px-3 py-2">{item.effective_topic}</td>
                          <td className="px-3 py-2">
                            <Link className="underline" href={`/admin/media/${item.id}/analysis`}>
                              {item.title}
                            </Link>
                          </td>
                          <td className="px-3 py-2">{item.outlet}</td>
                          <td className="px-3 py-2">{date(item.effective_date)}</td>
                          <td className="px-3 py-2 font-mono">{item.direct_quotes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {section === 'outlets' && outlets && (
            <>
              <SectionTitle
                title="Издания и география"
                description="Страна показывается только если она явно указана в данных издания. Язык публикации не используется как доказательство страны."
              />
              <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-[#F7F5F2] text-[#89827B]">
                    <tr>
                      <th className="px-3 py-2">Издание</th>
                      <th className="px-3 py-2">Публикаций</th>
                      <th className="px-3 py-2">Языки</th>
                      <th className="px-3 py-2">Full text</th>
                      <th className="px-3 py-2">Direct quotes</th>
                      <th className="px-3 py-2">Последняя</th>
                      <th className="px-3 py-2">Страна</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outlets.rows.map((item) => (
                      <tr key={item.outlet} className="border-t border-[#EEE9E4]">
                        <td className="px-3 py-2">{item.outlet}</td>
                        <td className="px-3 py-2 font-mono">{item.publications}</td>
                        <td className="px-3 py-2">{item.languages.join(', ') || '—'}</td>
                        <td className="px-3 py-2 font-mono">{item.full_text}</td>
                        <td className="px-3 py-2 font-mono">{item.direct_quotes}</td>
                        <td className="px-3 py-2">{date(item.last_publication)}</td>
                        <td className="px-3 py-2">{item.country || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <section>
                  <SectionTitle title="Страны с явными данными" />
                  {outlets.countries.length === 0 ? (
                    <Empty>Достоверных страновых данных нет.</Empty>
                  ) : (
                    outlets.countries.map((item) => (
                      <p
                        key={item.country}
                        className="flex justify-between border-b border-[#EEE9E4] py-2 text-xs"
                      >
                        <span>{item.country}</span>
                        <span className="font-mono">{item.publications}</span>
                      </p>
                    ))
                  )}
                </section>
                <section>
                  <SectionTitle title="Пагинация" />
                  <Pager
                    page={filters.page}
                    pageSize={filters.pageSize}
                    total={outlets.total}
                    onPage={(page) => updateFilter('page', page)}
                    onPageSize={(pageSize) => updateFilter('pageSize', pageSize)}
                  />
                </section>
              </div>
            </>
          )}

          {section === 'quotes' && quotes && (
            <>
              <SectionTitle
                title="Цитирование"
                description="Подтверждённые и неподтверждённые цитаты, темы и издания."
              />
              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Всего цитат" value={number(quotes.counts.total)} />
                <Metric label="Прямые" value={number(quotes.counts.direct)} />
                <Metric
                  label="Подтверждённые прямые"
                  value={number(quotes.counts.verified_direct)}
                />
                <Metric label="Неясная атрибуция" value={number(quotes.counts.unconfirmed)} />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="Самые цитируемые темы" />
                  {quotes.topics.map((item) => (
                    <Bar
                      key={item.topic}
                      label={item.topic}
                      value={item.quotes}
                      max={Math.max(1, ...quotes.topics.map((entry) => entry.quotes))}
                      right={`${item.quotes} · ${item.verified} verified`}
                    />
                  ))}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Издания с прямыми цитатами" />
                  {quotes.outlets.map((item) => (
                    <Bar
                      key={item.outlet}
                      label={item.outlet}
                      value={item.direct_quotes}
                      max={Math.max(1, ...quotes.outlets.map((entry) => entry.direct_quotes))}
                    />
                  ))}
                </section>
              </div>
              <section className="space-y-3">
                <SectionTitle title="Публикации с наиболее содержательными комментариями" />
                <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead className="bg-[#F7F5F2] text-[#89827B]">
                      <tr>
                        <th className="px-3 py-2">Публикация</th>
                        <th className="px-3 py-2">Издание</th>
                        <th className="px-3 py-2">Цитат</th>
                        <th className="px-3 py-2">Прямых</th>
                        <th className="px-3 py-2">Проверено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.publications.map((item) => (
                        <tr key={item.id} className="border-t border-[#EEE9E4]">
                          <td className="px-3 py-2">
                            <Link className="underline" href={`/admin/media/${item.id}/analysis`}>
                              {item.title}
                            </Link>
                          </td>
                          <td className="px-3 py-2">{item.outlet}</td>
                          <td className="px-3 py-2 font-mono">{item.quotes}</td>
                          <td className="px-3 py-2 font-mono">{item.direct_quotes}</td>
                          <td className="px-3 py-2 font-mono">{item.verified}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="space-y-3">
                <SectionTitle title="Неподтверждённая атрибуция" />
                {quotes.pending.length === 0 ? (
                  <Empty>Нет цитат, ожидающих проверки.</Empty>
                ) : (
                  <>
                    {quotes.pending.map((item) => (
                      <article key={item.id} className="border border-[#E5E1DC] bg-white/70 p-3">
                        <p className="text-xs text-[#625D58]">
                          {item.outlet} · {item.quote_type} · {item.attribution} ·{' '}
                          {percent(item.confidence * 100)}
                        </p>
                        <p className="mt-1 text-sm">“{item.quote_text}”</p>
                        <div className="mt-1 flex gap-3 text-[10px]">
                          <Link
                            className="inline-flex text-[#8B1E3F] underline"
                            href={`/admin/media/${item.media_record_id}/analysis#quote-${item.id}`}
                          >
                            Проверить цитату и фрагмент
                          </Link>
                          {item.canonical_url && (
                            <a
                              className="inline-flex text-[#8B1E3F] underline"
                              href={item.canonical_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Оригинал
                            </a>
                          )}
                        </div>
                      </article>
                    ))}
                    <Pager
                      page={filters.page}
                      pageSize={filters.pageSize}
                      total={quotes.pendingTotal}
                      onPage={(page) => updateFilter('page', page)}
                      onPageSize={(pageSize) => updateFilter('pageSize', pageSize)}
                    />
                  </>
                )}
              </section>
            </>
          )}

          {section === 'relations' && relations && (
            <>
              <SectionTitle
                title="Связи публикаций"
                description="Перепечатки, синдикация, общие сюжеты и тематические кластеры."
              />
              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {relations.counts.map((item) => (
                  <Metric
                    key={item.relation_type}
                    label={item.relation_type}
                    value={number(item.count)}
                    detail={`${item.confirmed} confirmed · ${item.review} review`}
                  />
                ))}
              </div>
              <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-[#F7F5F2] text-[#89827B]">
                    <tr>
                      <th className="px-3 py-2">Публикация</th>
                      <th className="px-3 py-2">Связана с</th>
                      <th className="px-3 py-2">Тип</th>
                      <th className="px-3 py-2">Confidence</th>
                      <th className="px-3 py-2">Основание</th>
                      <th className="px-3 py-2">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.rows.map((item) => (
                      <tr key={item.id} className="border-t border-[#EEE9E4]">
                        <td className="px-3 py-2">
                          <Link
                            className="underline"
                            href={`/admin/media/${item.target_media_record_id}/analysis`}
                          >
                            {item.target_title}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{item.target_outlet}</td>
                        <td className="px-3 py-2">{item.relation_type}</td>
                        <td className="px-3 py-2 font-mono">{percent(item.confidence * 100)}</td>
                        <td className="px-3 py-2">{item.detected_by}</td>
                        <td className="px-3 py-2">{item.review_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                page={filters.page}
                pageSize={filters.pageSize}
                total={relations.total}
                onPage={(page) => updateFilter('page', page)}
                onPageSize={(pageSize) => updateFilter('pageSize', pageSize)}
              />
              <section className="space-y-3">
                <SectionTitle title="Тематические кластеры" />
                {relations.clusters.map((item) => (
                  <p key={item.topic} className="border-b border-[#EEE9E4] py-2 text-xs">
                    {item.topic} · {item.publications} публикаций ·{' '}
                    {item.subtopics.join(', ') || '—'}
                  </p>
                ))}
              </section>
            </>
          )}

          {section === 'analysis' && analysisData && (
            <>
              <SectionTitle
                title="Анализ и очередь"
                description="Eligible-записи имеют полный или частичный текст и завершённую Brain ingestion. Повторный анализ неизменившегося текста пропускается по content hash и версии анализатора."
              />
              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Eligible" value={number(analysisData.counts.eligible)} />
                <Metric label="Analyzed" value={number(analysisData.counts.analyzed)} />
                <Metric label="Stale" value={number(analysisData.counts.stale)} />
                <Metric label="Not analyzed" value={number(analysisData.counts.not_analyzed)} />
                <Metric label="Queued" value={number(analysisData.counts.pending)} />
                <Metric label="Processing" value={number(analysisData.counts.processing)} />
                <Metric label="Failed" value={number(analysisData.counts.failed)} />
                <Metric
                  label="Без пригодного текста"
                  value={number(analysisData.counts.not_eligible)}
                />
              </div>

              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Всего runs" value={number(analysisData.queue.completed + analysisData.queue.pending + analysisData.queue.processing + analysisData.queue.failed + analysisData.queue.cancelled)} />
                <Metric label="Pending" value={number(analysisData.queue.pending)} />
                <Metric label="Processing" value={number(analysisData.queue.processing)} />
                <Metric
                  label="Oldest pending"
                  value={analysisData.queue.oldestPendingAt ? date(analysisData.queue.oldestPendingAt.slice(0, 10)) : '—'}
                />
              </div>

              <section className="space-y-3">
                <SectionTitle title="Публикации и статус анализа" />
                <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                  <table className="w-full min-w-[1100px] text-left text-xs">
                    <thead className="bg-[#F7F5F2] text-[#89827B]">
                      <tr>
                        <th className="px-2 py-2">Выбор</th>
                        <th className="px-3 py-2">Публикация</th>
                        <th className="px-3 py-2">Издание / дата</th>
                        <th className="px-3 py-2">Текст</th>
                        <th className="px-3 py-2">Роль</th>
                        <th className="px-3 py-2">Статус</th>
                        <th className="px-3 py-2">Цитат</th>
                        <th className="px-3 py-2">Последний run</th>
                        <th className="px-3 py-2">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisData.rows.map((row) => (
                        <tr key={row.id} className="border-t border-[#EEE9E4]">
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={selectedRecords.includes(row.id)}
                              onChange={() => toggleSelected(row.id)}
                              aria-label={`Выбрать ${row.title}`}
                            />
                          </td>
                          <td className="max-w-[320px] px-3 py-2">
                            <Link
                              className="underline underline-offset-2"
                              href={`/admin/media/${row.id}/analysis`}
                            >
                              {row.title}
                            </Link>
                            <div className="mt-1 flex gap-2 text-[10px] text-[#89827B]">
                              {row.canonical_url && (
                                <a
                                  href={row.canonical_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                >
                                  Оригинал
                                </a>
                              )}
                              <span>{row.effective_topic || '—'}</span>
                              <span>{row.language || '—'}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {row.outlet}
                            <span className="block text-[10px] text-[#89827B]">
                              {date(row.effective_date)} · {row.kind}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {row.media_text_quality || 'missing'}
                            <span className="block text-[10px] text-[#89827B]">
                              {row.chunk_count ?? 0} chunks
                            </span>
                          </td>
                          <td className="px-3 py-2">{row.effective_role || '—'}</td>
                          <td className="px-3 py-2">
                            <span
                              className={[
                                'inline-flex border px-1.5 py-0.5 text-[9px] uppercase tracking-wider',
                                row.analysis_status === 'analyzed'
                                  ? 'border-green-200 bg-green-50 text-green-800'
                                  : row.analysis_status === 'failed'
                                    ? 'border-red-200 bg-red-50 text-red-800'
                                    : row.analysis_status === 'stale'
                                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                                      : 'border-gray-200 bg-gray-50 text-gray-600',
                              ].join(' ')}
                            >
                              {row.analysis_status}
                            </span>
                            {row.error_code && (
                              <span className="mt-1 block font-mono text-[9px] text-red-700">
                                {row.error_code}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono">{row.quote_count ?? '—'}</td>
                          <td className="px-3 py-2">
                            {row.latest_run_at ? row.latest_run_at.slice(0, 16).replace('T', ' ') : '—'}
                            {row.latest_run_status && (
                              <span className="block text-[10px] text-[#89827B]">
                                {row.latest_run_status}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {row.latest_run_id && row.latest_run_status === 'failed' && (
                              <button
                                type="button"
                                className="border border-[#D9D3CD] px-2 py-1 text-[10px]"
                                onClick={() => void runAction(row.latest_run_id as string, 'retry')}
                              >
                                Retry
                              </button>
                            )}
                            {row.latest_run_id &&
                              (row.latest_run_status === 'pending' ||
                                row.latest_run_status === 'processing') && (
                                <button
                                  type="button"
                                  className="border border-[#D9D3CD] px-2 py-1 text-[10px]"
                                  onClick={() => void runAction(row.latest_run_id as string, 'cancel')}
                                >
                                  Cancel
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={filters.page}
                  pageSize={filters.pageSize}
                  total={analysisData.total}
                  onPage={(page) => updateFilter('page', page)}
                  onPageSize={(pageSize) => updateFilter('pageSize', pageSize)}
                />
              </section>

              <section className="space-y-3">
                <SectionTitle title="Последние аналитические запуски" />
                {analysisData.runs.length === 0 ? (
                  <Empty>Запусков ещё не было.</Empty>
                ) : (
                  <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                    <table className="w-full min-w-[900px] text-left text-xs">
                      <thead className="bg-[#F7F5F2] text-[#89827B]">
                        <tr>
                          <th className="px-3 py-2">Публикация</th>
                          <th className="px-3 py-2">Статус</th>
                          <th className="px-3 py-2">Attempt</th>
                          <th className="px-3 py-2">Цитат</th>
                          <th className="px-3 py-2">Связей</th>
                          <th className="px-3 py-2">Версия</th>
                          <th className="px-3 py-2">Источник</th>
                          <th className="px-3 py-2">Ошибка</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisData.runs.map((run) => (
                          <tr key={run.id} className="border-t border-[#EEE9E4]">
                            <td className="max-w-[320px] px-3 py-2">
                              <Link
                                className="underline"
                                href={`/admin/media/${run.media_record_id}/analysis`}
                              >
                                {run.title || run.media_record_id}
                              </Link>
                              <span className="block text-[10px] text-[#89827B]">
                                {run.outlet || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2">{run.status}</td>
                            <td className="px-3 py-2 font-mono">
                              {run.attempt}/{run.max_attempts}
                            </td>
                            <td className="px-3 py-2 font-mono">{run.quote_count}</td>
                            <td className="px-3 py-2 font-mono">{run.relation_count}</td>
                            <td className="px-3 py-2 font-mono">{run.analyzer_version}</td>
                            <td className="px-3 py-2">{run.requested_via}</td>
                            <td className="max-w-[260px] px-3 py-2 text-[10px] text-red-700">
                              {run.error_code || '—'}
                              {run.error_detail ? ` · ${run.error_detail}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}

          {section === 'roles' && rolesData && (
            <>
              <SectionTitle
                title="Редакционные роли и участники"
                description="Роль Антона в публикации, типы взаимодействия с изданием, участники и упомянутые организации."
              />
              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                {rolesData.entityTypes.map((item) => (
                  <Metric
                    key={item.entity_type}
                    label={item.entity_type === 'person' ? 'Участники' : 'Организации'}
                    value={number(item.count)}
                  />
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <section className="space-y-3">
                  <SectionTitle title="Тип взаимодействия" />
                  {rolesData.interactions.length === 0 ? (
                    <Empty>Типы взаимодействия ещё не извлечены.</Empty>
                  ) : (
                    <div className="space-y-2">
                      {rolesData.interactions.map((item) => (
                        <Bar
                          key={item.interaction_type}
                          label={item.interaction_type}
                          value={item.publications}
                          max={Math.max(
                            ...rolesData.interactions.map((entry) => entry.publications)
                          )}
                        />
                      ))}
                    </div>
                  )}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Распределение ролей" />
                  {rolesData.roles.length === 0 ? (
                    <Empty>Роли ещё не извлечены.</Empty>
                  ) : (
                    rolesData.roles.map((item) => (
                      <Bar
                        key={item.role}
                        label={item.role}
                        value={item.publications}
                        max={Math.max(...rolesData.roles.map((entry) => entry.publications))}
                        right={`${item.publications} · ${percent((item.confidence ?? 0) * 100)} · ${item.direct_quotes} direct`}
                      />
                    ))
                  )}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Участники и организации" />
                  {rolesData.entities.length === 0 ? (
                    <Empty>Участники ещё не извлечены.</Empty>
                  ) : (
                    rolesData.entities.slice(0, 30).map((item) => (
                      <p
                        key={`${item.entity_type}-${item.name}`}
                        className="flex justify-between border-b border-[#EEE9E4] py-2 text-xs"
                      >
                        <span className="truncate">
                          {item.name}
                          <span className="ml-2 text-[10px] uppercase text-[#89827B]">
                            {item.entity_type}
                          </span>
                        </span>
                        <span className="font-mono">
                          {item.mentions} · {item.publications} публ.
                        </span>
                      </p>
                    ))
                  )}
                </section>
              </div>

              <section className="space-y-3">
                <SectionTitle title="Публикации по ролям" />
                <div className="overflow-x-auto border border-[#E5E1DC] bg-white/70">
                  <table className="w-full min-w-[800px] text-left text-xs">
                    <thead className="bg-[#F7F5F2] text-[#89827B]">
                      <tr>
                        <th className="px-3 py-2">Роль</th>
                        <th className="px-3 py-2">Публикация</th>
                        <th className="px-3 py-2">Издание</th>
                        <th className="px-3 py-2">Дата</th>
                        <th className="px-3 py-2">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rolesData.rolePublications.map((item) => (
                        <tr key={`${item.role}-${item.id}`} className="border-t border-[#EEE9E4]">
                          <td className="px-3 py-2">{item.role}</td>
                          <td className="max-w-[360px] px-3 py-2">
                            <Link
                              className="underline"
                              href={`/admin/media/${item.id}/analysis`}
                            >
                              {item.title}
                            </Link>
                            {item.canonical_url && (
                              <a
                                className="ml-2 text-[10px] text-[#8B1E3F] underline"
                                href={item.canonical_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Оригинал
                              </a>
                            )}
                          </td>
                          <td className="px-3 py-2">{item.outlet}</td>
                          <td className="px-3 py-2">{date(item.effective_date)}</td>
                          <td className="px-3 py-2 font-mono">
                            {percent((item.confidence ?? 0) * 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-3">
                <SectionTitle title="Издания по ролям" />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {rolesData.roleOutlets.slice(0, 30).map((item) => (
                    <p
                      key={`${item.role}-${item.outlet}`}
                      className="flex justify-between border-b border-[#EEE9E4] py-2 text-xs"
                    >
                      <span className="truncate">
                        {item.role} · {item.outlet}
                      </span>
                      <span className="font-mono">{item.publications}</span>
                    </p>
                  ))}
                </div>
              </section>
            </>
          )}

          {section === 'quality' && quality && (
            <>
              <SectionTitle
                title="Качество данных"
                description="Пробелы, ошибки extraction, дубликаты и отсутствующие embeddings."
              />
              <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                <Metric label="Без даты" value={number(quality.counts.missing_dates)} />
                <Metric label="Без полного текста" value={number(quality.counts.without_text)} />
                <Metric
                  label="Ошибки extraction"
                  value={number(quality.counts.extraction_errors)}
                />
                <Metric label="Группы дубликатов" value={number(quality.counts.duplicate_groups)} />
                <Metric label="Цитаты на проверке" value={number(quality.counts.pending_quotes)} />
                <Metric label="Без embeddings" value={number(quality.counts.missing_embeddings)} />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle title="Без даты" />
                  {quality.missingDates.length === 0 ? (
                    <Empty>Нет</Empty>
                  ) : (
                    quality.missingDates.map((item) => (
                      <p key={item.id} className="border-b border-[#EEE9E4] py-2 text-xs">
                        {item.title} · {item.outlet}
                      </p>
                    ))
                  )}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Ошибки extraction" />
                  {quality.extractionErrors.length === 0 ? (
                    <Empty>Нет</Empty>
                  ) : (
                    quality.extractionErrors.map((item) => (
                      <p key={item.id} className="border-b border-[#EEE9E4] py-2 text-xs">
                        {item.title} · {item.media_coverage_status || '—'} ·{' '}
                        {item.media_text_quality || '—'}
                      </p>
                    ))
                  )}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Дубликаты-кандидаты" />
                  {quality.duplicates.length === 0 ? (
                    <Empty>Нет</Empty>
                  ) : (
                    quality.duplicates.map((item) => (
                      <p key={item.content_hash} className="border-b border-[#EEE9E4] py-2 text-xs">
                        {item.count} записей · {item.titles.join(' · ')}
                      </p>
                    ))
                  )}
                </section>
                <section className="space-y-3">
                  <SectionTitle title="Документы без embeddings" />
                  {quality.missingEmbeddings.length === 0 ? (
                    <Empty>Нет</Empty>
                  ) : (
                    quality.missingEmbeddings.map((item) => (
                      <p key={item.id} className="border-b border-[#EEE9E4] py-2 text-xs">
                        {item.title} · {item.chunk_count} chunks
                      </p>
                    ))
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      )}

      {section === 'search' && (
        <div className="space-y-5">
          <SectionTitle
            title="Семантический поиск"
            description="Вопрос по архиву. Ответ строится только на найденных фрагментах; статистика архива здесь не вычисляется."
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              className="min-h-[84px] flex-1 border border-[#D9D3CD] bg-white px-3 py-2 text-sm outline-none focus:border-[#990F3D]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Например: какие публикации связывают контроль интернета с hardware-ограничениями?"
            />
            <button
              type="button"
              className="self-end bg-[#990F3D] px-4 py-2.5 text-sm text-white hover:bg-[#7E0C33] disabled:opacity-40"
              onClick={() => void runSearch()}
              disabled={searching || !query.trim()}
            >
              {searching ? 'Поиск…' : 'Найти'}
            </button>
          </div>

          {search && (
            <div className="space-y-5">
              <div className="border border-[#E5E1DC] bg-white/70 p-4">
                <p className="text-sm leading-relaxed text-[#211F1F]">{search.summary}</p>
                {search.insufficient && (
                  <p className="mt-2 text-xs text-[#8B1E3F]">
                    В архиве недостаточно подтверждающих данных для уверенного ответа.
                  </p>
                )}
              </div>

              {search.facts.length > 0 && (
                <section className="space-y-3">
                  <SectionTitle title="Подтверждающие факты" />
                  {search.facts.map((fact, index) => (
                    <article
                      key={`${fact.documentId}-${index}`}
                      className="border-l-2 border-[#990F3D] pl-4"
                    >
                      <p className="text-sm">{fact.text}</p>
                      <p className="mt-1 text-[10px] text-[#89827B]">
                        {fact.title} · {fact.outlet}
                      </p>
                    </article>
                  ))}
                </section>
              )}

              {search.interpretation.length > 0 && (
                <section className="space-y-2">
                  <SectionTitle title="Интерпретация" />
                  {search.interpretation.map((item, index) => (
                    <p key={index} className="text-xs leading-relaxed text-[#746D66]">
                      {item}
                    </p>
                  ))}
                </section>
              )}

              <section className="space-y-3">
                <SectionTitle title="Публикации и фрагменты" />
                {search.results.length === 0 ? (
                  <Empty>Ничего не найдено.</Empty>
                ) : (
                  search.results.map((hit) => (
                    <article
                      key={`${hit.documentId}-${hit.chunkId}`}
                      className="border border-[#E5E1DC] bg-white/70 p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="font-serif text-lg">{hit.title}</p>
                          <p className="text-[10px] text-[#89827B]">
                            {hit.outlet} · {date(hit.publishedDate)} · {hit.language || '—'} ·{' '}
                            {hit.topic || '—'}
                          </p>
                        </div>
                        <span className="font-mono text-[10px] text-[#89827B]">
                          sim {hit.similarity.toFixed(3)}
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-[#625D58]">
                        {hit.content.slice(0, 900)}
                      </p>
                      {hit.quotes.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {hit.quotes.slice(0, 3).map((quote) => (
                            <p key={quote.id} className="text-xs text-[#625D58]">
                              “{quote.quoteText}” · {quote.quoteType} · {quote.verificationStatus}
                            </p>
                          ))}
                        </div>
                      )}
                      {hit.canonicalUrl && (
                        <a
                          className="mt-3 inline-flex text-[10px] text-[#8B1E3F] underline"
                          href={hit.canonicalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Открыть оригинал
                        </a>
                      )}
                    </article>
                  ))
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[#625D58]">
      <span>
        {total} · стр. {page} / {pages}
      </span>
      <button
        type="button"
        className="border border-[#D9D3CD] px-2 py-1 disabled:opacity-40"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ←
      </button>
      <button
        type="button"
        className="border border-[#D9D3CD] px-2 py-1 disabled:opacity-40"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        →
      </button>
      <select
        className="border border-[#D9D3CD] bg-white px-2 py-1"
        value={pageSize}
        onChange={(event) => onPageSize(Number(event.target.value))}
      >
        {[10, 20, 50, 100].map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  );
}
