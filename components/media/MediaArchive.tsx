'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Kind, MediaRecord } from '@/data/media';

type Props = {
  records: MediaRecord[];
  archives: { outlet: string; url: string }[];
};

type TypeDef = {
  id: string;
  label: string;
  kinds: Kind[] | null;
};

type TimelineNode =
  | { type: 'record'; record: MediaRecord }
  | { type: 'series'; items: MediaRecord[] };

const TYPES: TypeDef[] = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'commentary', label: 'Commentary', kinds: ['quote', 'mention'] },
  { id: 'talks', label: 'Interviews & broadcasts', kinds: ['interview', 'radio', 'video'] },
  { id: 'columns', label: 'Columns', kinds: ['column', 'blog'] },
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

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const PAGE_SIZE = 30;
const SERIES_OUTLET = 'Новая газета';
const SERIES_MIN = 4;

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

export default function MediaArchive({ records, archives }: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname() ?? '/media';
  const router = useRouter();

  const paramsString = searchParams?.toString() ?? '';

  const params = useMemo(
    () => new URLSearchParams(paramsString),
    [paramsString],
  );

  const type = params.get('type') ?? 'all';
  const lang = params.get('lang') ?? '';
  const topic = params.get('topic') ?? '';
  const year = params.get('year') ?? '';
  const outlet = params.get('outlet') ?? '';
  const queryFromUrl = params.get('q') ?? '';

  const [query, setQuery] = useState(queryFromUrl);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);

  const updateUrl = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());

      Object.entries(patch).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });

      const queryString = next.toString();
      router.replace(
        queryString ? `${pathname}?${queryString}` : pathname,
        { scroll: false },
      );
    },
    [params, pathname, router],
  );

  const toggleFilter = useCallback(
    (key: string, current: string, value: string) => {
      updateUrl({ [key]: current === value ? null : value });
    },
    [updateUrl],
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
  }, [type, lang, topic, year, outlet, queryFromUrl]);

  const stats = useMemo(() => {
    const outletCounts = new Map<string, number>();

    records.forEach((record) => {
      outletCounts.set(
        record.outlet,
        (outletCounts.get(record.outlet) ?? 0) + 1,
      );
    });

    const outlets = [...outletCounts.keys()].sort((a, b) => {
      const indexA = PRESTIGE.indexOf(a);
      const indexB = PRESTIGE.indexOf(b);

      if (indexA !== -1 || indexB !== -1) {
        return (indexA === -1 ? 999 : indexA)
          - (indexB === -1 ? 999 : indexB);
      }

      return (
        (outletCounts.get(b) ?? 0) - (outletCounts.get(a) ?? 0)
        || a.localeCompare(b)
      );
    });

    const years = records
      .map((record) => Number(record.date.slice(0, 4)))
      .filter(Number.isFinite);

    return {
      total: records.length,
      outlets,
      languages: [...new Set(records.map((record) => record.lang))].sort(),
      topics: [...new Set(records.map((record) => record.topic))].sort(),
      minYear: years.length ? Math.min(...years) : new Date().getFullYear(),
      maxYear: years.length ? Math.max(...years) : new Date().getFullYear(),
    };
  }, [records]);

  const matches = useCallback(
    (record: MediaRecord, ignoreYear = false) => {
      const selectedType = TYPES.find((item) => item.id === type);

      if (
        selectedType?.kinds
        && !selectedType.kinds.includes(record.kind)
      ) {
        return false;
      }

      if (lang && record.lang !== lang) return false;
      if (topic && record.topic !== topic) return false;
      if (outlet && record.outlet !== outlet) return false;

      if (
        !ignoreYear
        && year
        && record.date.slice(0, 4) !== year
      ) {
        return false;
      }

      const words = query
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      if (words.length) {
        const searchableText = [
          record.title,
          record.outlet,
          record.program ?? '',
          record.summary,
          record.topic,
          record.lang,
          record.date,
          KIND_LABEL[record.kind],
        ]
          .join(' ')
          .toLocaleLowerCase();

        if (!words.every((word) => searchableText.includes(word))) {
          return false;
        }
      }

      return true;
    },
    [type, lang, topic, outlet, year, query],
  );

  const filtered = useMemo(
    () => records.filter((record) => matches(record)).sort(compareRecords),
    [records, matches],
  );

  const histogram = useMemo(() => {
    const counts = new Map<number, number>();

    records.filter((record) => matches(record, true)).forEach((record) => {
      const recordYear = Number(record.date.slice(0, 4));
      counts.set(recordYear, (counts.get(recordYear) ?? 0) + 1);
    });

    const years: number[] = [];

    for (let y = stats.minYear; y <= stats.maxYear; y += 1) {
      years.push(y);
    }

    const peak = Math.max(1, ...years.map((y) => counts.get(y) ?? 0));

    return years.map((y) => {
      const count = counts.get(y) ?? 0;

      return {
        year: y,
        count,
        height: count ? Math.max(6, Math.sqrt(count / peak) * 100) : 0,
      };
    });
  }, [records, matches, stats.minYear, stats.maxYear]);

  const activeFilters = Boolean(
    queryFromUrl || lang || topic || year || outlet || type !== 'all',
  );

  const resetFilters = () => {
    setQuery('');
    setVisibleLimit(PAGE_SIZE);
    router.replace(pathname, { scroll: false });
  };

  const isOverview = !query.trim() && !outlet && type !== 'columns';

  const visibleRecords = useMemo(
    () => filtered.slice(0, visibleLimit),
    [filtered, visibleLimit],
  );

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
            record.kind === 'column'
            && record.outlet === SERIES_OUTLET,
        );

        const collapseSeries =
          isOverview && seriesItems.length >= SERIES_MIN;

        const nodes: TimelineNode[] = [];
        let seriesAdded = false;

        yearRecords.forEach((record) => {
          const belongsToSeries =
            collapseSeries
            && record.kind === 'column'
            && record.outlet === SERIES_OUTLET;

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
          A continuous record of analytical columns, international media citations, 
          interviews, and public appearances tracing transformations in digital infrastructure, 
          technology, and contemporary culture.
        </p>

        <dl className="ma-stats">
          <div>
            <dt>Records</dt>
            <dd>{stats.total}</dd>
          </div>
          <div>
            <dt>Publications</dt>
            <dd>{stats.outlets.length}</dd>
          </div>
          <div>
            <dt>Languages</dt>
            <dd>{stats.languages.length}</dd>
          </div>
          <div>
            <dt>Years covered</dt>
            <dd>{stats.maxYear - stats.minYear + 1}</dd>
          </div>
        </dl>

        <div className="ma-wall" aria-label="Filter by publication">
          {stats.outlets.slice(0, 22).map((publication) => (
            <button
              key={publication}
              type="button"
              className="ma-outlet-btn"
              aria-pressed={outlet === publication}
              onClick={() =>
                toggleFilter('outlet', outlet, publication)
              }
            >
              {publication}
            </button>
          ))}
        </div>

        {archives.length > 0 && (
          <p className="ma-archives">
            <span className="ma-archives-label">Author archives</span>
            {archives.map((archive, index) => (
              <span key={archive.url}>
                {index > 0 && <span aria-hidden="true"> · </span>}
                <a
                  href={archive.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {archive.outlet} ↗
                </a>
              </span>
            ))}
          </p>
        )}
      </header>

      <section className="ma-explorer" aria-label="Explore archive">
        <div className="ma-section-heading">
          <span className="ma-eyebrow">Browse by year</span>
          <span className="ma-small-note">
            Select a year to filter the archive
          </span>
        </div>

        <div className="ma-hist" role="group" aria-label="Records by year">
          {histogram.map(({ year: barYear, count, height }) => (
            <button
              key={barYear}
              type="button"
              className="ma-bar"
              aria-pressed={year === String(barYear)}
              disabled={count === 0}
              title={`${barYear}: ${count} records`}
              aria-label={`${barYear}: ${count} records`}
              onClick={() =>
                toggleFilter('year', year, String(barYear))
              }
            >
              <span
                className="ma-bar-fill"
                style={{ height: `${height}%` }}
              />
              <span className="ma-bar-label">
                {String(barYear).slice(2)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="ma-filters" aria-label="Filter media archive">
        <label className="ma-search">
          <span className="ma-sr">Search the media archive</span>
          <span className="ma-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            placeholder="Search title, publication, topic, date…"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              className="ma-clear-search"
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              ×
            </button>
          )}
        </label>

        <div className="ma-filter-block">
          <span className="ma-filter-label">Format</span>
          <div className="ma-chips" role="group" aria-label="Format">
            {TYPES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ma-chip"
                aria-pressed={type === item.id}
                onClick={() =>
                  updateUrl({
                    type: item.id === 'all' ? null : item.id,
                  })
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ma-filter-block">
          <span className="ma-filter-label">Language</span>
          <div className="ma-chips" role="group" aria-label="Language">
            {stats.languages.map((language) => (
              <button
                key={language}
                type="button"
                className="ma-chip ma-chip-small"
                aria-pressed={lang === language}
                onClick={() =>
                  toggleFilter('lang', lang, language)
                }
              >
                {language}
              </button>
            ))}
          </div>
        </div>

        <div className="ma-filter-block">
          <span className="ma-filter-label">Topic</span>
          <div className="ma-chips" role="group" aria-label="Topic">
            {stats.topics.map((item) => (
              <button
                key={item}
                type="button"
                className="ma-chip ma-chip-small"
                aria-pressed={topic === item}
                onClick={() =>
                  toggleFilter('topic', topic, item)
                }
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="ma-results-line">
          <p className="ma-count" aria-live="polite">
            <strong>{filtered.length}</strong>
            {' '}
            {filtered.length === 1 ? 'record' : 'records'}
            {filtered.length > visibleRecords.length && (
              <span> · showing {visibleRecords.length}</span>
            )}
          </p>

          {activeFilters && (
            <button
              type="button"
              className="ma-reset"
              onClick={resetFilters}
            >
              Clear filters ×
            </button>
          )}
        </div>
      </section>

      <section className="ma-timeline" aria-label="Media timeline">
        {groups.length === 0 ? (
          <div className="ma-empty">
            <p className="ma-empty-title">No matching records</p>
            <p>Try another search or clear the selected filters.</p>
            {activeFilters && (
              <button
                type="button"
                className="ma-reset"
                onClick={resetFilters}
              >
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
                  {group.count}
                  {' '}
                  {group.count === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              <ol className="ma-list">
                {group.nodes.map((node, index) => {
                  if (node.type === 'series') {
                    return (
                      <li
                        key={`series-${group.year}-${index}`}
                        className="ma-row"
                      >
                        <div className="ma-date">
                          {node.items.length}×
                        </div>

                        <details className="ma-series">
                          <summary>
                            <span className="ma-meta">
                              <span className="ma-outlet">
                                {SERIES_OUTLET}
                              </span>
                              <span>Author column series</span>
                            </span>

                            <span className="ma-title">
                              «Виртуальный Меркуров»
                              <em> · {node.items.length} columns</em>
                            </span>

                            <span className="ma-sum">
                              Internet policy, AI, platforms and
                              digital culture.
                            </span>
                          </summary>

                          <ol className="ma-mini">
                            {node.items.map((column) => (
                              <li key={column.slug}>
                                <time dateTime={column.date}>
                                  {formatDate(column.date)}
                                </time>
                                <a
                                  href={column.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
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

                  const record = node.record;

                  return (
                    <li key={record.slug} className="ma-row">
                      <time className="ma-date" dateTime={record.date}>
                        {formatDate(record.date)}
                        <span className="ma-full-date">
                          {record.date.slice(0, 4)}
                        </span>
                      </time>

                      <div className="ma-main">
                        <p className="ma-meta">
                          <span className="ma-outlet">
                            {record.outlet}
                          </span>

                          {record.program && (
                            <span>{record.program}</span>
                          )}

                          <span className="ma-tag">{record.lang}</span>
                          <span className="ma-kind">
                            {KIND_LABEL[record.kind]}
                          </span>
                        </p>

                        <Link
                          className="ma-title"
                          href={`/media/record/${encodeURIComponent(record.slug)}`}
                        >
                          {record.title}
                        </Link>

                        {record.summary && (
                          <p className="ma-sum">{record.summary}</p>
                        )}

                        <div className="ma-record-foot">
                          <span>{record.topic}</span>
                          <a
                            href={record.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Original publication
                            <span className="ma-external" aria-hidden="true">
                              {' '}↗
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
                setVisibleLimit((current) =>
                  Math.min(current + PAGE_SIZE, filtered.length),
                )
              }
            >
              Load {Math.min(PAGE_SIZE, filtered.length - visibleRecords.length)} more
              <span aria-hidden="true"> ↓</span>
            </button>
          </div>
        )}
      </section>

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
  --ma-soft: #f7f6f2;
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

.ma button,
.ma input {
  font: inherit;
}

.ma button {
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

.ma-eyebrow {
  margin: 0;
  color: var(--ma-accent);
  font: 500 10px/1.5 var(--ma-mono);
  letter-spacing: .14em;
  text-transform: uppercase;
}

.ma-hero {
  padding-bottom: clamp(40px, 6vw, 76px);
}

.ma-h1 {
  max-width: 900px;
  margin: 0;
  font-family: var(--ma-serif);
  font-size: clamp(48px, 8.5vw, 104px);
  font-weight: 400;
  line-height: .94;
  letter-spacing: -.045em;
}

.ma-lede {
  max-width: 680px;
  margin: 28px 0 0;
  color: var(--ma-muted);
  font-size: 16px;
  line-height: 1.75;
}

.ma-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 48px 0 0;
  padding: 22px 0;
  border-top: 1px solid var(--ma-line);
  border-bottom: 1px solid var(--ma-line);
  gap: 20px;
}

.ma-stats div {
  min-width: 0;
}

.ma-stats dt {
  color: var(--ma-muted);
  font: 10px/1.5 var(--ma-mono);
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ma-stats dd {
  margin: 8px 0 0;
  font-family: var(--ma-serif);
  font-size: clamp(30px, 4vw, 46px);
  font-weight: 400;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.ma-wall {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 28px;
}

.ma-outlet-btn {
  padding: 2px 0;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: var(--ma-muted);
  font-family: var(--ma-serif);
  font-size: clamp(16px, 1.8vw, 20px);
  cursor: pointer;
  transition: color .15s ease, border-color .15s ease;
}

.ma-outlet-btn:hover,
.ma-outlet-btn[aria-pressed="true"] {
  color: var(--ma-fg);
  border-bottom-color: var(--ma-accent);
}

.ma-archives {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 7px;
  margin: 28px 0 0;
  color: var(--ma-muted);
  font-size: 12px;
  line-height: 1.7;
}

.ma-archives-label {
  margin-right: 5px;
  font-family: var(--ma-mono);
  font-size: 10px;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ma-archives a {
  color: var(--ma-fg);
  text-decoration: underline;
  text-decoration-color: var(--ma-line);
  text-underline-offset: 3px;
}

.ma-archives a:hover {
  text-decoration-color: var(--ma-accent);
  color: var(--ma-accent);
}

.ma-explorer {
  padding: 26px 0 0;
  border-top: 1px solid var(--ma-line);
}

.ma-section-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.ma-small-note {
  color: var(--ma-muted);
  font-size: 11px;
}

.ma-hist {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 100px;
  margin: 22px 0 0;
  padding-bottom: 4px;
}

.ma-bar {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.ma-bar-fill {
  display: block;
  width: 100%;
  min-height: 0;
  background: #d9d6ce;
  transition: background .15s ease, height .2s ease;
}

.ma-bar:hover:not(:disabled) .ma-bar-fill,
.ma-bar[aria-pressed="true"] .ma-bar-fill {
  background: var(--ma-accent);
}

.ma-bar:disabled {
  cursor: default;
  opacity: .24;
}

.ma-bar-label {
  color: var(--ma-muted);
  font: 9px/1 var(--ma-mono);
  text-align: center;
}

.ma-filters {
  display: flex;
  flex-direction: column;
  gap: 22px;
  margin-top: 34px;
  padding: 28px 0 22px;
  border-top: 1px solid var(--ma-line);
  border-bottom: 1px solid var(--ma-line);
}

.ma-search {
  display: flex;
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
  font-size: 28px;
  line-height: 1;
}

.ma-search input {
  width: 100%;
  min-width: 0;
  padding: 12px 0;
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

.ma-filter-block {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr);
  align-items: start;
  gap: 14px;
}

.ma-filter-label {
  padding-top: 7px;
  color: var(--ma-muted);
  font: 10px/1.5 var(--ma-mono);
  letter-spacing: .08em;
  text-transform: uppercase;
}

.ma-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.ma-chip {
  padding: 7px 11px;
  border: 1px solid var(--ma-line);
  border-radius: 0;
  background: transparent;
  color: var(--ma-fg);
  font-size: 11px;
  line-height: 1.3;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, color .15s ease;
}

.ma-chip:hover {
  border-color: var(--ma-fg);
}

.ma-chip[aria-pressed="true"] {
  border-color: var(--ma-fg);
  background: var(--ma-fg);
  color: #fff;
}

.ma-chip-small {
  padding: 6px 9px;
  font-size: 10px;
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

  .ma-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 22px 14px;
  }

  .ma-section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }

  .ma-hist {
    gap: 3px;
    height: 82px;
  }

  .ma-bar-label {
    font-size: 8px;
  }

  .ma-filter-block {
    grid-template-columns: 1fr;
    gap: 7px;
  }

  .ma-filter-label {
    padding-top: 0;
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
    font-size: 48px;
  }

  .ma-results-line {
    align-items: flex-start;
  }

  .ma-footer-note {
    flex-direction: column;
    gap: 3px;
  }

  .ma-bar-label {
    display: none;
  }

  .ma-bar:nth-child(odd) .ma-bar-label {
    display: block;
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
`;
