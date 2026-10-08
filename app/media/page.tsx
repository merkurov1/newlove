import type { Metadata } from "next";
import Link from "next/link";
import { MEDIA } from "@/data/media";

type MediaRecord = any;

/* ────────────────────────────────────────────────────────────
   /media — THE MEDIA ARCHIVE
   Server Component. All archive state lives in the URL
   (?year= &topic= &language= &type= &role= &country= &publication= &q= &page=),
   so filters work without JS, Back/Forward is native, every view is shareable.
   ──────────────────────────────────────────────────────────── */

export const revalidate = 3600;

const SITE = "https://merkurov.love";
const PAGE_SIZE = 60;
const FIRST_YEAR = 2006;
const LAST_YEAR = new Date().getUTCFullYear();
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => LAST_YEAR - i);

export const metadata: Metadata = {
  title: "Anton Merkurov — Media Archive",
  description:
    "A public archive of media appearances, interviews, commentary, writing, conferences and cultural records, 2006–2026.",
  alternates: { canonical: `${SITE}/media` },
  openGraph: {
    type: "website",
    url: `${SITE}/media`,
    title: "Anton Merkurov — Media Archive",
    description:
      "A public archive of media appearances, interviews, commentary, writing, conferences and cultural records, 2006–2026.",
  },
  twitter: {
    card: "summary",
    title: "Anton Merkurov — Media Archive",
    description: "A public record, 2006—2026.",
  },
};

/* ───────────── constants ───────────── */

const TOPICS = [
  "Internet", "Media", "Technology", "Regulation", "AI", "Art", "Digital Art",
  "Crypto / NFT", "Heritage", "Politics", "Culture", "Russia", "Ukraine", "Freedom / Democracy",
] as const;

const FORMATS = [
  ["article", "Article"], ["interview", "Interview"], ["broadcast", "Broadcast"],
  ["video", "Video"], ["conference", "Conference"], ["profile", "Profile"],
  ["institutional", "Institutional"], ["heritage", "Heritage"],
] as const;

const ROLES = [
  ["interviewee", "Interviewee"], ["quoted", "Quoted"], ["author", "Author"],
  ["speaker", "Speaker"], ["subject", "Subject"], ["heritage_representative", "Heritage representative"],
] as const;

const SIGNATURE = [
  "BBC", "The New York Times", "The Washington Post", "Le Monde", "Bloomberg",
  "The Christian Science Monitor", "ZEIT", "Deutsche Welle", "Deutschlandfunk",
  "Euronews", "The Art Newspaper",
];

const NAV = [
  { href: "/", label: "Index" },
  { href: "/all", label: "Projects" },
  { href: "/journal", label: "Journal" },
  { href: "/research", label: "Research" },
  { href: "/art", label: "Art" },
  { href: "/advising", label: "Advising" },
  { href: "/heritage", label: "Heritage" },
  { href: "/unframed", label: "UNFRAMED" },
] as const;

/* ───────────── helpers ───────────── */

type SP = Record<string, string | string[] | undefined>;
type Filters = {
  year?: string; topic?: string; language?: string; type?: string;
  role?: string; country?: string; publication?: string; q?: string; page?: number;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function parseFilters(sp: SP): Filters {
  const p = Number(one(sp.page));
  return {
    year: one(sp.year), topic: one(sp.topic), language: one(sp.language),
    type: one(sp.type), role: one(sp.role), country: one(sp.country),
    publication: one(sp.publication), q: one(sp.q)?.trim(),
    page: Number.isFinite(p) && p > 1 ? Math.floor(p) : 1,
  };
}

function href(current: Filters, patch: Partial<Filters>, hash = "archive") {
  const next: Filters = { ...current, page: 1, ...patch };
  const usp = new URLSearchParams();
  (["year", "topic", "language", "type", "role", "country", "publication", "q"] as const).forEach((k) => {
    if (next[k]) usp.set(k, String(next[k]));
  });
  if (next.page && next.page > 1) usp.set("page", String(next.page));
  const qs = usp.toString();
  return `/media${qs ? `?${qs}` : ""}#${hash}`;
}

/** Spec §43: never treat a homepage / search page as a direct source. */
function directUrl(r: MediaRecord): string | null {
  try {
    const u = new URL(r.url);
    if (!/^https?:$/.test(u.protocol)) return null;
    const path = u.pathname.replace(/\/+$/, "");
    if (!path && !u.search) return null; // homepage
    if (/(^|\/)(search|results)(\/|$)/i.test(path) || /[?&](q|query|s)=/i.test(u.search)) return null;
    if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const matchesYear = (y: number, f?: string) => {
  if (!f) return true;
  if (/^\d{4}s$/.test(f)) return y >= Number(f.slice(0, 4)) && y < Number(f.slice(0, 4)) + 10;
  return y === Number(f);
};

const norm = (s: string) => s.toLocaleLowerCase("ru").normalize("NFKD").replace(/\p{M}/gu, "");

function matchesQuery(r: MediaRecord, q?: string) {
  if (!q) return true;
  const hay = norm(
    [r.title, r.titleEn, r.publication, r.description, r.topics.join(" "), r.country, r.language, r.year].join(" "),
  );
  return norm(q).split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

const langName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

const tally = <T extends string | number>(items: T[]) => {
  const m = new Map<T, number>();
  items.forEach((i) => m.set(i, (m.get(i) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

const fmtDate = (d: string) => d || "n.d.";

/* ───────────── small components ───────────── */

function Ext({ href: h, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={h} target="_blank" rel="noopener noreferrer" className={`underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-black ${className}`}>
      {children}
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

const mono = "font-mono text-[11px] uppercase tracking-[0.14em]";
const rule = "border-t border-black/15";
const chip = (on: boolean) =>
  `inline-block border px-2.5 py-1 ${mono} transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-black ${
    on ? "border-black bg-black text-white" : "border-black/20 hover:border-black"
  }`;

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/15 bg-[#fafaf7]/95 backdrop-blur-0">
      <a href="#archive" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:bg-black focus:px-3 focus:py-1 focus:text-white">
        Skip to archive
      </a>
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-5 py-4 md:px-10">
        <Link href="/" className="font-serif text-lg tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-black">
          Anton Merkurov
        </Link>
        <nav aria-label="Primary" className="flex min-w-0 gap-5 overflow-x-auto whitespace-nowrap">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`${mono} text-black/60 hover:text-black`}>
              {n.label}
            </Link>
          ))}
          <Link href="/media" aria-current="page" className={`${mono} border-b border-black text-black`}>
            Media
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  const updated = new Date().toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" }).toUpperCase();
  return (
    <footer className="border-t border-black bg-[#fafaf7]">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-14 md:grid-cols-12 md:px-10">
        <div className="md:col-span-5">
          <p className="font-serif text-2xl leading-tight">Anton Merkurov</p>
          <p className={`${mono} mt-3 text-black/50`}>merkurov.love · {FIRST_YEAR}—{LAST_YEAR}</p>
        </div>
        <nav aria-label="Footer" className="md:col-span-4">
          <p className={`${mono} mb-3 text-black/50`}>Site</p>
          <ul className="grid grid-cols-2 gap-y-2 font-serif">
            {[...NAV, { href: "/media", label: "Media" }].map((n) => (
              <li key={n.href}><Link className="hover:underline underline-offset-4" href={n.href}>{n.label}</Link></li>
            ))}
          </ul>
        </nav>
        <div className="md:col-span-3">
          <p className={`${mono} mb-3 text-black/50`}>Archive</p>
          <ul className="space-y-2 font-serif">
            <li><Link className="hover:underline underline-offset-4" href="/media#archive">Full timeline</Link></li>
            <li><Link className="hover:underline underline-offset-4" href="/media?type=heritage#heritage">The Merkurov Legacy</Link></li>
            <li><Link className="hover:underline underline-offset-4" href="/media#world">The World</Link></li>
          </ul>
          <p className={`${mono} mt-6 text-black/50`}>Last updated<br />{updated}</p>
        </div>
      </div>
    </footer>
  );
}

/* ───────────── page ───────────── */

export default async function MediaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const f = parseFilters(await searchParams);

  /* §5–6, §44: only verified, non-context records count. Heritage kept apart. */
  const verified = MEDIA.filter((r: MediaRecord) => r.verified && r.tier !== "context");
  const heritage = verified.filter((r: MediaRecord) => r.type === "heritage" || r.role === "heritage_representative");
  const mainPool = verified.filter((r: MediaRecord) => !heritage.includes(r));
  const primary = mainPool.filter((r: MediaRecord) => r.tier === "primary");

  const stats = {
    records: primary.length,
    publications: new Set(verified.map((r: MediaRecord) => r.publication)).size,
    countries: new Set(verified.map((r: MediaRecord) => r.country)).size,
    languages: new Set(verified.map((r: MediaRecord) => r.language)).size,
  };

  /* filtering (server-side; at 1,000+ records swap this for a Supabase query) */
  const pool = f.type === "heritage" ? verified : mainPool;
  const filtered = pool
    .filter((r: MediaRecord) => matchesYear(r.year, f.year))
    .filter((r: MediaRecord) => !f.topic || r.topics.some((t: string) => t.toLowerCase() === f.topic!.toLowerCase()))
    .filter((r: MediaRecord) => !f.language || r.language === f.language)
    .filter((r: MediaRecord) => !f.type || r.type === f.type)
    .filter((r: MediaRecord) => !f.role || r.role === f.role)
    .filter((r: MediaRecord) => !f.country || r.country === f.country)
    .filter((r: MediaRecord) => !f.publication || r.publication === f.publication)
    .filter((r: MediaRecord) => matchesQuery(r, f.q))
    .sort((a: MediaRecord, b: MediaRecord) => b.date.localeCompare(a.date));

  const shown = filtered.slice(0, (f.page ?? 1) * PAGE_SIZE);
  const hasMore = filtered.length > shown.length;
  const byYear = new Map<number, MediaRecord[]>();
  shown.forEach((r: MediaRecord) => byYear.set(r.year, [...(byYear.get(r.year) ?? []), r]));

  const perYear = new Map(tally<number>(verified.map((r: MediaRecord) => r.year)));
  const maxYear = Math.max(1, ...perYear.values());
  const countries = tally<string>(verified.map((r: MediaRecord) => String(r.country)));
  const languages = tally<string>(verified.map((r: MediaRecord) => String(r.language)));
  const maxLang = Math.max(1, ...languages.map(([, n]) => n));
  const featured = verified.filter((r: MediaRecord) => r.featured).slice(0, 8);
  const topicRows = TOPICS.map((t) => {
    const rs = verified.filter((r: MediaRecord) => r.topics.some((x: string) => x.toLowerCase() === t.toLowerCase()));
    const perY = new Map(tally<number>(rs.map((r: MediaRecord) => r.year)));
    return { t, total: rs.length, perY, max: Math.max(1, ...perY.values()) };
  }).filter((x) => x.total > 0);
  const maxTopic = Math.max(1, ...topicRows.map((x) => x.total));
  const heritageSorted = [...heritage].sort((a: MediaRecord, b: MediaRecord) => a.date.localeCompare(b.date));
  const activeFilters = Object.entries(f).filter(([k, v]) => k !== "page" && v).length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${SITE}/media`,
        url: `${SITE}/media`,
        name: "Anton Merkurov — Media Archive",
        description: "A public record, 2006—2026.",
        about: { "@type": "Person", name: "Anton Merkurov", url: SITE },
        mainEntity: { "@id": `${SITE}/media#list` },
      },
      {
        "@type": "ItemList",
        "@id": `${SITE}/media#list`,
        numberOfItems: primary.length,
        itemListElement: primary.slice(0, 100).map((r: MediaRecord, i: number) => {
          const src = directUrl(r);
          return {
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": r.type === "article" ? "Article" : "CreativeWork",
              name: r.title,
              datePublished: r.date,
              inLanguage: r.language,
              publisher: { "@type": "Organization", name: r.publication },
              url: `${SITE}/media/record/${r.slug}`,
              ...(src ? { sameAs: src } : {}),
            },
          };
        }),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#fafaf7] text-black [&_*]:[content-visibility:visible]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader />

      <main className="mx-auto max-w-[1280px] px-5 md:px-10">
        {/* HERO */}
        <section aria-labelledby="media-h1" className="py-20 md:py-32">
          <p className={`${mono} text-black/50`}>Archive</p>
          <h1 id="media-h1" className="mt-4 font-serif text-[clamp(4rem,14vw,11rem)] leading-[0.9] tracking-tight">MEDIA</h1>
          <p className="mt-6 font-serif text-2xl md:text-3xl">A public record, {FIRST_YEAR}—{LAST_YEAR}</p>
          <p className="mt-6 max-w-xl font-serif text-lg leading-relaxed text-black/70">
            Twenty years of appearances across international and Russian media, broadcasting, conferences,
            cultural institutions and digital archives.
          </p>
        </section>

        {/* STATS */}
        <section aria-label="Archive statistics" className={`${rule} grid grid-cols-2 gap-y-8 py-10 md:grid-cols-5`}>
          {[
            [`${FIRST_YEAR}—${LAST_YEAR}`, "Years"],
            [stats.records, "Media records"],
            [stats.publications, "Publications"],
            [stats.countries, "Countries"],
            [stats.languages, "Languages"],
          ].map(([n, l]) => (
            <div key={String(l)}>
              <p className="font-serif text-4xl tabular-nums md:text-5xl">{n}</p>
              <p className={`${mono} mt-2 text-black/50`}>{l}</p>
            </div>
          ))}
        </section>

        {/* TIMELINE OVERVIEW */}
        <section aria-labelledby="overview-h" className={`${rule} py-10`}>
          <h2 id="overview-h" className={`${mono} mb-6 text-black/50`}>Twenty years at a glance</h2>
          <ol className="flex items-end gap-[3px] md:gap-1.5" aria-label="Verified records per year">
            {[...YEARS].reverse().map((y) => {
              const n = perYear.get(y) ?? 0;
              return (
                <li key={y} className="flex-1">
                  <Link
                    href={href(f, { year: String(y) })}
                    aria-label={`${y}: ${n} records`}
                    title={`${y} · ${n}`}
                    className="group flex h-24 flex-col justify-end focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
                  >
                    <span
                      className="block w-full bg-black transition-opacity group-hover:opacity-100"
                      style={{ height: n ? `${Math.max(6, (n / maxYear) * 100)}%` : "1px", opacity: n ? 0.85 : 0.25 }}
                    />
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className={`${mono} mt-3 flex justify-between text-black/50`}><span>{FIRST_YEAR}</span><span>{LAST_YEAR}</span></div>
        </section>

        {/* FILTERS + SEARCH + TIMELINE */}
        <section id="archive" aria-labelledby="archive-h" className={`${rule} scroll-mt-20 py-10`}>
          <h2 id="archive-h" className="font-serif text-3xl md:text-4xl">Search the archive</h2>

          <form action="/media" method="get" role="search" className="mt-6 flex gap-3">
            {(["year", "topic", "language", "type", "role", "country", "publication"] as const).map(
              (k) => f[k] && <input key={k} type="hidden" name={k} value={f[k]} />,
            )}
            <label htmlFor="q" className="sr-only">Search title, publication, topic, country, language, year</label>
            <input
              id="q" name="q" defaultValue={f.q} type="search" autoComplete="off"
              placeholder="Anton Merkurov · Меркуров · Telegram · BBC · 2018"
              className="w-full border border-black/30 bg-transparent px-4 py-3 font-serif text-lg placeholder:text-black/30 focus:border-black focus:outline-none"
            />
            <button className={`${mono} border border-black bg-black px-6 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black`}>
              Search
            </button>
          </form>

          <div className="mt-8 space-y-6">
            <fieldset>
              <legend className={`${mono} mb-2 text-black/50`}>Year</legend>
              <div className="flex flex-wrap gap-2">
                <Link href={href(f, { year: undefined })} className={chip(!f.year)}>All</Link>
                {["2020s", "2010s", "2000s"].map((d) => (
                  <Link key={d} href={href(f, { year: d })} className={chip(f.year === d)}>{d}</Link>
                ))}
                {YEARS.map((y) => (
                  <Link key={y} href={href(f, { year: String(y) })} className={chip(f.year === String(y))} aria-current={f.year === String(y) ? "true" : undefined}>{y}</Link>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className={`${mono} mb-2 text-black/50`}>Topic</legend>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((t) => (
                  <Link key={t} href={href(f, { topic: f.topic === t ? undefined : t })} className={chip(f.topic === t)}>{t}</Link>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className={`${mono} mb-2 text-black/50`}>Format</legend>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map(([v, l]) => (
                  <Link key={v} href={href(f, { type: f.type === v ? undefined : v })} className={chip(f.type === v)}>{l}</Link>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className={`${mono} mb-2 text-black/50`}>Role</legend>
              <div className="flex flex-wrap gap-2">
                {ROLES.map(([v, l]) => (
                  <Link key={v} href={href(f, { role: f.role === v ? undefined : v })} className={chip(f.role === v)}>{l}</Link>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className={`${mono} mb-2 text-black/50`}>Language</legend>
              <div className="flex flex-wrap gap-2">
                {languages.map(([l]) => (
                  <Link key={l} href={href(f, { language: f.language === l ? undefined : l })} className={chip(f.language === l)}>{langName(l)}</Link>
                ))}
              </div>
            </fieldset>
          </div>

          <div className={`${mono} mt-8 flex flex-wrap items-center gap-4 text-black/60`} aria-live="polite">
            <span>{filtered.length} {filtered.length === 1 ? "record" : "records"}</span>
            {activeFilters > 0 && <Link href="/media#archive" className="underline underline-offset-4 hover:text-black">Reset</Link>}
          </div>

          {/* FEATURED (only on unfiltered view) */}
          {activeFilters === 0 && featured.length > 0 && (
            <div className={`${rule} mt-10 pt-8`}>
              <h3 className={`${mono} mb-4 text-black/50`}>Featured records</h3>
              <ul className="grid gap-x-10 gap-y-3 md:grid-cols-2">
                {featured.map((r: MediaRecord) => {
                  const src = directUrl(r);
                  return (
                    <li key={r.id} className="flex items-baseline justify-between gap-4 border-b border-black/10 pb-2 font-serif">
                      <Link href={`/media/record/${r.slug}`} className="hover:underline underline-offset-4">
                        <span className={`${mono} mr-3 text-black/50`}>{r.publication}</span>{r.title}
                      </Link>
                      {src && <Ext href={src} className={mono}>Source</Ext>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* FULL TIMELINE — years newest first */}
          <div id="timeline" className="mt-12">
            {filtered.length === 0 && (
              <p className="py-16 font-serif text-xl text-black/60">No verified records match this view.</p>
            )}
            {[...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, rs]) => (
              <section key={year} id={`y${year}`} aria-labelledby={`h${year}`} className="scroll-mt-24 border-t border-black py-10 md:grid md:grid-cols-12 md:gap-8">
                <h3 id={`h${year}`} className="font-serif text-5xl tabular-nums md:sticky md:top-24 md:col-span-2 md:self-start md:text-6xl">{year}</h3>
                <ol className="mt-6 divide-y divide-black/10 md:col-span-10 md:mt-0">
                  {rs.map((r: MediaRecord) => {
                    const src = directUrl(r);
                    return (
                      <li key={r.id} className="py-6 first:pt-0 [content-visibility:auto] [contain-intrinsic-size:auto_140px]">
                        <p className={`${mono} text-black/50`}>
                          {fmtDate(r.date)} / {r.language.toUpperCase()} / {r.type}
                        </p>
                        <p className={`${mono} mt-2`}>
                          <Link href={href(f, { publication: r.publication })} className="hover:underline underline-offset-4">{r.publication}</Link>
                        </p>
                        <h4 className="mt-2 max-w-3xl font-serif text-xl leading-snug md:text-2xl">
                          <Link href={`/media/record/${r.slug}`} className="hover:underline underline-offset-4">{r.title}</Link>
                        </h4>
                        {r.titleEn && r.titleEn !== r.title && (
                          <p className="mt-1 font-serif text-black/50">{r.titleEn}</p>
                        )}
                        {r.description && <p className="mt-2 max-w-2xl font-serif leading-relaxed text-black/70">{r.description}</p>}
                        <p className={`${mono} mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-black/60`}>
                          <span>{r.type} · {r.role.replace("_", " ")} · {r.language}</span>
                          {r.topics.map((t: string) => (
                            <Link key={t} href={href(f, { topic: t })} className="hover:text-black hover:underline underline-offset-4">#{t}</Link>
                          ))}
                          {src
                            ? r.type === "video"
                              ? <Ext href={src} className="text-black">Open</Ext>
                              : <Ext href={src} className="text-black">Source</Ext>
                            : <span>Source link pending</span>}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            {hasMore && (
              <div className="border-t border-black py-8">
                <Link href={href(f, { page: (f.page ?? 1) + 1 }, `y${[...byYear.keys()].pop()}`)} className={chip(false)}>
                  Continue · {filtered.length - shown.length} more
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* THEMATIC MAP */}
        {topicRows.length > 0 && (
          <section aria-labelledby="themes-h" className={`${rule} py-14`}>
            <h2 id="themes-h" className="font-serif text-3xl md:text-4xl">The thematic map</h2>
            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <caption className="sr-only">Records per topic per year</caption>
                <thead>
                  <tr className={`${mono} text-black/50`}>
                    <th scope="col" className="w-40 pb-3 text-left font-normal">Topic</th>
                    <th scope="col" className="pb-3 text-left font-normal">{FIRST_YEAR}</th>
                    <th scope="col" className="pb-3 text-right font-normal">{LAST_YEAR}</th>
                  </tr>
                </thead>
                <tbody>
                  {topicRows.map(({ t, total, perY, max }) => (
                    <tr key={t} className="border-t border-black/10">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        <Link href={href(f, { topic: t })} className={`${mono} hover:underline underline-offset-4`}>{t}</Link>
                        <span className={`${mono} ml-2 text-black/40`}>{total}</span>
                      </th>
                      <td colSpan={2} className="py-2">
                        <div className="flex gap-[2px]">
                          {[...YEARS].reverse().map((y) => {
                            const n = perY.get(y) ?? 0;
                            return (
                              <Link
                                key={y}
                                href={href(f, { topic: t, year: String(y) })}
                                aria-label={`${t} ${y}: ${n}`}
                                title={`${t} · ${y} · ${n}`}
                                className="h-4 flex-1 bg-black"
                                style={{ opacity: n ? 0.15 + 0.85 * (n / max) : 0.05 }}
                              />
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-8 space-y-2" aria-label="Topic intensity">
              {[...topicRows].sort((a, b) => b.total - a.total).map(({ t, total }) => (
                <li key={t} className="flex items-center gap-4">
                  <Link href={href(f, { topic: t })} className={`${mono} w-40 shrink-0 hover:underline underline-offset-4`}>{t}</Link>
                  <span className="h-2 bg-black" style={{ width: `${(total / maxTopic) * 100}%` }} aria-hidden="true" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* THE ARC */}
        <section aria-labelledby="arc-h" className={`${rule} py-14 md:grid md:grid-cols-12 md:gap-8`}>
          <h2 id="arc-h" className={`${mono} text-black/50 md:col-span-3`}>The Arc</h2>
          <div className="mt-6 md:col-span-9 md:mt-0">
            <p className="max-w-3xl font-serif text-3xl leading-tight md:text-5xl">
              The subjects changed. The question remained remarkably stable.
            </p>
            <ol className={`${mono} mt-10 flex flex-wrap gap-x-3 gap-y-2 text-black/70`} aria-label="Overlapping themes">
              {[
                ["Internet", "Internet"], ["Media", "Media"], ["Regulation", "Regulation"],
                ["Decentralized systems", "Technology"], ["Crypto / NFT", "Crypto / NFT"],
                ["Digital art", "Digital Art"], ["Heritage", "Heritage"], ["AI / sovereignty", "AI"],
              ].map(([label, topic], i, a) => (
                <li key={label} className="flex items-center gap-3">
                  <Link href={href(f, { topic })} className="hover:text-black hover:underline underline-offset-4">{label}</Link>
                  {i < a.length - 1 && <span aria-hidden="true">→</span>}
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-xl font-serif text-black/50">Overlapping themes, not career stages.</p>
          </div>
        </section>

        {/* HERITAGE */}
        <section id="heritage" aria-labelledby="heritage-h" className={`${rule} scroll-mt-20 py-14`}>
          <h2 id="heritage-h" className="font-serif text-3xl md:text-4xl">The Merkurov Legacy</h2>
          <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-black/70">
            Public history connected to the sculptor Sergei Merkurov and the cultural legacy of the family.
            Dates are shown only where a source gives them.
          </p>
          {heritageSorted.length === 0 ? (
            <p className={`${mono} mt-8 text-black/50`}>Records are being verified.</p>
          ) : (
            <ol className="mt-8 border-l border-black/20">
              {heritageSorted.map((r: MediaRecord) => {
                const src = directUrl(r);
                return (
                  <li key={r.id} className="relative py-4 pl-6 before:absolute before:left-[-3px] before:top-7 before:h-[5px] before:w-[5px] before:bg-black">
                    <p className={`${mono} text-black/50`}>{fmtDate(r.date)} · {r.publication}</p>
                    <p className="mt-1 font-serif text-xl">
                      <Link href={`/media/record/${r.slug}`} className="hover:underline underline-offset-4">{r.title}</Link>
                    </p>
                    {src && <Ext href={src} className={`${mono} mt-1 inline-block`}>Source</Ext>}
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-6"><Link href="/heritage" className={`${mono} underline underline-offset-4`}>Full heritage dossier →</Link></p>
        </section>

        {/* THE WORLD + LANGUAGES */}
        <section id="world" aria-labelledby="world-h" className={`${rule} scroll-mt-20 grid gap-14 py-14 md:grid-cols-2`}>
          <div>
            <h2 id="world-h" className="font-serif text-3xl md:text-4xl">The World</h2>
            <ul className="mt-8 divide-y divide-black/10">
              {countries.map(([c, n]) => (
                <li key={c}>
                  <Link href={href(f, { country: f.country === c ? undefined : c })} className="flex justify-between py-2 font-serif hover:underline underline-offset-4">
                    <span>{c}</span><span className={`${mono} text-black/50`}>{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-serif text-3xl md:text-4xl">Languages</h2>
            <ul className="mt-8 space-y-4">
              {languages.map(([l, n]) => (
                <li key={l}>
                  <Link href={href(f, { language: l })} className="block hover:opacity-70">
                    <span className={`${mono} flex justify-between`}><span>{langName(l)}</span><span className="text-black/50">{n}</span></span>
                    <span className="mt-1 block h-2 bg-black" style={{ width: `${(n / maxLang) * 100}%` }} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* SIGNATURE SOURCES */}
        <section aria-labelledby="sources-h" className={`${rule} py-14`}>
          <h2 id="sources-h" className={`${mono} mb-6 text-black/50`}>Signature sources</h2>
          <ul className="flex flex-wrap gap-x-8 gap-y-3 font-serif text-xl md:text-2xl">
            {SIGNATURE.map((s) => (
              <li key={s}><Link href={href(f, { publication: s })} className="hover:underline underline-offset-4">{s}</Link></li>
            ))}
          </ul>
        </section>

        {/* ARCHIVE NOTE */}
        <section aria-labelledby="note-h" className={`${rule} py-14 md:grid md:grid-cols-12 md:gap-8`}>
          <h2 id="note-h" className={`${mono} text-black/50 md:col-span-3`}>Archive note</h2>
          <div className="mt-6 md:col-span-6 md:mt-0">
            <p className="font-serif leading-relaxed text-black/70">
              This archive records publicly available appearances, publications, interviews, broadcasts,
              institutional records and cultural references. Dates, titles and source links are preserved
              where verified. The archive is continuously updated.
            </p>
            <p className={`${mono} mt-6`}>
              Last updated<br />
              {new Date().toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" }).toUpperCase()}
            </p>
          </div>
        </section>

        {/* FINAL NAVIGATION */}
        <section aria-labelledby="end-h" className="border-t border-black py-20">
          <h2 id="end-h" className="font-serif text-[clamp(2.5rem,8vw,6rem)] leading-none tracking-tight">THE RECORD CONTINUES.</h2>
          <p className="mt-6 font-serif text-3xl">
            <Link href={href({}, { year: String(LAST_YEAR) }, "timeline")} className="hover:underline underline-offset-8">{LAST_YEAR} →</Link>
          </p>
          <ul className={`${mono} mt-10 flex flex-wrap gap-x-8 gap-y-3`}>
            {[["/journal", "Journal"], ["/research", "Research"], ["/art", "Art"], ["/advising", "Advising"], ["/unframed", "UNFRAMED"]].map(([h, l]) => (
              <li key={h}><Link href={h} className="underline-offset-4 hover:underline">{l}</Link></li>
            ))}
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
