'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Kind, MediaRecord } from '@/data/media';
import {
  isMediaReprint,
  originalMediaRelation,
  reprintMediaRelations,
} from '@/lib/mediaClassification';

type Props = {
  records: MediaRecord[];
  archives: { outlet: string; url: string }[];
};

type TypeDef = {
  id: string;
  label: string;
  kinds: Kind[] | null;
  reprintsOnly?: boolean;
  excludeReprints?: boolean;
};

type TimelineNode =
  | { type: 'record'; record: MediaRecord }
  | { type: 'series'; items: MediaRecord[] }
  | { type: 'reprints'; outlet: string; items: MediaRecord[] };

const TYPES: TypeDef[] = [
  { id: 'all', label: 'All', kinds: null },
  {
    id: 'commentary',
    label: 'Commentary',
    kinds: ['quote', 'mention'],
    excludeReprints: true,
  },
  { id: 'talks', label: 'Interviews & broadcasts', kinds: ['interview', 'radio', 'video'] },
  { id: 'columns', label: 'Columns', kinds: ['column', 'blog'] },
  { id: 'reprints', label: 'Reprints', kinds: null, reprintsOnly: true },
  { id: 'profiles', label: 'Profiles', kinds: ['profile'] },
];

const KIND_LABEL: Record<Kind, string> = {
  quote: 'Commentary',
  mention: 'Mention',
  interview: 'Interview',
  radio: 'Radio',
  video: 'Video',
  column: 'Column',
  blog: 'Blog',
  profile: 'Profile',
};

const PRESENCE_LABEL: Record<Kind, string> = {
  quote: 'Quoted expert',
  mention: 'Mention',
  interview: 'Interview',
  radio: 'Radio',
  video: 'Video',
  column: 'Author column',
  blog: 'Blog',
  profile: 'Profile',
};

const PRESTIGE = [
  'Le Monde',
  'The New York Times',
  'The Washington Post',
  'BBC News',
  'Deutsche Welle',
  'The Christian Science Monitor',
  'Euronews',
  'DIE ZEIT',
  'Rzeczpospolita',
  'The Art Newspaper',
  'Coda Story',
  'ABC News',
  'Deutschlandfunk',
  'The Moscow Times',
  'Радио Свобода',
  'Current Time',
  'Новая газета',
  'Эхо Москвы',
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PAGE_SIZE = 30;
const SERIES_OUTLET = 'Новая газета';
const SERIES_MIN = 4;
const REPRESENTATIVE_OUTLETS = 6;

const KIND_SCORE: Record<Kind, number> = {
  column: 5,
  interview: 5,
  radio: 4,
  video: 4,
  quote: 4,
  blog: 3,
  mention: 2,
  profile: 1,
};

function prestigeGroup(outlet: string): string | null {
  return (
    PRESTIGE.find((publication) => outlet === publication || outlet.startsWith(publication)) ?? null
  );
}

function prestigeIndex(outlet: string): number {
  const group = prestigeGroup(outlet);
  return group ? PRESTIGE.indexOf(group) : Number.MAX_SAFE_INTEGER;
}

function recordTimestamp(date: string): number {
  const normalized = date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function editorialScore(record: MediaRecord, latestTimestamp: number): number {
  const rank = prestigeIndex(record.outlet);
  // PRESTIGE encodes editorial recognition. Unranked outlets still compete on
  // recency, format and verified evidence, but cannot outrank the archive's
  // established international publications by quote volume alone.
  const prestige = rank === Number.MAX_SAFE_INTEGER ? 0 : Math.max(10, 42 - rank * 2);
  const verifiedQuotes = Math.min(record.verifiedQuotes?.length ?? 0, 3);
  const ageInYears = latestTimestamp
    ? Math.max(0, (latestTimestamp - recordTimestamp(record.date)) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;
  const recency = Math.max(0, 6 - ageInYears);
  const quality = record.textQuality === 'high' ? 3 : record.textQuality === 'medium' ? 1 : 0;
  const topicConfidence = record.derivedTopic ? 2 : 0;

  return (
    prestige + verifiedQuotes * 2 + recency + quality + topicConfidence + KIND_SCORE[record.kind]
  );
}

function formatDate(date: string): string {
  const [, month, day] = date.split('-');
  if (!month) return '—';

  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return date;

  return day ? `${Number(day)} ${monthName}` : monthName;
}

function compareRecords(a: MediaRecord, b: MediaRecord): number {
  const dateOrder = b.date.localeCompare(a.date);
  if (dateOrder !== 0) return dateOrder;
  return a.title.localeCompare(b.title);
}

function presenceLabel(record: MediaRecord): string {
  if (isMediaReprint(record)) return 'Reprint';
  if (reprintMediaRelations(record).length > 0) return 'Original publication';
  return PRESENCE_LABEL[record.kind];
}

export default function MediaArchive({ records, archives }: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? '/media';
  const router = useRouter();

  const paramsString = searchParams?.toString() ?? '';

  const params = useMemo(() => new URLSearchParams(paramsString), [paramsString]);

  const type = params.get('type') ?? 'all';
  const lang = params.get('lang') ?? '';
  const topic = params.get('topic') ?? '';
  const year = params.get('year') ?? '';
  const outlet = params.get('outlet') ?? '';
  const queryFromUrl = params.get('q') ?? '';
  const quotesOnly = params.get('quotes') === '1';

  const [query, setQuery] = useState(queryFromUrl);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [searchMode, setSearchMode] = useState<'archive' | 'semantic'>('archive');
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticResults, setSemanticResults] = useState<
    Array<{
      slug: string;
      title: string;
      outlet: string;
      date: string;
      lang: string;
      kind: string;
      topic: string;
      summary: string;
      url: string;
      href: string;
      quotes: Array<{
        id: string;
        text: string;
        type: string;
        language: string | null;
        translation?: string | null;
      }>;
      related: Array<{ slug: string; title: string; outlet: string; relationType: string }>;
    }>
  >([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticMessage, setSemanticMessage] = useState('');

  const updateUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());

      Object.entries(patch).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });

      const queryString = next.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const toggleFilter = useCallback(
    (key: string, current: string, value: string) => {
      updateUrl({ [key]: current === value ? null : value });
    },
    [updateUrl]
  );

  useEffect(() => {
    setQuery(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    if (query === queryFromUrl) return;

    const timer = setTimeout(() => {
      updateUrl({ q: query.trim() || null });
    }, 250);

    return () => clearTimeout(timer);
  }, [query, queryFromUrl, updateUrl]);

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [type, lang, topic, year, outlet, queryFromUrl, quotesOnly]);

  const stats = useMemo(() => {
    const outletCounts = new Map<string, number>();

    records.forEach((record) => {
      outletCounts.set(record.outlet, (outletCounts.get(record.outlet) ?? 0) + 1);
    });

    const outlets = [...outletCounts.keys()].sort((a, b) => {
      const rankOrder = prestigeIndex(a) - prestigeIndex(b);
      if (rankOrder !== 0) return rankOrder;

      return (outletCounts.get(b) ?? 0) - (outletCounts.get(a) ?? 0) || a.localeCompare(b);
    });

    const years = records.map((record) => Number(record.date.slice(0, 4))).filter(Number.isFinite);

    return {
      total: records.length,
      own: records.filter((record) => record.kind === 'column' || record.kind === 'blog').length,
      mentions: records.filter((record) => record.kind !== 'column' && record.kind !== 'blog').length,
      outlets,
      languages: [...new Set(records.map((record) => record.lang))].sort(),
      topics: [...new Set(records.map((record) => record.derivedTopic || record.topic))].sort(),
      minYear: years.length ? Math.min(...years) : new Date().getFullYear(),
      maxYear: years.length ? Math.max(...years) : new Date().getFullYear(),
    };
  }, [records]);

  const representativeOutlets = useMemo(() => {
    const seen = new Set<string>();
    const selected: string[] = [];

    for (const publication of stats.outlets) {
      const group = prestigeGroup(publication) ?? publication;
      if (seen.has(group)) continue;

      seen.add(group);
      selected.push(publication);

      if (selected.length === REPRESENTATIVE_OUTLETS) break;
    }

    return selected;
  }, [stats.outlets]);

  const collections = useMemo(() => {
    const topics = ['Internet & Censorship', 'AI & Tech', 'Art & Culture', 'Fintech & Crypto'];
    const byTopic = new Map<string, MediaRecord[]>();
    const latestTimestamp = Math.max(...records.map((record) => recordTimestamp(record.date)), 0);

    for (const record of records) {
      if (isMediaReprint(record)) continue;
      const topicName = record.derivedTopic || record.topic;
      const list = byTopic.get(topicName) || [];
      list.push(record);
      byTopic.set(topicName, list);
    }

    return topics
      .map((topicName) => {
        const ranked = [...(byTopic.get(topicName) || [])].sort((left, right) => {
          const scoreOrder =
            editorialScore(right, latestTimestamp) - editorialScore(left, latestTimestamp);
          return scoreOrder || compareRecords(left, right);
        });

        if (ranked.length === 0) return null;

        const first = ranked[0];
        const firstGroup = prestigeGroup(first.outlet) ?? first.outlet;
        const second =
          ranked.find((record) => (prestigeGroup(record.outlet) ?? record.outlet) !== firstGroup) ??
          ranked[1];

        return {
          topic: topicName,
          records: second ? [first, second] : [first],
        };
      })
      .filter(
        (collection): collection is { topic: string; records: MediaRecord[] } => collection !== null
      );
  }, [records]);

  const runSemanticSearch = useCallback(async () => {
    const value = semanticQuery.trim();
    if (!value) return;

    setSemanticLoading(true);
    setSemanticMessage('');

    try {
      const response = await fetch('/api/media/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: value,
          filters: { topic, language: lang, outlet },
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Search is temporarily unavailable.');
      }

      setSemanticResults(Array.isArray(data.results) ? data.results : []);
      setSemanticMessage(
        data.summary ||
          (Array.isArray(data.results) && data.results.length === 0
            ? 'No publications match this question.'
            : '')
      );
    } catch (error) {
      setSemanticResults([]);
      setSemanticMessage(
        error instanceof Error ? error.message : 'Search is temporarily unavailable.'
      );
    } finally {
      setSemanticLoading(false);
    }
  }, [lang, outlet, semanticQuery, topic]);

  const matches = useCallback(
    (record: MediaRecord, ignoreYear = false) => {
      const selectedType = TYPES.find((item) => item.id === type);
      const recordIsReprint = isMediaReprint(record);

      if (selectedType?.kinds && !selectedType.kinds.includes(record.kind)) {
        return false;
      }

      if (selectedType?.reprintsOnly && !recordIsReprint) return false;
      if (selectedType?.excludeReprints && recordIsReprint) return false;

      if (lang && record.lang !== lang) return false;
      if (topic && (record.derivedTopic || record.topic) !== topic) return false;
      if (outlet && record.outlet !== outlet) return false;
      if (quotesOnly && !record.verifiedQuotes?.length) return false;

      if (!ignoreYear && year && record.date.slice(0, 4) !== year) {
        return false;
      }

      const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

      if (words.length) {
        const searchableText = [
          record.title,
          record.outlet,
          record.program ?? '',
          record.summary,
          record.topic,
          record.derivedTopic ?? '',
          (record.subtopics ?? []).join(' '),
          record.lang,
          record.date,
          KIND_LABEL[record.kind],
          presenceLabel(record),
          ...(record.related ?? []).map(
            (related) => `${related.outlet} ${related.title} ${related.relationType}`
          ),
          ...(record.verifiedQuotes ?? []).map((quote) => quote.text),
        ]
          .join(' ')
          .toLocaleLowerCase();

        if (!words.every((word) => searchableText.includes(word))) {
          return false;
        }
      }

      return true;
    },
    [type, lang, topic, outlet, year, query, quotesOnly]
  );

  const filtered = useMemo(
    () => records.filter((record) => matches(record)).sort(compareRecords),
    [records, matches]
  );

  const yearOptions = useMemo(() => {
    const counts = new Map<number, number>();

    records
      .filter((record) => matches(record, true))
      .forEach((record) => {
        const recordYear = Number(record.date.slice(0, 4));
        counts.set(recordYear, (counts.get(recordYear) ?? 0) + 1);
      });

    const years: number[] = [];

    for (let y = stats.minYear; y <= stats.maxYear; y += 1) {
      years.push(y);
    }

    return years
      .map((yearValue) => ({
        year: yearValue,
        count: counts.get(yearValue) ?? 0,
      }))
      .reverse();
  }, [records, matches, stats.minYear, stats.maxYear]);

  const activeFilters = Boolean(
    queryFromUrl || lang || topic || year || outlet || type !== 'all' || quotesOnly
  );

  const resetFilters = () => {
    setQuery('');
    setSemanticQuery('');
    setSemanticResults([]);
    setSemanticMessage('');
    setVisibleLimit(PAGE_SIZE);
    router.replace(pathname, { scroll: false });
  };

  const isOverview = !query.trim() && !outlet && type !== 'columns';

  const visibleRecords = useMemo(() => filtered.slice(0, visibleLimit), [filtered, visibleLimit]);

  const groups = useMemo(() => {
    const byYear = new Map<string, MediaRecord[]>();

    visibleRecords.forEach((record) => {
      const recordYear = record.date.slice(0, 4);
      const existing = byYear.get(recordYear);

      if (existing) existing.push(record);
      else byYear.set(recordYear, [record]);
    });

    return [...byYear.entries()]
      .sort(([yearA], [yearB]) => Number(yearB) - Number(yearA))
      .map(([recordYear, yearRecords]) => {
        const seriesItems = yearRecords.filter(
          (record) =>
            record.kind === 'column' && record.outlet === SERIES_OUTLET && !isMediaReprint(record)
        );

        const collapseSeries = isOverview && seriesItems.length >= SERIES_MIN;

        // Reprints are grouped separately from original columns and
        // commentary. Grouping by outlet keeps a syndicated article in a
        // single collapsed row instead of presenting it as a new mention.
        const reprintGroups = new Map<string, MediaRecord[]>();
        if (isOverview) {
          yearRecords.forEach((record) => {
            if (!isMediaReprint(record)) return;
            const items = reprintGroups.get(record.outlet) ?? [];
            items.push(record);
            reprintGroups.set(record.outlet, items);
          });
        }

        const nodes: TimelineNode[] = [];
        const addedReprintOutlets = new Set<string>();
        let seriesAdded = false;

        yearRecords.forEach((record) => {
          if (isOverview && isMediaReprint(record)) {
            if (!addedReprintOutlets.has(record.outlet)) {
              nodes.push({
                type: 'reprints',
                outlet: record.outlet,
                items: reprintGroups.get(record.outlet) ?? [record],
              });
              addedReprintOutlets.add(record.outlet);
            }
            return;
          }

          const belongsToSeries =
            collapseSeries && record.kind === 'column' && record.outlet === SERIES_OUTLET;

          if (!belongsToSeries) {
            nodes.push({ type: 'record', record });
          } else if (!seriesAdded) {
            nodes.push({ type: 'series', items: seriesItems });
            seriesAdded = true;
          }
        });

        return {
          year: recordYear,
          count: yearRecords.length,
          nodes,
        };
      });
  }, [visibleRecords, isOverview]);

  return (
    <div className="ma">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="ma-hero">
        <h1 className="ma-h1">Public record & commentary</h1>

        <p className="ma-lede">
          Analytical columns, international citations, interviews and commentary on technology and
          culture.
        </p>

        <p className="ma-stats-line" aria-label="Archive summary">
          <span>
            <strong>{stats.total}</strong> records
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong>{stats.own}</strong> own
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong>{stats.mentions}</strong> mentions
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong>{stats.outlets.length}</strong> publications
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong>{stats.languages.length}</strong> languages
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong>{stats.maxYear - stats.minYear + 1}</strong> years
          </span>
        </p>

        <div className="ma-publications" aria-label="Representative publications">
          {representativeOutlets.map((publication, index) => (
            <span key={publication} className="ma-publication">
              {index > 0 && (
                <span className="ma-publication-sep" aria-hidden="true">
                  ·
                </span>
              )}
              <button
                type="button"
                className="ma-outlet-btn"
                aria-pressed={outlet === publication}
                onClick={() => toggleFilter('outlet', outlet, publication)}
              >
                {publication}
              </button>
            </span>
          ))}
        </div>
      </header>

      {collections.length > 0 && (
        <section className="ma-collections" aria-label="Thematic collections">
          <div className="ma-collections-head">
            <h2 className="ma-section-title">Thematic collections</h2>
            <span className="ma-small-note">Selected publications by topic</span>
          </div>
          <div className="ma-collection-grid">
            {collections.map((collection) => (
              <article key={collection.topic} className="ma-collection">
                <h3>{collection.topic}</h3>
                <ul>
                  {collection.records.map((record) => (
                    <li key={record.slug}>
                      <Link href={`/media/record/${encodeURIComponent(record.slug)}`}>
                        {record.title}
                      </Link>
                      <span className="ma-collection-meta">
                        {record.outlet} · {formatDate(record.date)}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="ma-collection-more"
                  onClick={() => updateUrl({ topic: collection.topic, q: null })}
                >
                  View collection →
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="ma-filters" aria-label="Filter media archive">
        <form
          className="ma-search-row"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (searchMode === 'semantic') void runSemanticSearch();
          }}
        >
          <label className="ma-search">
            <span className="ma-sr">
              {searchMode === 'semantic' ? 'Search by meaning' : 'Search the media archive'}
            </span>
            <span className="ma-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              type="search"
              value={searchMode === 'semantic' ? semanticQuery : query}
              placeholder={
                searchMode === 'semantic'
                  ? 'e.g. comments about data centres, AI sovereignty'
                  : 'Search title, publication, topic, date…'
              }
              aria-label={
                searchMode === 'semantic' ? 'Semantic search query' : 'Search the media archive'
              }
              onChange={(event) =>
                searchMode === 'semantic'
                  ? setSemanticQuery(event.target.value)
                  : setQuery(event.target.value)
              }
            />
            {(searchMode === 'semantic' ? semanticQuery : query) && (
              <button
                className="ma-clear-search"
                type="button"
                aria-label={searchMode === 'semantic' ? 'Clear semantic search' : 'Clear search'}
                onClick={() => {
                  if (searchMode === 'semantic') {
                    setSemanticQuery('');
                    setSemanticResults([]);
                    setSemanticMessage('');
                  } else {
                    setQuery('');
                  }
                }}
              >
                ×
              </button>
            )}
          </label>

          {searchMode === 'semantic' && (
            <button
              type="submit"
              className="ma-search-submit"
              disabled={semanticLoading || !semanticQuery.trim()}
            >
              {semanticLoading ? 'Searching…' : 'Search'}
            </button>
          )}

          <button
            type="button"
            className="ma-search-mode"
            aria-pressed={searchMode === 'semantic'}
            onClick={() =>
              setSearchMode((current) => (current === 'archive' ? 'semantic' : 'archive'))
            }
          >
            {searchMode === 'semantic' ? 'Archive search' : 'Search by meaning'}
          </button>
        </form>

        <div className="ma-filter-row">
          <label className="ma-field">
            <span>Format</span>
            <select
              value={type}
              onChange={(event) =>
                updateUrl({ type: event.target.value === 'all' ? null : event.target.value })
              }
            >
              {TYPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="ma-field">
            <span>Language</span>
            <select value={lang} onChange={(event) => updateUrl({ lang: event.target.value })}>
              <option value="">All languages</option>
              {stats.languages.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>

          <label className="ma-field">
            <span>Topic</span>
            <select value={topic} onChange={(event) => updateUrl({ topic: event.target.value })}>
              <option value="">All topics</option>
              {stats.topics.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="ma-field">
            <span>Publication</span>
            <select value={outlet} onChange={(event) => updateUrl({ outlet: event.target.value })}>
              <option value="">All publications</option>
              {stats.outlets.map((publication) => (
                <option key={publication} value={publication}>
                  {publication}
                </option>
              ))}
            </select>
          </label>

          <label className="ma-field">
            <span>Year</span>
            <select value={year} onChange={(event) => updateUrl({ year: event.target.value })}>
              <option value="">All years</option>
              {yearOptions.map((option) => (
                <option key={option.year} value={option.year} disabled={option.count === 0}>
                  {option.year} ({option.count})
                </option>
              ))}
            </select>
          </label>

          <label className="ma-toggle">
            <input
              type="checkbox"
              checked={quotesOnly}
              onChange={() => updateUrl({ quotes: quotesOnly ? null : '1' })}
            />
            <span>Verified quotes</span>
          </label>
        </div>

        <div className="ma-results-line">
          <p className="ma-count" aria-live="polite">
            <strong>{filtered.length}</strong> {filtered.length === 1 ? 'record' : 'records'}
            {filtered.length > visibleRecords.length && (
              <span> · showing {visibleRecords.length}</span>
            )}
          </p>

          {activeFilters && (
            <button type="button" className="ma-reset" onClick={resetFilters}>
              Clear filters ×
            </button>
          )}
        </div>
      </section>

      {searchMode === 'semantic' && (
        <section className="ma-semantic-results" aria-label="Semantic search results">
          {semanticMessage && semanticResults.length === 0 && (
            <p className="ma-semantic-summary" role="status">
              {semanticMessage}
            </p>
          )}

          {semanticResults.length > 0 && (
            <div aria-live="polite">
              <p className="ma-semantic-summary">{semanticMessage}</p>
              <ol>
                {semanticResults.map((result) => (
                  <li key={result.slug}>
                    <div>
                      <Link href={result.href}>{result.title}</Link>
                      <span className="ma-semantic-meta">
                        {result.outlet} · {result.date} ·{' '}
                        {PRESENCE_LABEL[result.kind as Kind] || result.kind}
                      </span>
                    </div>
                    {result.quotes.slice(0, 2).map((quote) => (
                      <blockquote key={quote.id} className="ma-semantic-quote">
                        <span className="ma-quote-label">
                          {quote.type === 'direct_quote'
                            ? 'Verified direct quote'
                            : quote.type === 'indirect_quote'
                              ? 'Verified paraphrase'
                              : 'Verified mention'}
                        </span>
                        “{quote.text}”
                        {quote.translation && (
                          <span className="ma-quote-translation">{quote.translation}</span>
                        )}
                      </blockquote>
                    ))}
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ma-semantic-link"
                    >
                      Original publication ↗
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <section className="ma-timeline" aria-label="Media timeline">
        {groups.length === 0 ? (
          <div className="ma-empty">
            <p className="ma-empty-title">No matching records</p>
            <p>Try another search or clear the selected filters.</p>
            {activeFilters && (
              <button type="button" className="ma-reset" onClick={resetFilters}>
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          groups.map((group) => (
            <section
              key={group.year}
              className="ma-year"
              id={`y${group.year}`}
              aria-labelledby={`heading-${group.year}`}
            >
              <div className="ma-year-head">
                <h2 id={`heading-${group.year}`}>{group.year}</h2>
                <span>
                  {group.count} {group.count === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              <ol className="ma-list">
                {group.nodes.map((node, index) => {
                  if (node.type === 'series') {
                    return (
                      <li key={`series-${group.year}-${index}`} className="ma-row">
                        <div className="ma-date">{node.items.length}×</div>

                        <details className="ma-series">
                          <summary>
                            <span className="ma-meta">
                              <span className="ma-outlet">{SERIES_OUTLET}</span>
                              <span>Author column series</span>
                            </span>

                            <span className="ma-title">
                              «Виртуальный Меркуров»
                              <em> · {node.items.length} columns</em>
                            </span>

                            <span className="ma-sum">
                              Internet policy, AI, platforms and digital culture.
                            </span>
                          </summary>

                          <ol className="ma-mini">
                            {node.items.map((column) => (
                              <li key={column.slug}>
                                <time dateTime={column.date}>{formatDate(column.date)}</time>
                                <a href={column.url} target="_blank" rel="noopener noreferrer">
                                  {column.title}
                                  <span aria-hidden="true"> ↗</span>
                                </a>
                              </li>
                            ))}
                          </ol>
                        </details>
                      </li>
                    );
                  }

                  if (node.type === 'reprints') {
                    const single = node.items.length === 1 ? node.items[0] : null;

                    return (
                      <li key={`reprints-${group.year}-${node.outlet}-${index}`} className="ma-row">
                        <div className="ma-date">{node.items.length}×</div>

                        <details className="ma-series">
                          <summary>
                            <span className="ma-meta">
                              <span className="ma-outlet">{node.outlet}</span>
                              <span>Reprint series</span>
                            </span>

                            <span className="ma-title">
                              {single ? single.title : `${node.outlet} reprints`}
                              <em>
                                {' '}
                                · {node.items.length}{' '}
                                {node.items.length === 1 ? 'reprint' : 'reprints'}
                              </em>
                            </span>

                            <span className="ma-sum">
                              Republished material. Each entry links to the original publication.
                            </span>
                          </summary>

                          <ol className="ma-mini">
                            {node.items.map((item) => {
                              const original = originalMediaRelation(item);

                              return (
                                <li key={item.slug}>
                                  <time dateTime={item.date}>{formatDate(item.date)}</time>
                                  <div>
                                    <Link href={`/media/record/${encodeURIComponent(item.slug)}`}>
                                      {item.title}
                                    </Link>
                                    {original && (
                                      <span className="ma-reprint-source">
                                        Reprint of{' '}
                                        <Link
                                          href={`/media/record/${encodeURIComponent(original.slug)}`}
                                        >
                                          {original.outlet}: {original.title}
                                        </Link>
                                      </span>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                        </details>
                      </li>
                    );
                  }

                  const record = node.record;

                  return (
                    <li key={record.slug} className="ma-row">
                      <time className="ma-date" dateTime={record.date}>
                        {formatDate(record.date)}
                        <span className="ma-full-date">{record.date.slice(0, 4)}</span>
                      </time>

                      <div className="ma-main">
                        <p className="ma-meta">
                          <span className="ma-outlet">{record.outlet}</span>

                          {record.program && <span>{record.program}</span>}

                          <span className="ma-tag">{record.lang}</span>
                          <span className="ma-kind">{presenceLabel(record)}</span>
                        </p>

                        <Link
                          className="ma-title"
                          href={`/media/record/${encodeURIComponent(record.slug)}`}
                        >
                          {record.title}
                        </Link>

                        {record.summary && <p className="ma-sum">{record.summary}</p>}

                        {record.verifiedQuotes && record.verifiedQuotes.length > 0 && (
                          <div className="ma-verified">
                            {record.verifiedQuotes.slice(0, 2).map((quote) => (
                              <blockquote key={quote.id} className="ma-verified-quote">
                                <span className="ma-quote-label">
                                  {quote.type === 'direct_quote'
                                    ? 'Verified direct quote'
                                    : quote.type === 'indirect_quote'
                                      ? 'Verified paraphrase'
                                      : 'Verified mention'}
                                </span>
                                “{quote.text}”
                                {quote.translation && (
                                  <span className="ma-quote-translation">{quote.translation}</span>
                                )}
                              </blockquote>
                            ))}
                          </div>
                        )}

                        {record.related && record.related.length > 0 && (
                          <p className="ma-related">
                            <span>Related:</span>{' '}
                            {record.related.slice(0, 3).map((related, index) => (
                              <span key={`${related.slug}-${related.relationType}`}>
                                {index > 0 && ' · '}
                                <Link href={`/media/record/${encodeURIComponent(related.slug)}`}>
                                  {related.outlet}: {related.title}
                                </Link>
                                {related.role === 'original' && <em> · original source</em>}
                                {related.role === 'reprint' && <em> · reprint</em>}
                              </span>
                            ))}
                          </p>
                        )}

                        <div className="ma-record-foot">
                          <span>{record.derivedTopic || record.topic}</span>
                          <a href={record.url} target="_blank" rel="noopener noreferrer">
                            Original publication
                            <span className="ma-external" aria-hidden="true">
                              {' '}
                              ↗
                            </span>
                          </a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}

        {visibleRecords.length < filtered.length && (
          <div className="ma-load-more">
            <p>
              Showing {visibleRecords.length} of {filtered.length} records
            </p>
            <button
              type="button"
              className="ma-load-button"
              onClick={() =>
                setVisibleLimit((current) => Math.min(current + PAGE_SIZE, filtered.length))
              }
            >
              Load {Math.min(PAGE_SIZE, filtered.length - visibleRecords.length)} more
              <span aria-hidden="true"> ↓</span>
            </button>
          </div>
        )}
      </section>

      {archives.length > 0 && (
        <details className="ma-author-archives">
          <summary>Author archives</summary>
          <div>
            {archives.map((archive) => (
              <a key={archive.url} href={archive.url} target="_blank" rel="noopener noreferrer">
                {archive.outlet} ↗
              </a>
            ))}
          </div>
        </details>
      )}

      <footer className="ma-footer-note">
        <span>MEDIA ARCHIVE</span>
        <span>ANTON MERKUROV</span>
      </footer>
    </div>
  );
}

const CSS = `
.ma {
  --ma-bg: #fff;
  --ma-fg: #171715;
  --ma-muted: #77766f;
  --ma-line: #e6e4df;
  --ma-accent: #a53a27;
  --ma-serif: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  --ma-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: clamp(42px, 7vw, 100px) clamp(18px, 4vw, 48px) 64px;
  color: var(--ma-fg);
  background: var(--ma-bg);
  font-family: Arial, Helvetica, sans-serif;
  box-sizing: border-box;
}

.ma *,
.ma *::before,
.ma *::after {
  box-sizing: border-box;
}

:where(.ma) button,
:where(.ma) input {
  font: inherit;
}

:where(.ma) button {
  color: inherit;
}

.ma button:focus-visible,
.ma a:focus-visible,
.ma input:focus-visible,
.ma summary:focus-visible {
  outline: 2px solid var(--ma-accent);
  outline-offset: 4px;
}

.ma a {
  color: inherit;
  text-decoration: none;
}

.ma-hero {
  padding-bottom: clamp(18px, 2vw, 22px);
}

.ma-h1 {
  max-width: 900px;
  margin: 0;
  font-family: var(--ma-serif);
  font-size: clamp(36px, 3.2vw, 44px);
  font-weight: 400;
  line-height: 1;
  letter-spacing: -.04em;
}

.ma-lede {
  max-width: 760px;
  margin: 8px 0 0;
  color: var(--ma-muted);
  font-size: 14px;
  line-height: 1.55;
}

.ma-stats-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 9px;
  margin: 12px 0 0;
  color: var(--ma-muted);
  font-size: 12px;
  line-height: 1.5;
}

.ma-stats-line strong {
  color: var(--ma-fg);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ma-stats-line > span[aria-hidden="true"] {
  color: var(--ma-line);
}

.ma-publications {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin-top: 8px;
  font-family: var(--ma-serif);
  font-size: 14px;
  line-height: 1.4;
}

.ma-publication {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
}

.ma-publication-sep {
  color: var(--ma-line);
}

.ma-outlet-btn {
  min-height: 0;
  padding: 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--ma-muted);
  font: inherit;
  line-height: 1.4;
  cursor: pointer;
  transition: color .15s ease, border-color .15s ease;
}

.ma-outlet-btn:hover,
.ma-outlet-btn[aria-pressed="true"] {
  color: var(--ma-fg);
  border-bottom-color: var(--ma-accent);
}

.ma-small-note {
  color: var(--ma-muted);
  font-size: 11px;
}

.ma-filters {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 24px;
  padding: 20px 0 14px;
  border-top: 1px solid var(--ma-line);
  border-bottom: 1px solid var(--ma-line);
}

.ma-search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}

.ma-search {
  display: flex;
  flex: 1 1 300px;
  align-items: center;
  gap: 12px;
  min-width: 0;
  border-bottom: 1px solid var(--ma-fg);
}

.ma-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.ma-search-icon {
  color: var(--ma-muted);
  font-family: var(--ma-serif);
  font-size: 24px;
  line-height: 1;
}

.ma-search input {
  width: 100%;
  min-width: 0;
  padding: 10px 0;
  border: 0;
  border-radius: 0;
  outline: none;
  background: transparent;
  color: var(--ma-fg);
  font-size: 15px;
}

.ma-search input::placeholder {
  color: #99978f;
}

.ma-search input:focus-visible {
  outline: none;
}

.ma-clear-search {
  flex: 0 0 auto;
  padding: 4px 0 4px 8px;
  border: 0;
  background: transparent;
  color: var(--ma-muted);
  font-size: 23px;
  cursor: pointer;
}

.ma-search-submit {
  flex: 0 0 auto;
  padding: 8px 14px;
  border: 1px solid var(--ma-fg);
  border-radius: 0;
  background: var(--ma-fg);
  color: #fff;
  font: 500 9px/1.4 var(--ma-mono);
  letter-spacing: .08em;
  text-transform: uppercase;
  cursor: pointer;
}

.ma-search-submit:disabled {
  border-color: var(--ma-line);
  background: transparent;
  color: var(--ma-muted);
  cursor: default;
}

.ma-search-mode {
  flex: 0 0 auto;
  min-height: 0;
  padding: 4px 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--ma-muted);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}

.ma-search-mode:hover,
.ma-search-mode[aria-pressed="true"] {
  color: var(--ma-fg);
  border-bottom-color: var(--ma-accent);
}

.ma-filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 18px;
}

.ma-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.ma-field > span {
  color: var(--ma-muted);
  font-size: 10px;
  line-height: 1.4;
}

.ma-field select {
  max-width: 210px;
  padding: 4px 20px 4px 0;
  border: 0;
  border-bottom: 1px solid var(--ma-line);
  border-radius: 0;
  background: transparent;
  color: var(--ma-fg);
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
}

.ma-field select:hover,
.ma-field select:focus {
  border-bottom-color: var(--ma-fg);
}

.ma-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 0;
  color: var(--ma-fg);
  font-size: 11px;
  cursor: pointer;
}

.ma-toggle input {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--ma-fg);
}

.ma-results-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-top: 4px;
}

.ma-count {
  margin: 0;
  color: var(--ma-muted);
  font: 10px/1.6 var(--ma-mono);
}

.ma-count strong {
  color: var(--ma-fg);
  font-weight: 600;
}

.ma-reset {
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ma-accent);
  font-size: 11px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.ma-timeline {
  min-width: 0;
}

.ma-year {
  margin-top: 48px;
  content-visibility: auto;
  contain-intrinsic-size: auto 600px;
}

.ma-year-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 13px 0 12px;
  border-bottom: 1px solid var(--ma-fg);
  background: var(--ma-bg);
}

.ma-year-head h2 {
  margin: 0;
  font-family: var(--ma-serif);
  font-size: clamp(34px, 5vw, 52px);
  font-weight: 400;
  line-height: 1;
  letter-spacing: -.035em;
  font-variant-numeric: tabular-nums;
}

.ma-year-head span {
  color: var(--ma-muted);
  font: 10px/1.5 var(--ma-mono);
}

.ma-list,
.ma-mini {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ma-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 24px;
  padding: 24px 0 27px;
  border-bottom: 1px solid var(--ma-line);
}

.ma-date {
  display: block;
  padding-top: 4px;
  color: var(--ma-muted);
  font: 10px/1.7 var(--ma-mono);
  font-variant-numeric: tabular-nums;
}

.ma-full-date {
  display: block;
  color: #a09e96;
  font-size: 9px;
}

.ma-main,
.ma-series {
  min-width: 0;
}

.ma-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 11px;
  margin: 0 0 9px;
  color: var(--ma-muted);
  font-size: 10px;
  line-height: 1.5;
}

.ma-outlet {
  color: var(--ma-fg);
  font-weight: 600;
}

.ma-tag,
.ma-kind {
  color: var(--ma-muted);
  font: 9px/1.4 var(--ma-mono);
  letter-spacing: .035em;
  text-transform: uppercase;
}

.ma-tag {
  padding: 2px 5px;
  border: 1px solid var(--ma-line);
}

.ma-title {
  display: inline;
  font-family: var(--ma-serif);
  font-size: clamp(21px, 2.7vw, 29px);
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: -.015em;
  overflow-wrap: anywhere;
  transition: color .15s ease;
}

.ma-title:hover {
  color: var(--ma-accent);
}

.ma-external {
  display: inline-block;
  margin-left: 7px;
  color: var(--ma-muted);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12px;
  vertical-align: .3em;
}

.ma-sum {
  max-width: 680px;
  margin: 10px 0 0;
  color: var(--ma-muted);
  font-size: 12px;
  line-height: 1.7;
}

.ma-record-foot {
  margin-top: 12px;
  color: #929087;
  font: 9px/1.6 var(--ma-mono);
}

.ma-series summary {
  position: relative;
  display: block;
  padding-right: 34px;
  cursor: pointer;
  list-style: none;
}

.ma-series summary::-webkit-details-marker {
  display: none;
}

.ma-series summary::after {
  position: absolute;
  top: 0;
  right: 2px;
  color: var(--ma-muted);
  content: '+';
  font-family: var(--ma-serif);
  font-size: 26px;
  font-weight: 300;
  line-height: 1;
}

.ma-series[open] summary::after {
  content: '−';
}

.ma-series summary:hover .ma-title {
  color: var(--ma-accent);
}

.ma-title em {
  color: var(--ma-muted);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
  font-style: normal;
  letter-spacing: 0;
}

.ma-mini {
  display: grid;
  gap: 0;
  margin-top: 18px;
}

.ma-mini li {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: baseline;
  gap: 12px;
  padding: 11px 0;
  border-top: 1px solid var(--ma-line);
  font-size: 12px;
  line-height: 1.6;
}

.ma-mini time {
  color: var(--ma-muted);
  font: 9px/1.6 var(--ma-mono);
}

.ma-mini a {
  overflow-wrap: anywhere;
}

.ma-mini a:hover {
  color: var(--ma-accent);
}

.ma-reprint-source {
  display: block;
  margin-top: 3px;
  color: var(--ma-muted);
  font: 9px/1.6 var(--ma-mono);
}

.ma-reprint-source a {
  color: var(--ma-fg);
  text-decoration: underline;
  text-decoration-color: var(--ma-line);
  text-underline-offset: 3px;
}

.ma-reprint-source a:hover {
  color: var(--ma-accent);
}

.ma-empty {
  margin-top: 50px;
  padding: 30px 0;
  border-top: 1px solid var(--ma-line);
  color: var(--ma-muted);
  font-size: 13px;
  line-height: 1.7;
}

.ma-empty-title {
  margin: 0;
  color: var(--ma-fg);
  font-family: var(--ma-serif);
  font-size: 28px;
}

.ma-empty p:not(.ma-empty-title) {
  margin: 8px 0 16px;
}

.ma-load-more {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
  border-bottom: 1px solid var(--ma-line);
}

.ma-load-more p {
  margin: 0;
  color: var(--ma-muted);
  font: 10px/1.5 var(--ma-mono);
}

.ma-load-button {
  padding: 12px 18px;
  border: 1px solid var(--ma-fg);
  border-radius: 0;
  background: transparent;
  color: var(--ma-fg);
  font-size: 12px;
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}

.ma-load-button:hover {
  background: var(--ma-fg);
  color: #fff;
}

.ma-footer-note {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-top: 58px;
  padding-top: 12px;
  border-top: 1px solid var(--ma-line);
  color: var(--ma-muted);
  font: 9px/1.6 var(--ma-mono);
  letter-spacing: .07em;
}

@media (max-width: 700px) {
  .ma {
    padding-right: 18px;
    padding-left: 18px;
    padding-top: 112px;
  }

  .ma-h1 {
    font-size: clamp(34px, 9.5vw, 42px);
  }

  .ma-lede {
    margin-top: 8px;
    font-size: 13px;
  }

  .ma-stats-line {
    margin-top: 10px;
    gap: 3px 7px;
    font-size: 11px;
  }

  .ma-publications {
    margin-top: 7px;
    gap: 2px 6px;
    font-size: 12px;
  }

  .ma-publication {
    gap: 6px;
  }

  .ma-filters {
    margin-top: 20px;
    padding-top: 16px;
    gap: 12px;
  }

  .ma-search {
    flex-basis: 180px;
  }

  .ma-filter-row {
    gap: 8px 14px;
  }

  .ma-field {
    flex: 1 1 calc(50% - 7px);
  }

  .ma-field select {
    width: 100%;
    max-width: none;
  }

  .ma-toggle {
    flex: 1 1 100%;
  }

  .ma-row {
    grid-template-columns: 1fr;
    gap: 7px;
    padding: 21px 0 23px;
  }

  .ma-date {
    padding-top: 0;
  }

  .ma-full-date {
    display: inline;
    margin-left: 7px;
  }

  .ma-title {
    font-size: clamp(22px, 6vw, 28px);
  }

  .ma-mini li {
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 10px;
  }
}

@media (max-width: 420px) {
  .ma-h1 {
    font-size: 38px;
  }

  .ma-results-line {
    align-items: flex-start;
  }

  .ma-footer-note {
    flex-direction: column;
    gap: 3px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ma *,
  .ma *::before,
  .ma *::after {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
.ma-collections {
  margin-top: 24px;
  border-top: 1px solid var(--ma-line);
  padding-top: 14px;
}

.ma-collections-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.ma-section-title {
  margin: 0;
  font-family: var(--ma-serif);
  font-size: 18px;
  font-weight: 500;
  line-height: 1.2;
}

.ma-collection-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-top: 12px;
}

.ma-collection {
  border-top: 1px solid var(--ma-fg);
  padding-top: 8px;
}

.ma-collection h3 {
  margin: 0;
  font-family: var(--ma-serif);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.25;
}

.ma-collection ul {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.ma-collection li {
  padding: 0;
}

.ma-collection li + li {
  margin-top: 8px;
  border-top: 1px solid var(--ma-line);
  padding-top: 8px;
}

.ma-collection li a {
  display: block;
  color: var(--ma-fg);
  font-family: var(--ma-serif);
  font-size: 14px;
  line-height: 1.25;
  text-decoration: none;
}

.ma-collection li a:hover {
  color: var(--ma-accent);
  text-decoration: underline;
}

.ma-collection-meta {
  display: block;
  margin-top: 3px;
  color: var(--ma-muted);
  font-size: 9px;
  line-height: 1.4;
}

.ma-collection-more {
  min-height: 0;
  margin-top: 6px;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--ma-muted);
  cursor: pointer;
  font-size: 10px;
  line-height: 1.4;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.ma-collection-more:hover {
  color: var(--ma-accent);
}

.ma-author-archives {
  margin-top: 42px;
  padding-top: 12px;
  border-top: 1px solid var(--ma-line);
  color: var(--ma-muted);
  font-size: 11px;
  line-height: 1.6;
}

.ma-author-archives summary {
  cursor: pointer;
  list-style: none;
}

.ma-author-archives summary::-webkit-details-marker {
  display: none;
}

.ma-author-archives summary::after {
  content: ' +';
  color: var(--ma-muted);
}

.ma-author-archives[open] summary::after {
  content: ' −';
}

.ma-author-archives div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-top: 8px;
}

.ma-author-archives a {
  color: var(--ma-fg);
  text-decoration: underline;
  text-decoration-color: var(--ma-line);
  text-underline-offset: 3px;
}

.ma-author-archives a:hover {
  color: var(--ma-accent);
  text-decoration-color: var(--ma-accent);
}

.ma-semantic-results {
  margin-top: 4px;
}

.ma-semantic-summary {
  margin: 6px 0;
  color: var(--ma-muted);
  font-size: 12px;
  line-height: 1.6;
}

.ma-semantic-results ol {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
}

.ma-semantic-results li {
  border-top: 1px solid var(--ma-line);
  padding: 12px 0;
}

.ma-semantic-results li > div a {
  color: var(--ma-fg);
  font-family: var(--ma-serif);
  font-size: 19px;
  text-decoration: none;
}

.ma-semantic-results li > div a:hover {
  color: var(--ma-accent);
  text-decoration: underline;
}

.ma-semantic-meta {
  display: block;
  margin-top: 3px;
  color: var(--ma-muted);
  font-family: var(--ma-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ma-semantic-quote,
.ma-verified-quote {
  margin: 8px 0 0;
  border-left: 2px solid var(--ma-accent);
  padding: 4px 0 4px 12px;
  color: #3f3e39;
  font-family: var(--ma-serif);
  font-size: 16px;
  line-height: 1.45;
}

.ma-verified {
  margin-top: 10px;
}

.ma-quote-label {
  display: block;
  margin-bottom: 3px;
  color: var(--ma-accent);
  font-family: var(--ma-mono);
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.ma-quote-translation {
  display: block;
  margin-top: 3px;
  color: var(--ma-muted);
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11px;
}

.ma-related {
  margin: 8px 0 0;
  color: var(--ma-muted);
  font-size: 11px;
  line-height: 1.4;
}

.ma-related a {
  color: var(--ma-fg);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ma-related a:hover {
  color: var(--ma-accent);
}

.ma-related em {
  color: var(--ma-muted);
  font-family: var(--ma-mono);
  font-size: 9px;
  font-style: normal;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ma-semantic-link {
  display: inline-block;
  margin-top: 6px;
  color: var(--ma-muted);
  font-family: var(--ma-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

@media (max-width: 900px) {
  .ma-collection-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .ma-collection-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 14px;
  }

  .ma-collection h3 {
    font-size: 13px;
  }

  .ma-collection li a {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 12px;
    line-height: 1.2;
  }

  .ma-collection-meta {
    margin-top: 2px;
    font-size: 8px;
  }

  .ma-collection-more {
    margin-top: 4px;
    font-size: 9px;
  }
}

`;
