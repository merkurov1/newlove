import type { IssueEntry, IssuePayload, IssueLang } from "./types";

/**
 * Рендер выпуска Flow. Сигнатура прежняя:
 *   renderIssue(payload, { title, slug, siteUrl? }) -> { htmlWeb, htmlEmail, textEmail }
 * Порядок рубрик зашит в коде. Настройки шаблона (template) больше не используются.
 * Метрики берутся из payload.stats (схема schemaVersion 2). Текст модели (annotation,
 * modelAnnotation) в выпуск не выводится.
 */

type Stats = IssuePayload["stats"];
type LinkItem = IssuePayload["links"][number];
type PhotoItem = IssuePayload["photos"][number];
/** stats.delays: {seconds, count}. Если сборщик добавит label/external, строки подписываются по записям. */
type DelayRow = Stats["delays"][number] & { label?: string; external?: boolean };
type Opts = { title: string; canonical: string; number?: number | null };

const SITE = "https://www.merkurov.love";
// Оформление как на главной merkurov.love: бумага #FAF8F5, чернила #111111, серый zinc.
// Акцент один; по умолчанию совпадает с чернилами. Поменяй ACCENT, если нужен цветной.
const ACCENT = "#111111";
const PAPER = "#FAF8F5";
const INK = "#111111";
const SOFT = "#52525B"; // zinc-600
const LINE = "#D4D4D8"; // zinc-300
const CLARET = ACCENT;
const TINT = "#F0EDE6";
const BAR2 = "#D4D4D8";
// Шрифты сайта: если страница открывается внутри приложения, подхватятся его переменные
// (--font-serif, --font-sans, --font-mono), иначе работают запасные.
const SERIF_WEB = "var(--font-serif,'Source Serif 4',Georgia,'Times New Roman',serif)";
const SANS_WEB = "var(--font-sans,'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif)";
const MONO_WEB = "var(--font-mono,ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace)";
const SERIF_MAIL = "Georgia,'Times New Roman',serif";
const SANS_MAIL = "Arial,Helvetica,sans-serif";
const MONO_MAIL = "'Courier New',Courier,monospace";

const L = {
  ru: {
    brand: "Поток",
    issue: "Выпуск",
    utc: "Время указано по UTC",
    nav: { read: "Читать", watch: "Смотреть", frame: "Кадр", stats: "Цифры", src: "Источники", join: "Подписка" },
    main: "Главные цифры",
    published: "опубликовано",
    drafts: "черновиков",
    total: "записей в таблице",
    days: "дней работы потока",
    median: "медиана от создания до публикации",
    lead: "Главное. Заметка автора",
    leadPub: "Опубликовано в",
    latest: "Последнее в потоке",
    read: "Читать",
    watch: "Смотреть",
    frame: "Кадр",
    stats: "Цифры подробнее",
    perDay: "Записей по дням",
    byType: "Что опубликовано",
    ownExt: "Своё и чужое",
    own: "своих",
    ext: "чужих",
    kinds: "О чём записи",
    kindNames: ["о самом потоке", "из внешнего мира", "прочее"],
    hours: "Когда создаются записи, часы UTC",
    quality: "Язык и качество записей",
    delays: "Время от создания до публикации",
    delaysNote: "Шкала логарифмическая, светлые полосы — чужие материалы.",
    delaysNote2: "Шкала логарифмическая: каждая строка показывает, сколько записей ушло за указанное время.",
    sources: "Указатель источников",
    colSource: "Источник",
    colItem: "Материал",
    colOrig: "Дата оригинала",
    colAdded: "В потоке",
    unknown: "не указана",
    age: "давность",
    ageDays: "дн.",
    inStream: "в потоке",
    join: "Подписка",
    joinTitle: "Я ничего не пишу, я только отбираю.",
    joinCopy: "Раз в неделю из этого собирается выпуск без редакции, только вкус одного человека, умноженный на код.",
    joinCta: "Получать выпуск",
    openWeb: "Открыть выпуск в браузере",
    openPage: "Постоянная страница выпуска",
    types: { note: "Заметка", link: "Ссылка", video: "Видео", photo: "Фото" } as Record<string, string>,
    typePlural: { note: "Заметки", link: "Ссылки", video: "Видео", photo: "Фото" } as Record<string, string>,
    qLang: "Язык записи не совпадает с языком текста",
    qAlt: "Подпись фото равна имени файла",
    qEmpty: "Пустые или тестовые черновики",
    of: "из",
    watchCta: "Смотреть",
  },
  en: {
    brand: "Flow",
    issue: "Issue",
    utc: "Times are shown in UTC",
    nav: { read: "Read", watch: "Watch", frame: "Frame", stats: "Numbers", src: "Sources", join: "Subscribe" },
    main: "Key numbers",
    published: "published",
    drafts: "drafts",
    total: "records in the table",
    days: "days of the stream",
    median: "median time from creation to publication",
    lead: "Lead. A note by the author",
    leadPub: "Published at",
    latest: "Latest in the stream",
    read: "Read",
    watch: "Watch",
    frame: "Frame",
    stats: "More numbers",
    perDay: "Entries per day",
    byType: "What was published",
    ownExt: "Own and external",
    own: "own",
    ext: "external",
    kinds: "What the entries are about",
    kindNames: ["the stream itself", "the outside world", "other"],
    hours: "When entries are created, UTC hours",
    quality: "Language and data quality",
    delays: "Time from creation to publication",
    delaysNote: "Logarithmic scale, light bars are external materials.",
    delaysNote2: "Logarithmic scale: each row shows how many entries took that long.",
    sources: "Source index",
    colSource: "Source",
    colItem: "Item",
    colOrig: "Original date",
    colAdded: "In the stream",
    unknown: "not stated",
    age: "age",
    ageDays: "days",
    inStream: "in the stream since",
    join: "Subscribe",
    joinTitle: "I don’t write. I select.",
    joinCopy: "Once a week it becomes an issue with no newsroom: one person’s taste multiplied by code.",
    joinCta: "Get the issue",
    openWeb: "Read this issue online",
    openPage: "Permanent issue page",
    types: { note: "Note", link: "Link", video: "Video", photo: "Photo" } as Record<string, string>,
    typePlural: { note: "Notes", link: "Links", video: "Videos", photo: "Photos" } as Record<string, string>,
    qLang: "Language field differs from the text language",
    qAlt: "Photo alt equals the file name",
    qEmpty: "Empty or test drafts",
    of: "of",
    watchCta: "Watch",
  },
} as const;

/* ---------- helpers ---------- */

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value, SITE);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const loc = (lang: IssueLang) => (lang === "ru" ? "ru-RU" : "en-GB");

function fmt(value: string | undefined | null, lang: IssueLang, opts: Intl.DateTimeFormatOptions): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(loc(lang), { timeZone: "UTC", ...opts }).format(d);
}

const dateLong = (v: string | undefined | null, lang: IssueLang) =>
  fmt(v, lang, { day: "numeric", month: "long", year: "numeric" });
const dayShort = (v: string | undefined | null, lang: IssueLang) =>
  fmt(v, lang, { day: "numeric", month: "short" }).replace(/\./g, "");
const hhmm = (v: string | undefined | null, lang: IssueLang) =>
  fmt(v, lang, { hour: "2-digit", minute: "2-digit", hour12: false });

function duration(seconds: number, lang: IssueLang): string {
  const n = Math.max(0, Math.round(seconds));
  const ru = lang === "ru";
  if (n < 60) return ru ? `${n} с` : `${n}s`;
  if (n < 3600) return ru ? `${Math.round(n / 60)} мин` : `${Math.round(n / 60)} min`;
  let h = Math.floor(n / 3600);
  let m = Math.round((n % 3600) / 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  const mm = String(m).padStart(2, "0");
  return ru ? `${h} ч ${mm}` : `${h}h ${mm}`;
}

function paragraphs(value: string | undefined | null, font: string, size: number): string {
  return String(value ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${font};font-size:${size}px;line-height:1.65;color:${INK};overflow-wrap:anywhere;">${esc(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

const looksLikeFile = (s: unknown) => typeof s === "string" && /\.(jpe?g|png|gif|webp|heic)$/i.test(s.trim());
const photoAlt = (p: PhotoItem) => (looksLikeFile(p.alt) ? p.caption || "" : p.alt || p.caption || "");
const entryHref = (e: IssueEntry) => safeUrl(e.url) || `${SITE}/flow/${e.id}`;
const entryTitle = (e: IssueEntry) => e.title || String(e.body || "").slice(0, 70) || entryHref(e);
const logWidth = (s: number, max: number) =>
  max <= 1 ? 100 : Math.max(8, Math.round((Math.log10(Math.max(s, 1)) / Math.log10(max)) * 100));

const videoChannel = (v: IssueEntry) => String(v.metadata?.youtube?.author_name ?? v.metadata?.site_name ?? "");
function entriesWord(n: number, lang: IssueLang): string {
  if (lang === "en") return n === 1 ? "entry" : "entries";
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return "запись";
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return "записи";
  return "записей";
}
const sortedDelays = (st: Stats): DelayRow[] => [...(st.delays as DelayRow[])].sort((x, y) => x.seconds - y.seconds);
const delayLabel = (d: DelayRow, lang: IssueLang) => d.label ?? `${d.count} ${entriesWord(d.count, lang)}`;

function linkMeta(item: LinkItem, lang: IssueLang): string {
  const t = L[lang];
  const parts = [item.siteName, item.author, item.originalDate ? dateLong(item.originalDate, lang) : ""].filter(Boolean);
  const age = item.ageDays;
  if (age !== null && age >= 2) parts.push(`${t.age} ${age} ${t.ageDays}`);
  return parts.join(". ");
}

function issueTitle(payload: IssuePayload, number?: number | null) {
  const lang = payload.lang;
  const t = L[lang];
  const period = `${dateLong(payload.period.start, lang)} — ${dateLong(payload.period.end, lang)}`;
  const num = number ? `${t.issue} №${number}` : t.issue;
  return { period, num };
}

/* ---------- WEB ---------- */

const WEB_CSS = `
:root{--bg:${PAPER};--ink:${INK};--soft:${SOFT};--line:${LINE};--claret:${ACCENT};--tint:${TINT};--bar:${INK};--bar2:${BAR2};
--serif:${SERIF_WEB};--sans:${SANS_WEB};--mono:${MONO_WEB}}
*{box-sizing:border-box}html{background:var(--bg);scroll-padding-top:12px;color-scheme:light}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 var(--serif);padding-top:env(safe-area-inset-top,0);padding-bottom:env(safe-area-inset-bottom,0);-webkit-font-smoothing:antialiased}
body:before{content:'';position:fixed;inset:0;pointer-events:none;opacity:.025;mix-blend-mode:overlay;z-index:5;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
::selection{background:var(--ink);color:var(--bg)}
a{color:inherit}.page{max-width:1120px;margin:0 auto;padding:22px 20px 64px;position:relative;z-index:10}
.top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font:12px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--soft);padding-bottom:12px}
.mast{border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);padding:26px 0 18px;text-align:center}
.mast h1{margin:0;font:400 clamp(52px,12vw,104px)/1.05 var(--serif);letter-spacing:-.02em}
.nav{display:flex;gap:10px 30px;justify-content:center;flex-wrap:wrap;font:500 12px var(--mono);letter-spacing:.2em;text-transform:uppercase;padding:14px 0;border-bottom:1px solid var(--line)}
.nav a{text-decoration:underline;text-underline-offset:8px;text-decoration-color:#D4D4D8;padding:6px 0}.nav a:hover{text-decoration-color:var(--ink)}
.g{display:grid;grid-template-columns:1fr;gap:0 40px;margin-top:40px}
@media(min-width:900px){.g{grid-template-columns:repeat(12,1fr)}.c8{grid-column:span 8}.c4{grid-column:span 4}.c6{grid-column:span 6}.c12{grid-column:span 12}}
section,aside{margin-bottom:48px;min-width:0}
.k{font:500 12px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--soft);margin:0 0 12px}
h2{font:400 clamp(32px,5vw,52px)/1.1 var(--serif);margin:0 0 14px;letter-spacing:-.015em;overflow-wrap:anywhere}
h3{font:400 21px/1.28 var(--serif);margin:0 0 6px;overflow-wrap:anywhere}
.by{font:italic 15px var(--serif);color:var(--soft);margin:0 0 20px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.meta{font:13px var(--sans);color:var(--soft);margin:0}.card p{margin:0 0 8px}
.feed{list-style:none;margin:0;padding:0}
.feed li{display:grid;grid-template-columns:78px 1fr;gap:10px;padding:12px 0;border-top:1px solid var(--line);font-size:16px;line-height:1.35}
.feed li:first-child{border-top:0}.feed time{font:12px var(--mono);color:var(--soft)}
.feed b{font:500 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--soft);display:block;margin-bottom:2px}
.nums{display:grid;grid-template-columns:repeat(2,1fr);border-top:1px solid var(--ink);border-bottom:1px solid var(--line)}
@media(min-width:700px){.nums{grid-template-columns:repeat(var(--n,5),1fr)}}
.nums div{padding:18px 0 16px 16px;border-left:1px solid var(--line)}.nums div:first-child{border-left:0;padding-left:0}
.nums b{display:block;font:400 46px/1 var(--serif)}.nums span{font:13px var(--sans);color:var(--soft)}
.row{display:grid;grid-template-columns:96px 1fr 56px;gap:10px;align-items:center;font:13px var(--sans);margin:7px 0}
.rowL{grid-template-columns:150px 1fr 56px}.row i{display:block;height:10px;background:var(--bar)}.row.alt i{background:var(--bar2)}
.row span:last-child{text-align:right;color:var(--soft)}
.days{display:flex;align-items:flex-end;gap:14px;height:130px;border-bottom:1px solid var(--ink);margin-top:26px}
.days div{flex:1;background:var(--bar);position:relative}
.days i{position:absolute;top:-22px;width:100%;text-align:center;font:500 13px var(--mono);font-style:normal}
.dl{display:flex;gap:14px;margin-top:6px}.dl span{flex:1;text-align:center;font:12px var(--mono);color:var(--soft)}
.stack{display:flex;height:34px;margin:10px 0 8px}.stack div{display:flex;align-items:center;padding-left:8px;font:500 12px var(--mono);color:#FAF8F5;overflow:hidden}
.legend{font:13px var(--sans);color:var(--soft);margin:0}.cap{font:13.5px/1.5 var(--sans);color:var(--soft);margin:12px 0 0}
.cards{display:grid;grid-template-columns:1fr;gap:30px}@media(min-width:760px){.cards{grid-template-columns:repeat(3,1fr)}}
.v4{display:grid;grid-template-columns:1fr;gap:28px}@media(min-width:700px){.v4{grid-template-columns:1fr 1fr}}@media(min-width:1000px){.v4{grid-template-columns:repeat(4,1fr)}}
.card{display:block;text-decoration:none;border-top:1px solid var(--ink);padding-top:14px}.card:hover h3{text-decoration:underline;text-underline-offset:5px;text-decoration-color:#A1A1AA}
.thumb{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;margin:0 0 12px;background:var(--tint)}
.plate{position:relative;aspect-ratio:16/9;background:var(--tint);margin-bottom:12px;overflow:hidden}
.plate img{width:100%;height:100%;object-fit:cover;display:block}
.plate:before{content:'';position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(17,17,17,.62)}
.plate:after{content:'';position:absolute;left:50%;top:50%;margin:-11px 0 0 -6px;border-left:20px solid #FAF8F5;border-top:11px solid transparent;border-bottom:11px solid transparent}
.frame{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--tint);margin-bottom:8px}
.strip{display:grid;grid-template-columns:repeat(24,1fr);gap:2px;margin-top:12px}.strip i{height:34px;background:var(--bar)}
.sl{display:flex;justify-content:space-between;font:12px var(--mono);color:var(--soft);margin-top:4px}
table{width:100%;border-collapse:collapse;font:14px var(--sans)}
th{font:500 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;text-align:left;color:var(--soft);border-bottom:1px solid var(--ink);padding:6px 8px 8px 0}
td{padding:10px 8px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}.scroll{overflow-x:auto}
.data{background:var(--tint);padding:16px 18px;font:14px/1.55 var(--sans)}.data p{margin:0 0 6px}
.statsHead{border-top:1px solid var(--ink);padding-top:16px;margin-bottom:16px}.statsHead .k{margin:0}
.sub{border-top:1px solid var(--ink);padding-top:22px;text-align:center}.sub h2{font-size:clamp(28px,4vw,42px)}
.dek{font:italic 20px/1.5 var(--serif);color:var(--soft);margin:0 auto 22px;max-width:640px}
.mail{display:inline-flex;align-items:center;gap:10px;border:1px solid rgba(17,17,17,.2);background:rgba(255,255,255,.8);color:var(--ink);padding:14px 30px;border-radius:999px;font:italic 18px var(--serif);text-decoration:none;transition:all .3s}
.mail:hover{background:var(--ink);color:var(--bg)}
footer{border-top:1px solid var(--ink);padding-top:14px;font:12px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--soft)}
`;

function webStack(parts: { value: number; label?: string; color: string; dark?: boolean }[]): string {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return "";
  return `<div class="stack">${parts
    .filter((p) => p.value > 0)
    .map(
      (p) =>
        `<div style="width:${((p.value / total) * 100).toFixed(1)}%;background:${p.color};${p.dark ? "color:#1C1A1B;" : ""}">${esc(p.label ?? p.value)}</div>`,
    )
    .join("")}</div>`;
}

function renderWeb(payload: IssuePayload, ext: Stats, o: Opts): string {
  const lang = payload.lang;
  const t = L[lang];
  const { period, num } = issueTitle(payload, o.number);
  const has = {
    read: payload.links.length > 0,
    watch: payload.videos.length > 0,
    frame: payload.photos.length > 0,
    stats: true,
    src: payload.sourceIndex.length > 0,
    join: true,
  };
  const navKeys = (["read", "watch", "frame", "stats", "src", "join"] as const).filter((k) => has[k]);

  // Главные цифры
  const nums: [string | number, string][] = [];
  if (ext.total != null) nums.push([ext.total, t.total]);
  nums.push([ext.published, t.published]);
  if (ext.drafts != null) nums.push([ext.drafts, t.drafts]);
  if (ext.days) nums.push([ext.days, t.days]);
  if (ext.medianDelaySeconds != null) nums.push([duration(ext.medianDelaySeconds, lang), t.median]);

  // Главное + последнее
  const lead = payload.lead;
  const leadHtml = lead
    ? `<section id="lead" class="c8">
        <p class="k">${esc(t.lead)}</p>
        <h2>${esc(lead.title || t.lead)}</h2>
        <p class="by">${esc(dateLong(lead.publishedAt, lang))}, ${esc(hhmm(lead.publishedAt, lang))} UTC</p>
        ${paragraphs(lead.body, "var(--serif)", 18)}
        ${safeUrl(lead.url) ? `<p class="meta"><a href="${esc(safeUrl(lead.url))}" style="color:var(--claret)">${esc(lead.url)}</a></p>` : ""}
      </section>`
    : "";
  const latestHtml = payload.latest.length
    ? `<aside class="${lead ? "c4" : "c12"}">
        <p class="k">${esc(t.latest)}</p>
        <ul class="feed">${payload.latest
          .slice(0, 6)
          .map(
            (e) =>
              `<li><time>${esc(dayShort(e.publishedAt, lang))}<br>${esc(hhmm(e.publishedAt, lang))}</time><div><b>${esc(t.types[e.type] || e.type)}</b><a href="${esc(entryHref(e))}" style="text-decoration:none">${esc(entryTitle(e))}</a></div></li>`,
          )
          .join("")}</ul>
      </aside>`
    : "";

  // Читать
  const readHtml = has.read
    ? `<section id="read" class="c12"><p class="k">${esc(t.read)}</p><div class="cards">${payload.links
        .map((it) => {
          const img = safeUrl(it.image);
          return `<a class="card" href="${esc(entryHref(it))}">${img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">` : ""}<h3>${esc(entryTitle(it))}</h3>${it.description ? `<p>${esc(it.description)}</p>` : ""}<p class="meta">${esc(linkMeta(it, lang))}</p></a>`;
        })
        .join("")}</div></section>`
    : "";

  // Смотреть
  const watchHtml = has.watch
    ? `<section id="watch" class="c12"><p class="k">${esc(t.watch)}</p><div class="v4">${payload.videos
        .map((v) => {
          const img = safeUrl(v.image);
          const meta = [videoChannel(v), `${t.inStream} ${dayShort(v.publishedAt, lang)}`].filter(Boolean).join(". ");
          return `<a class="card" href="${esc(entryHref(v))}"><div class="plate">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}</div><h3>${esc(entryTitle(v))}</h3><p class="meta">${esc(meta)}</p></a>`;
        })
        .join("")}</div></section>`
    : "";

  // Кадр
  const frameHtml = has.frame
    ? `<section id="frame" class="c12"><p class="k">${esc(t.frame)}</p><div class="v4">${payload.photos
        .map((p) => {
          const img = safeUrl(p.image);
          return `<div>${img ? `<img class="frame" src="${esc(img)}" alt="${esc(photoAlt(p))}" loading="lazy">` : `<div class="frame"></div>`}<p class="meta">${esc(dayShort(p.publishedAt, lang))}${p.caption ? `. ${esc(p.caption)}` : ""}</p></div>`;
        })
        .join("")}</div></section>`
    : "";

  // Цифры подробнее
  const bt = ext.byType || {};
  const typeStack = webStack([
    { value: bt.note || 0, color: CLARET },
    { value: bt.link || 0, color: "#3F3F46" },
    { value: bt.video || 0, color: "#A1A1AA", dark: true },
    { value: bt.photo || 0, color: "#D4D4D8", dark: true },
  ]);
  const typeLegend = ["note", "link", "video", "photo"].map((k) => `${t.typePlural[k]} ${bt[k] || 0}`).join(", ");

  const perDayMax = Math.max(1, ...(ext.perDay || []).map((d) => d.count));
  const perDayHtml = ext.perDay?.length
    ? `<section class="c4"><p class="k">${esc(t.perDay)}</p>
        <div class="days">${ext.perDay.map((d) => `<div style="height:${Math.max(4, Math.round((d.count / perDayMax) * 100))}%"><i>${d.count}</i></div>`).join("")}</div>
        <div class="dl">${ext.perDay.map((d) => `<span>${esc(fmt(d.date, lang, { day: "numeric" }))}</span>`).join("")}</div></section>`
    : "";

  const compHtml = `<section class="c4"><p class="k">${esc(t.byType)}</p>${typeStack}<p class="legend">${esc(typeLegend)}</p>
      ${ext.own + ext.external > 0 ? `<p class="k" style="margin-top:22px">${esc(t.ownExt)}</p>${webStack([{ value: ext.own, label: `${ext.own} ${t.own}`, color: CLARET }, { value: ext.external, label: `${ext.external} ${t.ext}`, color: BAR2, dark: true }])}` : ""}</section>`;

  const kindHtml = ext.byKind
    ? `<section class="c4"><p class="k">${esc(t.kinds)}</p>${webStack([{ value: ext.byKind.about_flow, color: CLARET }, { value: ext.byKind.world, color: BAR2, dark: true }, { value: ext.byKind.other, color: LINE, dark: true }])}<p class="legend">${esc(`${ext.byKind.about_flow} ${t.kindNames[0]}, ${ext.byKind.world} ${t.kindNames[1]}, ${ext.byKind.other} ${t.kindNames[2]}`)}</p></section>`
    : "";

  const hours = new Map((ext.byUtcHour || []).map((h) => [h.hour, h.count]));
  const maxH = Math.max(0, ...hours.values());
  const stripHtml = maxH
    ? `<section class="c6"><p class="k">${esc(t.hours)}</p><div class="strip">${Array.from({ length: 24 }, (_, h) => {
        const c = hours.get(h) || 0;
        return `<i title="${String(h).padStart(2, "0")}:00 UTC: ${c}" style="opacity:${c ? (0.25 + (c / maxH) * 0.75).toFixed(2) : "0.08"}"></i>`;
      }).join("")}</div><div class="sl"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></section>`
    : "";

  const q = ext.quality;
  const qLines: string[] = [
    `${t.qLang}: ${q.langFieldMismatch} ${t.of} ${ext.published}.`,
    `${t.qAlt}: ${q.photoAltEqualsFilename} ${t.of} ${bt.photo || 0}.`,
    `${t.qEmpty}: ${q.emptyDrafts} ${t.of} ${ext.drafts}.`,
  ];
  const qualityHtml = ext.drafts + ext.published > 0
    ? `<section class="c6"><p class="k">${esc(t.quality)}</p><div class="data">${qLines.map((l) => `<p>${esc(l)}</p>`).join("")}</div></section>`
    : "";

  const dl = sortedDelays(ext);
  const hasExt = dl.some((d) => d.external !== undefined);
  const maxD = Math.max(1, ...dl.map((d) => d.seconds));
  const delaysHtml = dl.length
    ? `<section class="c12"><p class="k">${esc(t.delays)}</p>${dl
        .map((d) => `<div class="row rowL${d.external ? " alt" : ""}"><span>${esc(delayLabel(d, lang))}</span><i style="width:${logWidth(d.seconds, maxD)}%"></i><span>${esc(duration(d.seconds, lang))}</span></div>`)
        .join("")}<p class="cap">${esc(hasExt ? t.delaysNote : t.delaysNote2)}</p></section>`
    : "";

  // Источники
  const srcHtml = has.src
    ? `<section id="src" class="c12"><p class="k">${esc(t.sources)}</p><div class="scroll"><table>
        <tr><th>${esc(t.colSource)}</th><th>${esc(t.colItem)}</th><th>${esc(t.colOrig)}</th><th>${esc(t.colAdded)}</th></tr>
        ${payload.sourceIndex
          .map((s) => {
            const href = safeUrl(s.url);
            const title = esc(s.title || s.source);
            return `<tr><td>${esc(s.source)}</td><td>${href ? `<a href="${esc(href)}">${title}</a>` : title}</td><td>${esc(s.originalDate ? dateLong(s.originalDate, lang) : t.unknown)}</td><td>${esc(s.addedAt ? dayShort(s.addedAt, lang) : "")}</td></tr>`;
          })
          .join("")}</table></div></section>`
    : "";

  const joinHtml = `<section id="join" class="c12 sub"><p class="k">${esc(t.join)}</p><h2>${esc(t.joinTitle)}</h2><p class="dek">${esc(t.joinCopy)}</p><a class="mail" href="${SITE}/flow/join">${esc(t.joinCta)} <span aria-hidden="true">↗</span></a></section>`;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(`${t.brand}. ${num}. ${period}`)}">
<link rel="canonical" href="${esc(o.canonical)}">
<style>${WEB_CSS}</style>
</head>
<body>
<div class="page">
<div class="top"><span>${esc(period)}</span><span>${esc(num)}. ${esc(t.utc)}</span><span>merkurov.love/flow</span></div>
<header class="mast"><h1>${esc(t.brand)}</h1></header>
<nav class="nav">${navKeys.map((k) => `<a href="#${k}">${esc(t.nav[k])}</a>`).join("")}</nav>
<div class="g">
<section class="c12"><p class="k">${esc(t.main)}</p><div class="nums" style="--n:${nums.length}">${nums.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div></section>
${leadHtml}${latestHtml}
${readHtml}${watchHtml}${frameHtml}
<div class="c12 statsHead" id="stats"><p class="k">${esc(t.stats)}</p></div>
${perDayHtml}${compHtml}${kindHtml}${stripHtml}${qualityHtml}${delaysHtml}
${srcHtml}${joinHtml}
</div>
<footer><a href="${esc(o.canonical)}">${esc(t.openPage)}</a></footer>
</div>
</body>
</html>`;
}

/* ---------- EMAIL ---------- */

function mailH(label: string): string {
  return `<p style="margin:34px 0 12px;padding-top:14px;border-top:1px solid ${INK};font-family:${MONO_MAIL};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${SOFT};">${esc(label)}</p>`;
}

function mailBars(rows: { label: string; value: number; text: string; light?: boolean }[], max: number, log = false): string {
  if (!rows.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows
    .map((r) => {
      const w = log ? logWidth(r.value, max) : Math.max(3, Math.round((r.value / Math.max(1, max)) * 100));
      const c = r.light ? BAR2 : CLARET;
      return `<tr>
<td width="120" style="padding:5px 8px 5px 0;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(r.label)}</td>
<td style="padding:5px 0;"><table role="presentation" width="${w}%" cellpadding="0" cellspacing="0" border="0"><tr><td height="9" bgcolor="${c}" style="height:9px;background:${c};font-size:0;line-height:0;">&nbsp;</td></tr></table></td>
<td width="56" align="right" style="padding:5px 0 5px 8px;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(r.text)}</td></tr>`;
    })
    .join("")}</table>`;
}

function renderEmail(payload: IssuePayload, ext: Stats, o: Opts): string {
  const lang = payload.lang;
  const t = L[lang];
  const { period, num } = issueTitle(payload, o.number);

  const nums: [string | number, string][] = [];
  if (ext.total != null) nums.push([ext.total, t.total]);
  nums.push([ext.published, t.published]);
  if (ext.drafts != null) nums.push([ext.drafts, t.drafts]);
  if (ext.medianDelaySeconds != null) nums.push([duration(ext.medianDelaySeconds, lang), t.median]);
  const numsHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${INK};border-bottom:1px solid ${LINE};"><tr>${nums
    .map(
      ([v, l], i) =>
        `<td valign="top" style="padding:14px 6px 12px ${i ? 12 : 0}px;${i ? `border-left:1px solid ${LINE};` : ""}"><div style="font-family:${SERIF_MAIL};font-size:30px;line-height:1.1;color:${INK};">${esc(v)}</div><div style="font-family:${SANS_MAIL};font-size:11px;line-height:1.35;color:${SOFT};">${esc(l)}</div></td>`,
    )
    .join("")}</tr></table>`;

  const lead = payload.lead;
  const leadHtml = lead
    ? `${mailH(t.lead)}<h2 style="margin:0 0 8px;font-family:${SERIF_MAIL};font-size:30px;line-height:1.12;font-weight:normal;color:${INK};">${esc(lead.title || t.lead)}</h2>
<p style="margin:0 0 16px;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(dateLong(lead.publishedAt, lang))}, ${esc(hhmm(lead.publishedAt, lang))} UTC</p>${paragraphs(lead.body, SERIF_MAIL, 16)}`
    : "";

  const latestHtml = payload.latest.length
    ? `${mailH(t.latest)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${payload.latest
        .slice(0, 6)
        .map(
          (e) =>
            `<tr><td width="74" valign="top" style="padding:8px 8px 8px 0;border-top:1px solid ${LINE};font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(dayShort(e.publishedAt, lang))}<br>${esc(hhmm(e.publishedAt, lang))}</td><td style="padding:8px 0;border-top:1px solid ${LINE};font-family:${SERIF_MAIL};font-size:15px;line-height:1.35;color:${INK};"><span style="font-family:${MONO_MAIL};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${SOFT};">${esc(t.types[e.type] || e.type)}</span><br><a href="${esc(entryHref(e))}" style="color:${INK};text-decoration:none;">${esc(entryTitle(e))}</a></td></tr>`,
        )
        .join("")}</table>`
    : "";

  const img = (url: unknown, alt: string, href: string) => {
    const u = safeUrl(url);
    return u
      ? `<a href="${esc(href)}"><img src="${esc(u)}" alt="${esc(alt)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;margin:0 0 10px;"></a>`
      : "";
  };

  const readHtml = payload.links.length
    ? mailH(t.read) +
      payload.links
        .map(
          (it) =>
            `<div style="margin:0 0 26px;">${img(it.image, "", entryHref(it))}<h3 style="margin:0 0 6px;font-family:${SERIF_MAIL};font-size:21px;line-height:1.25;"><a href="${esc(entryHref(it))}" style="color:${INK};text-decoration:none;">${esc(entryTitle(it))}</a></h3>${it.description ? `<p style="margin:0 0 6px;font-family:${SERIF_MAIL};font-size:15px;line-height:1.6;color:${INK};">${esc(it.description)}</p>` : ""}<p style="margin:0;font-family:${SANS_MAIL};font-size:12px;line-height:1.5;color:${SOFT};">${esc(linkMeta(it, lang))}</p></div>`,
        )
        .join("")
    : "";

  const watchHtml = payload.videos.length
    ? mailH(t.watch) +
      payload.videos
        .map(
          (v) =>
            `<div style="margin:0 0 26px;">${img(v.image, "", entryHref(v))}<h3 style="margin:0 0 6px;font-family:${SERIF_MAIL};font-size:20px;line-height:1.25;"><a href="${esc(entryHref(v))}" style="color:${INK};text-decoration:none;">${esc(entryTitle(v))}</a></h3><p style="margin:0;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc([videoChannel(v), `${t.inStream} ${dayShort(v.publishedAt, lang)}`].filter(Boolean).join(". "))} &nbsp;<a href="${esc(entryHref(v))}" style="color:${INK};">${esc(t.watchCta)} →</a></p></div>`,
        )
        .join("")
    : "";

  const frameHtml = payload.photos.length
    ? mailH(t.frame) +
      payload.photos
        .map((p) => {
          const u = safeUrl(p.image);
          return `<div style="margin:0 0 22px;">${u ? `<img src="${esc(u)}" alt="${esc(photoAlt(p))}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;">` : ""}<p style="margin:6px 0 0;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(dayShort(p.publishedAt, lang))}${p.caption ? `. ${esc(p.caption)}` : ""}</p></div>`;
        })
        .join("")
    : "";

  const bt = ext.byType || {};
  let stats = mailH(t.stats);
  if (ext.perDay?.length) {
    const mx = Math.max(1, ...ext.perDay.map((d) => d.count));
    stats += `<p style="margin:0 0 6px;font-family:${SANS_MAIL};font-size:12px;font-weight:bold;color:${INK};">${esc(t.perDay)}</p>${mailBars(ext.perDay.map((d) => ({ label: fmt(d.date, lang, { day: "numeric", month: "short" }).replace(/\./g, ""), value: d.count, text: String(d.count) })), mx)}`;
  }
  stats += `<p style="margin:18px 0 6px;font-family:${SANS_MAIL};font-size:12px;font-weight:bold;color:${INK};">${esc(t.byType)}</p>${mailBars(["note", "link", "video", "photo"].map((k) => ({ label: t.typePlural[k], value: bt[k] || 0, text: String(bt[k] || 0) })), Math.max(1, ...["note", "link", "video", "photo"].map((k) => bt[k] || 0)))}`;
  if (ext.own + ext.external > 0) {
    const { own, external } = ext;
    stats += `<p style="margin:18px 0 6px;font-family:${SANS_MAIL};font-size:12px;font-weight:bold;color:${INK};">${esc(t.ownExt)}</p>${mailBars([{ label: t.own, value: own, text: String(own) }, { label: t.ext, value: external, text: String(external), light: true }], Math.max(own, external, 1))}`;
  }
  if (ext.byKind) {
    const k = ext.byKind;
    stats += `<p style="margin:18px 0 6px;font-family:${SANS_MAIL};font-size:12px;font-weight:bold;color:${INK};">${esc(t.kinds)}</p>${mailBars([{ label: t.kindNames[0], value: k.about_flow, text: String(k.about_flow) }, { label: t.kindNames[1], value: k.world, text: String(k.world), light: true }, { label: t.kindNames[2], value: k.other, text: String(k.other), light: true }], Math.max(k.about_flow, k.world, k.other, 1))}`;
  }
  const dly = sortedDelays(ext);
  if (dly.length) {
    const mx = Math.max(1, ...dly.map((d) => d.seconds));
    stats += `<p style="margin:18px 0 6px;font-family:${SANS_MAIL};font-size:12px;font-weight:bold;color:${INK};">${esc(t.delays)}</p>${mailBars(dly.map((d) => ({ label: delayLabel(d, lang), value: d.seconds, text: duration(d.seconds, lang), light: !!d.external })), mx, true)}<p style="margin:8px 0 0;font-family:${SANS_MAIL};font-size:11px;color:${SOFT};">${esc(dly.some((d) => d.external !== undefined) ? t.delaysNote : t.delaysNote2)}</p>`;
  }
  stats += `<p style="margin:14px 0 0;font-family:${SANS_MAIL};font-size:11px;color:${SOFT};">${esc(t.utc)}.</p>`;

  const srcHtml = payload.sourceIndex.length
    ? mailH(t.sources) +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${payload.sourceIndex
        .map((s) => {
          const href = safeUrl(s.url);
          const title = esc(s.title || s.source);
          return `<tr><td style="padding:8px 8px 8px 0;border-top:1px solid ${LINE};font-family:${SANS_MAIL};font-size:13px;line-height:1.5;color:${INK};">${href ? `<a href="${esc(href)}" style="color:${INK};">${title}</a>` : title}<br><span style="font-size:12px;color:${SOFT};">${esc(s.source)}${s.originalDate ? `. ${esc(dateLong(s.originalDate, lang))}` : ""}</span></td></tr>`;
        })
        .join("")}</table>`
    : "";

  const joinHtml = `<div style="margin-top:38px;padding-top:18px;border-top:2px solid ${INK};"><h2 style="margin:0 0 10px;font-family:${SERIF_MAIL};font-size:28px;line-height:1.15;color:${INK};">${esc(t.joinTitle)}</h2><p style="margin:0 0 16px;font-family:${SERIF_MAIL};font-size:16px;line-height:1.55;color:${SOFT};">${esc(t.joinCopy)}</p><a href="${SITE}/flow/join" style="display:inline-block;background:${INK};color:${PAPER};padding:13px 26px;border-radius:999px;font-family:${SERIF_MAIL};font-size:16px;font-style:italic;text-decoration:none;">${esc(t.joinCta)} ↗</a></div>`;

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(`${num}. ${period}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER};"><tr><td align="center" style="padding:0 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td style="padding:22px 18px 36px;">
<p style="margin:0 0 8px;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(period)}. ${esc(num)}</p>
<div style="border-top:1px solid ${INK};border-bottom:1px solid ${INK};padding:14px 0 10px;text-align:center;"><span style="font-family:${SERIF_MAIL};font-size:56px;font-weight:normal;letter-spacing:-1px;line-height:1;color:${INK};">${esc(t.brand)}</span></div>
<p style="margin:20px 0 8px;font-family:${MONO_MAIL};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${SOFT};">${esc(t.main)}</p>
${numsHtml}
${leadHtml}${latestHtml}${readHtml}${watchHtml}${frameHtml}${stats}${srcHtml}${joinHtml}
<p style="margin:30px 0 0;padding-top:14px;border-top:1px solid ${LINE};font-family:${SANS_MAIL};font-size:12px;color:${SOFT};"><a href="${esc(o.canonical)}" style="color:${SOFT};">${esc(t.openWeb)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
}

/* ---------- TEXT ---------- */

function renderText(payload: IssuePayload, ext: Stats, o: Opts): string {
  const lang = payload.lang;
  const t = L[lang];
  const { period, num } = issueTitle(payload, o.number);
  const out: string[] = [`${t.brand}. ${num}`, period, ""];
  const nums = [`${t.published}: ${ext.published}`];
  if (ext.drafts != null) nums.push(`${t.drafts}: ${ext.drafts}`);
  if (ext.medianDelaySeconds != null) nums.push(`${t.median}: ${duration(ext.medianDelaySeconds, lang)}`);
  out.push(t.main, ...nums, "");
  if (payload.lead) out.push(t.lead, payload.lead.title, "", String(payload.lead.body || ""), "");
  if (payload.latest.length) out.push(t.latest, ...payload.latest.slice(0, 6).map((e) => `${dayShort(e.publishedAt, lang)} ${hhmm(e.publishedAt, lang)}  ${entryTitle(e)}`), "");
  if (payload.links.length) out.push(t.read, ...payload.links.map((e) => [entryTitle(e), entryHref(e), e.description].filter(Boolean).join("\n")), "");
  if (payload.videos.length) out.push(t.watch, ...payload.videos.map((e) => `${entryTitle(e)}\n${entryHref(e)}`), "");
  if (payload.photos.length) out.push(t.frame, ...payload.photos.map((e) => [e.caption, e.image].filter(Boolean).join("\n")), "");
  if (payload.sourceIndex.length) out.push(t.sources, ...payload.sourceIndex.map((s) => [s.title || s.source, s.url].filter(Boolean).join("\n")), "");
  out.push(t.joinTitle, t.joinCopy, `${t.joinCta}: ${SITE}/flow/join`, "", o.canonical);
  return out.join("\n");
}

/* ---------- API ---------- */

export function renderIssue(
  payload: IssuePayload,
  options: { title: string; slug: string; siteUrl?: string; number?: number | null },
) {
  const ext = payload.stats;
  const canonical = `${options.siteUrl || SITE}/letters/${options.slug}`;
  const o: Opts = { title: options.title, canonical, number: options.number };
  return {
    htmlWeb: renderWeb(payload, ext, o),
    htmlEmail: renderEmail(payload, ext, o),
    textEmail: renderText(payload, ext, o),
  };
}
