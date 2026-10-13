'use client';

// components/media/MediaArchive.tsx
// Фильтры живут в URL: ?q=&type=&lang=&topic=&year=&outlet=
// «Виртуализация» через content-visibility: браузер не рендерит годы вне экрана.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Kind, MediaRecord } from '@/data/media';

type Props = {
  records: MediaRecord[];
  archives: { outlet: string; url: string }[];
};

type TypeDef = { id: string; label: string; kinds: Kind[] | null };

const TYPES: TypeDef[] = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'commentary', label: 'Commentary', kinds: ['quote', 'mention'] },
  { id: 'talks', label: 'Interviews', kinds: ['interview', 'radio', 'video'] },
  { id: 'columns', label: 'Columns', kinds: ['column', 'blog'] },
];

const KIND_LABEL: Record<Kind, string> = {
  quote: 'Quoted',
  mention: 'Cited',
  interview: 'Interview',
  radio: 'Radio',
  video: 'Video',
  column: 'Column',
  blog: 'Blog',
  profile: 'Profile',
};

// Порядок вывода в «стене изданий»: сначала самые узнаваемые, остальные по числу материалов.
const PRESTIGE = [
  'Le Monde', 'The New York Times', 'The Washington Post', 'BBC News', 'Deutsche Welle',
  'The Christian Science Monitor', 'Euronews', 'DIE ZEIT', 'Rzeczpospolita', 'The Art Newspaper',
  'Coda Story', 'ABC News', 'Deutschlandfunk', 'The Moscow Times', 'Радио Свобода', 'Current Time',
  'Новая газета', 'Эхо Москвы',
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmtDate = (d: string) => {
  const parts = d.split('-');
  const m = parts[1];
  const day = parts[2];
  if (!m) return '—';
  return day ? `${Number(day)} ${MONTHS[Number(m) - 1]}` : MONTHS[Number(m) - 1];
};

const SERIES_OUTLET = 'Новая газета';
const SERIES_MIN = 4;

type Node =
  | { type: 'record'; record: MediaRecord }
  | { type: 'series'; items: MediaRecord[] };

export default function MediaArchive({ records, archives }: Props) {
  // В типах Next 13/14 оба хука могут вернуть null, поэтому нормализуем один раз.
  const spRaw = useSearchParams();
  const sp = useMemo(() => new URLSearchParams(spRaw?.toString() ?? ''), [spRaw]);
  const router = useRouter();
  const pathname = usePathname() ?? '/media';

  const type = sp.get('type') ?? 'all';
  const lang = sp.get('lang') ?? '';
  const topic = sp.get('topic') ?? '';
  const year = sp.get('year') ?? '';
  const outlet = sp.get('outlet') ?? '';
  const qParam = sp.get('q') ?? '';

  const push = useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  // Поиск: локальное состояние + дебаунс в URL.
  const [q, setQ] = useState(qParam);
  useEffect(() => setQ(qParam), [qParam]);
  useEffect(() => {
    if (q === qParam) return;
    const t = setTimeout(() => push({ q: q.trim() ? q : null }), 250);
    return () => clearTimeout(t);
  }, [q, qParam, push]);

  const toggle = (key: string, current: string, value: string) =>
    push({ [key]: current === value ? null : value });

  // ── Статистика по всему архиву ────────────────────────────────────────
  const stats = useMemo(() => {
    const years = records.map((r) => Number(r.date.slice(0, 4)));
    const outlets = new Map<string, number>();
    records.forEach((r) => outlets.set(r.outlet, (outlets.get(r.outlet) ?? 0) + 1));
    const ordered = [...outlets.keys()].sort((a, b) => {
      const pa = PRESTIGE.indexOf(a);
      const pb = PRESTIGE.indexOf(b);
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
      return (outlets.get(b) ?? 0) - (outlets.get(a) ?? 0);
    });
    return {
      total: records.length,
      outlets: ordered,
      langs: [...new Set(records.map((r) => r.lang))],
      topics: [...new Set(records.map((r) => r.topic))],
      min: Math.min(...years),
      max: Math.max(...years),
    };
  }, [records]);

  // ── Фильтрация ────────────────────────────────────────────────────────
  const matches = useCallback(
    (r: MediaRecord, ignoreYear = false) => {
      const t = TYPES.find((x) => x.id === type);
      if (t?.kinds && !t.kinds.includes(r.kind)) return false;
      if (lang && r.lang !== lang) return false;
      if (topic && r.topic !== topic) return false;
      if (outlet && r.outlet !== outlet) return false;
      if (!ignoreYear && year && r.date.slice(0, 4) !== year) return false;
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length) {
        const hay = `${r.title} ${r.outlet} ${r.program ?? ''} ${r.summary}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    },
    [type, lang, topic, outlet, year, q],
  );

  const filtered = useMemo(() => records.filter((r) => matches(r)), [records, matches]);

  const histogram = useMemo(() => {
    const base = records.filter((r) => matches(r, true));
    const counts = new Map<number, number>();
    base.forEach((r) => {
      const y = Number(r.date.slice(0, 4));
      counts.set(y, (counts.get(y) ?? 0) + 1);
    });
    const ys: number[] = [];
    for (let y = stats.min; y <= stats.max; y++) ys.push(y);
    const peak = Math.max(1, ...ys.map((y) => counts.get(y) ?? 0));
    return ys.map((y) => ({ y, n: counts.get(y) ?? 0, h: Math.sqrt((counts.get(y) ?? 0) / peak) }));
  }, [records, matches, stats.min, stats.max]);

  // Сворачивать ли серию колонок: только в обзорных режимах без поиска.
  const flat = q.trim() !== '' || outlet !== '' || type === 'columns';

  const groups = useMemo(() => {
    const byYear = new Map<string, MediaRecord[]>();
    filtered.forEach((r) => {
      const y = r.date.slice(0, 4);
      const existing = byYear.get(y);
      if (existing) {
        existing.push(r);
      } else {
        byYear.set(y, [r]);
      }
    });
    return [...byYear.entries()]
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([y, list]) => {
        const seriesItems = list.filter((r) => r.kind === 'column' && r.outlet === SERIES_OUTLET);
        const collapse = !flat && seriesItems.length >= SERIES_MIN;
        const nodes: Node[] = [];
        let placed = false;
        list.forEach((r) => {
          const inSeries = collapse && r.kind === 'column' && r.outlet === SERIES_OUTLET;
          if (!inSeries) nodes.push({ type: 'record', record: r });
          else if (!placed) {
            nodes.push({ type: 'series', items: seriesItems });
            placed = true;
          }
        });
        return { year: y, count: list.length, nodes };
      });
  }, [filtered, flat]);

  const active = Boolean(qParam || lang || topic || year || outlet || type !== 'all');

  return (
    <div className="ma">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className="ma-hero">
        <p className="ma-eyebrow">Media archive</p>
        <h1 className="ma-h1">Quoted, interviewed and published since {stats.min}.</h1>
        <p className="ma-lede">
          Expert commentary, interviews and columns on the Russian internet, platforms, AI and the art market.
          Every record links to the original publication.
        </p>

        <dl className="ma-stats">
          <div><dt>Records</dt><dd>{stats.total}</dd></div>
          <div><dt>Outlets</dt><dd>{stats.outlets.length}</dd></div>
          <div><dt>Languages</dt><dd>{stats.langs.length}</dd></div>
          <div><dt>Years</dt><dd>{stats.max - stats.min + 1}</dd></div>
        </dl>

        <div className="ma-wall" aria-label="Outlets">
          {stats.outlets.slice(0, 22).map((o) => (
            <button
              key={o}
              type="button"
              className="ma-outlet-btn"
              aria-pressed={outlet === o}
              onClick={() => toggle('outlet', outlet, o)}
            >
              {o}
            </button>
          ))}
        </div>

        {archives.length > 0 && (
          <p className="ma-archives">
            Author pages:{' '}
            {archives.map((a, i) => (
              <span key={a.url}>
                {i > 0 && ' · '}
                <a href={a.url} target="_blank" rel="noopener noreferrer">{a.outlet} ↗</a>
              </span>
            ))}
          </p>
        )}
      </header>

      {/* ── Histogram ────────────────────────────────────────────────── */}
      <div className="ma-hist" role="group" aria-label="Records by year">
        {histogram.map(({ y, n, h }) => (
          <button
            key={y}
            type="button"
            className="ma-bar"
            aria-pressed={year === String(y)}
            disabled={n === 0}
            title={`${y}: ${n}`}
            onClick={() => toggle('year', year, String(y))}
          >
            <span className="ma-bar-fill" style={{ height: `${Math.max(n ? 6 : 0, h * 100)}%` }} />
            <span className="ma-bar-label">’{String(y).slice(2)}</span>
          </button>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className="ma-filters">
        <label className="ma-search">
          <span className="ma-sr">Search</span>
          <input
            type="search"
            value={q}
            placeholder="Search title, outlet, topic"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>

        <div className="ma-chips-group">
          <div className="ma-chips" role="group" aria-label="Type">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="ma-chip"
                aria-pressed={type === t.id}
                onClick={() => push({ type: t.id === 'all' ? null : t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ma-chips" role="group" aria-label="Language">
            {stats.langs.map((l) => (
              <button key={l} type="button" className="ma-chip" aria-pressed={lang === l} onClick={() => toggle('lang', lang, l)}>
                {l}
              </button>
            ))}
          </div>

          <div className="ma-chips" role="group" aria-label="Topic">
            {stats.topics.map((t) => (
              <button key={t} type="button" className="ma-chip" aria-pressed={topic === t} onClick={() => toggle('topic', topic, t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <p className="ma-count" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
          {active && (
            <>
              {' · '}
              <button type="button" className="ma-reset" onClick={() => { setQ(''); router.replace(pathname, { scroll: false }); }}>
                Reset
              </button>
            </>
          )}
        </p>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      {groups.length === 0 ? (
        <p className="ma-empty">Nothing matches these filters.</p>
      ) : (
        groups.map((g) => (
          <section key={g.year} className="ma-year" id={`y${g.year}`} aria-labelledby={`h${g.year}`}>
            <div className="ma-year-head">
              <h2 id={`h${g.year}`}>{g.year}</h2>
              <span>{g.count}</span>
            </div>
            <ol className="ma-list">
              {g.nodes.map((n, i) =>
                n.type === 'series' ? (
                  <li key={`s${i}`} className="ma-row">
                    <div className="ma-date">{n.items.length}×</div>
                    <details className="ma-series">
                      <summary>
                        <span className="ma-meta"><span className="ma-outlet">{SERIES_OUTLET}</span><span>Column series</span></span>
                        <span className="ma-title">«Виртуальный Меркуров»<em> · {n.items.length} columns</em></span>
                        <span className="ma-sum">Internet policy, AI, platforms and the art market.</span>
                      </summary>
                      <ol className="ma-mini">
                        {n.items.map((c) => (
                          <li key={c.slug}>
                            <time>{fmtDate(c.date)}</time>
                            <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </li>
                ) : (
                  <li key={n.record.slug} className="ma-row">
                    <div className="ma-date">{fmtDate(n.record.date)}</div>
                    <div className="ma-main">
                      <p className="ma-meta">
                        <span className="ma-outlet">{n.record.outlet}</span>
                        {n.record.program && <span>{n.record.program}</span>}
                        <span className="ma-tag">{n.record.lang}</span>
                        <span className="ma-tag">{KIND_LABEL[n.record.kind]}</span>
                      </p>
                      <a className="ma-title" href={n.record.url} target="_blank" rel="noopener noreferrer">
                        {n.record.title}<span aria-hidden> ↗</span>
                      </a>
                      <p className="ma-sum">{n.record.summary}</p>
                    </div>
                  </li>
                ),
              )}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

const CSS = `
.ma {
  --ma-fg: #111111;
  --ma-bg: #ffffff;
  --ma-mut: #555555;
  --ma-line: #dcdcdc;
  --ma-chip-bg: #f4f4f5;
  --ma-chip-fg: #111111;
  --ma-acc: #d2391c;
  --ma-serif: ui-serif, Georgia, 'Times New Roman', serif;
  --ma-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  
  max-width: 1120px;
  margin: 0 auto;
  padding: 96px 24px 96px;
  color: var(--ma-fg);
  background-color: var(--ma-bg);
}

@media (prefers-color-scheme: dark) {
  .ma {
    --ma-fg: #f3f3f3;
    --ma-bg: #0a0a0a;
    --ma-mut: #a0a0a0;
    --ma-line: #2a2a2a;
    --ma-chip-bg: #1c1c1e;
    --ma-chip-fg: #f3f3f3;
    --ma-acc: #ff5c38;
  }
}

:root[data-theme="dark"] .ma {
  --ma-fg: #f3f3f3;
  --ma-bg: #0a0a0a;
  --ma-mut: #a0a0a0;
  --ma-line: #2a2a2a;
  --ma-chip-bg: #1c1c1e;
  --ma-chip-fg: #f3f3f3;
  --ma-acc: #ff5c38;
}

:root[data-theme="light"] .ma {
  --ma-fg: #111111;
  --ma-bg: #ffffff;
  --ma-mut: #555555;
  --ma-line: #dcdcdc;
  --ma-chip-bg: #f4f4f5;
  --ma-chip-fg: #111111;
  --ma-acc: #d2391c;
}

.ma button {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.ma a {
  color: inherit;
  text-decoration: none;
}

.ma-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.ma-eyebrow {
  font: 600 12px/1.2 var(--ma-mono);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--ma-acc);
  margin: 0 0 16px;
}

.ma-h1 {
  font: 400 clamp(32px, 5.5vw, 64px)/1.08 var(--ma-serif);
  letter-spacing: -.02em;
  margin: 0;
  max-width: 16em;
}

.ma-lede {
  font-size: 18px;
  line-height: 1.6;
  color: var(--ma-mut);
  max-width: 38em;
  margin: 20px 0 0;
}

.ma-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  margin: 48px 0 0;
  padding: 24px 0;
  border-block: 1px solid var(--ma-line);
}

.ma-stats dt {
  font: 600 11px/1.2 var(--ma-mono);
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--ma-mut);
}

.ma-stats dd {
  margin: 8px 0 0;
  font: 400 clamp(28px, 4vw, 48px)/1 var(--ma-serif);
  font-variant-numeric: tabular-nums;
  color: var(--ma-fg);
}

.ma-wall {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-top: 32px;
  font: 400 clamp(16px, 2vw, 20px)/1.5 var(--ma-serif);
}

.ma-outlet-btn {
  color: var(--ma-mut);
  transition: color .15s ease;
  position: relative;
  padding-bottom: 2px;
}

.ma-outlet-btn:hover,
.ma-outlet-btn[aria-pressed=true] {
  color: var(--ma-fg);
}

.ma-outlet-btn[aria-pressed=true] {
  text-decoration: underline;
  text-decoration-color: var(--ma-acc);
  text-underline-offset: 6px;
  text-decoration-thickness: 2px;
}

.ma-archives {
  margin: 20px 0 0;
  font-size: 14px;
  color: var(--ma-mut);
}

.ma-archives a {
  color: var(--ma-fg);
  font-weight: 500;
  transition: color .15s ease;
}

.ma-archives a:hover {
  color: var(--ma-acc);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.ma-hist {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 104px;
  margin: 56px 0 0;
  padding-bottom: 4px;
}

.ma-bar {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ma-bar-fill {
  width: 100%;
  background: var(--ma-line);
  transition: background .15s ease, height .2s ease;
  min-height: 0;
  border-radius: 2px 2px 0 0;
}

.ma-bar:hover:not(:disabled) .ma-bar-fill,
.ma-bar[aria-pressed=true] .ma-bar-fill {
  background: var(--ma-acc);
}

.ma-bar:disabled {
  cursor: default;
  opacity: 0.3;
}

.ma-bar-label {
  font: 500 11px/1 var(--ma-mono);
  color: var(--ma-mut);
}

.ma-filters {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 32px 0 0;
  padding-top: 28px;
  border-top: 1px solid var(--ma-line);
}

.ma-search input {
  width: 100%;
  font: inherit;
  font-size: 16px;
  padding: 12px 0;
  color: var(--ma-fg);
  background: none;
  border: 0;
  border-bottom: 1px solid var(--ma-line);
  outline: 0;
  border-radius: 0;
  transition: border-color .15s ease;
}

.ma-search input::placeholder {
  color: var(--ma-mut);
}

.ma-search input:focus {
  border-bottom-color: var(--ma-acc);
}

.ma-chips-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ma-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ma-chip {
  font-size: 13px;
  font-weight: 500;
  padding: 7px 14px;
  border-radius: 999px;
  background: var(--ma-chip-bg);
  color: var(--ma-chip-fg);
  border: 1px solid var(--ma-line);
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}

.ma-chip:hover {
  border-color: var(--ma-fg);
}

.ma-chip[aria-pressed=true] {
  background: var(--ma-fg);
  color: var(--ma-bg);
  border-color: var(--ma-fg);
}

.ma-count {
  margin: 6px 0 0;
  font: 500 12px/1 var(--ma-mono);
  color: var(--ma-mut);
}

.ma-reset {
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  color: var(--ma-fg);
  font-weight: 600;
}

.ma-reset:hover {
  color: var(--ma-acc);
}

.ma-year {
  margin-top: 64px;
  content-visibility: auto;
  contain-intrinsic-size: auto 640px;
}

.ma-year-head {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 16px 0;
  background: var(--ma-bg);
  border-bottom: 2px solid var(--ma-line);
}

.ma-year-head h2 {
  margin: 0;
  font: 400 clamp(32px, 5vw, 56px)/1 var(--ma-serif);
  font-variant-numeric: tabular-nums;
  letter-spacing: -.02em;
  color: var(--ma-fg);
}

.ma-year-head span {
  font: 600 12px/1 var(--ma-mono);
  color: var(--ma-mut);
}

.ma-list,
.ma-mini {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ma-row {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 24px;
  padding: 28px 0;
  border-bottom: 1px solid var(--ma-line);
}

.ma-date {
  font: 500 12px/1.6 var(--ma-mono);
  color: var(--ma-mut);
  padding-top: 4px;
}

.ma-main {
  min-width: 0;
}

.ma-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--ma-mut);
}

.ma-outlet {
  color: var(--ma-fg);
  font-weight: 600;
}

.ma-tag {
  font: 600 10px/1 var(--ma-mono);
  letter-spacing: .08em;
  text-transform: uppercase;
  padding: 3px 8px;
  border: 1px solid var(--ma-line);
  border-radius: 4px;
  background: var(--ma-chip-bg);
  color: var(--ma-fg);
}

.ma-title {
  display: inline-block;
  font: 400 clamp(20px, 2.5vw, 26px)/1.3 var(--ma-serif);
  letter-spacing: -.01em;
  color: var(--ma-fg);
  transition: color .15s ease;
}

a.ma-title:hover {
  color: var(--ma-acc);
}

.ma-title em {
  font-style: normal;
  color: var(--ma-mut);
  font-size: .7em;
}

.ma-sum {
  margin: 12px 0 0;
  font-size: 16px;
  line-height: 1.6;
  color: var(--ma-mut);
  max-width: 44em;
}

.ma-series summary {
  list-style: none;
  cursor: pointer;
  display: block;
  position: relative;
  padding-right: 32px;
}

.ma-series summary::-webkit-details-marker {
  display: none;
}

.ma-series summary::after {
  content: '+';
  position: absolute;
  right: 0;
  top: 0;
  font: 300 28px/1 var(--ma-serif);
  color: var(--ma-mut);
  transition: transform .2s ease;
}

.ma-series[open] summary::after {
  content: '–';
}

.ma-series summary:hover .ma-title {
  color: var(--ma-acc);
}

.ma-mini {
  margin-top: 16px;
  display: grid;
  gap: 4px;
}

.ma-mini li {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--ma-line);
  font-size: 15px;
  align-items: center;
}

.ma-mini time {
  font: 500 12px/1.6 var(--ma-mono);
  color: var(--ma-mut);
}

.ma-mini a {
  color: var(--ma-fg);
  transition: color .15s ease;
}

.ma-mini a:hover {
  color: var(--ma-acc);
}

.ma-empty {
  margin-top: 56px;
  color: var(--ma-mut);
  font-size: 16px;
}

@media (max-width: 640px) {
  .ma {
    padding-inline: 16px;
  }
  .ma-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .ma-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .ma-date {
    padding: 0;
  }
  .ma-bar-label {
    display: none;
  }
  .ma-bar:nth-child(odd) .ma-bar-label {
    display: block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ma * {
    transition: none !important;
  }
}
`;
