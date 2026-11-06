import { DEFAULT_ISSUE_TEMPLATE } from './template';
import { issueEntries } from './title';
import type { IssueEntry, IssuePayload, IssueLang } from './types';

/**
 * Рендер выпуска Flow. Сигнатура прежняя:
 *   renderIssue(payload, { title, slug, siteUrl? }) -> { htmlWeb, htmlEmail, textEmail }
 *
 * Заголовок выпуска собирается из главного материала и даты (см. title.ts),
 * шапка показывает три метрики: items.length, flowActiveDays и короткий
 * summary. Перед полной лентой items выводится авторская колонка Пьеро.
 */

type Stats = IssuePayload['stats'];
type LinkItem = IssuePayload['links'][number];
type PhotoItem = IssuePayload['photos'][number];
/** stats.delays: {seconds, count}. Если сборщик добавит label/external, строки подписываются по записям. */
type DelayRow = Stats['delays'][number] & { label?: string; external?: boolean };
type Opts = { title: string; canonical: string; number?: number | null };

const SITE = 'https://www.merkurov.love';
// Оформление как на главной merkurov.love: бумага #FAF8F5, чернила #111111, серый zinc.
// Акцент один; по умолчанию совпадает с чернилами. Поменяй ACCENT, если нужен цветной.
const ACCENT = '#111111';
const PAPER = '#FAF8F5';
const INK = '#111111';
const SOFT = '#52525B'; // zinc-600
const LINE = '#D4D4D8'; // zinc-300
const CLARET = ACCENT;
const TINT = '#F0EDE6';
const BAR2 = '#D4D4D8';
// Шрифты сайта: если страница открывается внутри приложения, подхватятся его переменные
// (--font-serif, --font-sans, --font-mono), иначе работают запасные.
const SERIF_WEB = "var(--font-serif,'Source Serif 4',Georgia,'Times New Roman',serif)";
const SANS_WEB = "var(--font-sans,'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif)";
const MONO_WEB = "var(--font-mono,ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace)";
const SERIF_MAIL = "Georgia,'Times New Roman',serif";
const SANS_MAIL = 'Arial,Helvetica,sans-serif';
const MONO_MAIL = "'Courier New',Courier,monospace";

const L = {
  ru: {
    brand: 'Поток',
    issue: 'Выпуск',
    utc: 'Время указано по UTC',
    nav: {
      feed: 'Материалы',
      read: 'Читать',
      watch: 'Смотреть',
      frame: 'Кадр',
      stats: 'Цифры',
      src: 'Источники',
      join: 'Подписка',
    },
    main: 'Главные цифры',
    published: 'опубликовано',
    publishedItems: 'Опубликовано',
    drafts: 'черновиков',
    total: 'записей в таблице',
    days: 'дней работы потока',
    flowActiveDays: 'Дней работы потока',
    summary: 'О чем выпуск',
    median: 'медиана от создания до публикации',
    authorColumn: 'Колонка Пьеро',
    issueFeed: 'Материалы выпуска',
    readMore: 'Открыть материал',
    lead: 'Главное. Заметка автора',
    leadPub: 'Опубликовано в',
    latest: 'Последнее в потоке',
    read: 'Читать',
    watch: 'Смотреть',
    frame: 'Кадр',
    stats: 'Цифры подробнее',
    perDay: 'Записей по дням',
    byType: 'Что опубликовано',
    ownExt: 'Своё и чужое',
    own: 'своих',
    ext: 'чужих',
    kinds: 'О чём записи',
    kindNames: ['о самом потоке', 'из внешнего мира', 'прочее'],
    hours: 'Когда создаются записи, часы UTC',
    quality: 'Язык и качество записей',
    delays: 'Время от создания до публикации',
    delaysNote: 'Шкала логарифмическая, светлые полосы — чужие материалы.',
    delaysNote2:
      'Шкала логарифмическая: каждая строка показывает, сколько записей ушло за указанное время.',
    sources: 'Указатель источников',
    colSource: 'Источник',
    colItem: 'Материал',
    colOrig: 'Дата оригинала',
    colAdded: 'В потоке',
    unknown: 'не указана',
    age: 'давность',
    ageDays: 'дн.',
    inStream: 'в потоке',
    join: 'Подписка',
    joinTitle: 'Я ничего не пишу, я только отбираю.',
    joinCopy:
      'Раз в неделю из этого собирается выпуск без редакции, только вкус одного человека, умноженный на код.',
    joinCta: 'Получать выпуск',
    openWeb: 'Открыть выпуск в браузере',
    openPage: 'Постоянная страница выпуска',
    types: { note: 'Заметка', link: 'Ссылка', video: 'Видео', photo: 'Фото' } as Record<
      string,
      string
    >,
    typePlural: { note: 'Заметки', link: 'Ссылки', video: 'Видео', photo: 'Фото' } as Record<
      string,
      string
    >,
    qLang: 'Язык записи не совпадает с языком текста',
    qAlt: 'Подпись фото равна имени файла',
    qEmpty: 'Пустые или тестовые черновики',
    of: 'из',
    watchCta: 'Смотреть',
  },
  en: {
    brand: 'Flow',
    issue: 'Issue',
    utc: 'Times are shown in UTC',
    nav: {
      feed: 'Materials',
      read: 'Read',
      watch: 'Watch',
      frame: 'Frame',
      stats: 'Numbers',
      src: 'Sources',
      join: 'Subscribe',
    },
    main: 'Key numbers',
    published: 'published',
    publishedItems: 'Published',
    drafts: 'drafts',
    total: 'records in the table',
    days: 'days of the stream',
    flowActiveDays: 'Flow active days',
    summary: 'Summary',
    median: 'median time from creation to publication',
    authorColumn: "Pierrot's column",
    issueFeed: 'Issue materials',
    readMore: 'Open item',
    lead: 'Lead. A note by the author',
    leadPub: 'Published at',
    latest: 'Latest in the stream',
    read: 'Read',
    watch: 'Watch',
    frame: 'Frame',
    stats: 'More numbers',
    perDay: 'Entries per day',
    byType: 'What was published',
    ownExt: 'Own and external',
    own: 'own',
    ext: 'external',
    kinds: 'What the entries are about',
    kindNames: ['the stream itself', 'the outside world', 'other'],
    hours: 'When entries are created, UTC hours',
    quality: 'Language and data quality',
    delays: 'Time from creation to publication',
    delaysNote: 'Logarithmic scale, light bars are external materials.',
    delaysNote2: 'Logarithmic scale: each row shows how many entries took that long.',
    sources: 'Source index',
    colSource: 'Source',
    colItem: 'Item',
    colOrig: 'Original date',
    colAdded: 'In the stream',
    unknown: 'not stated',
    age: 'age',
    ageDays: 'days',
    inStream: 'in the stream since',
    join: 'Subscribe',
    joinTitle: 'I don’t write. I select.',
    joinCopy:
      'Once a week it becomes an issue with no newsroom: one person’s taste multiplied by code.',
    joinCta: 'Get the issue',
    openWeb: 'Read this issue online',
    openPage: 'Permanent issue page',
    types: { note: 'Note', link: 'Link', video: 'Video', photo: 'Photo' } as Record<string, string>,
    typePlural: { note: 'Notes', link: 'Links', video: 'Videos', photo: 'Photos' } as Record<
      string,
      string
    >,
    qLang: 'Language field differs from the text language',
    qAlt: 'Photo alt equals the file name',
    qEmpty: 'Empty or test drafts',
    of: 'of',
    watchCta: 'Watch',
  },
} as const;

/* ---------- helpers ---------- */

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value, SITE);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const loc = (lang: IssueLang) => (lang === 'ru' ? 'ru-RU' : 'en-GB');

function fmt(
  value: string | undefined | null,
  lang: IssueLang,
  opts: Intl.DateTimeFormatOptions
): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(loc(lang), { timeZone: 'UTC', ...opts }).format(d);
}

const dateLong = (v: string | undefined | null, lang: IssueLang) =>
  fmt(v, lang, { day: 'numeric', month: 'long', year: 'numeric' });
const dayShort = (v: string | undefined | null, lang: IssueLang) =>
  fmt(v, lang, { day: 'numeric', month: 'short' }).replace(/\./g, '');
const hhmm = (v: string | undefined | null, lang: IssueLang) =>
  fmt(v, lang, { hour: '2-digit', minute: '2-digit', hour12: false });

function duration(seconds: number, lang: IssueLang): string {
  const n = Math.max(0, Math.round(seconds));
  const ru = lang === 'ru';
  if (n < 60) return ru ? `${n} с` : `${n}s`;
  if (n < 3600) return ru ? `${Math.round(n / 60)} мин` : `${Math.round(n / 60)} min`;
  let h = Math.floor(n / 3600);
  let m = Math.round((n % 3600) / 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  const mm = String(m).padStart(2, '0');
  return ru ? `${h} ч ${mm}` : `${h}h ${mm}`;
}

function paragraphs(value: string | undefined | null, font: string, size: number): string {
  return String(value ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${font};font-size:${size}px;line-height:1.65;color:${INK};overflow-wrap:anywhere;">${esc(p).replace(/\n/g, '<br>')}</p>`
    )
    .join('');
}

const looksLikeFile = (s: unknown) =>
  typeof s === 'string' && /\.(jpe?g|png|gif|webp|heic)$/i.test(s.trim());
const photoAlt = (p: PhotoItem) =>
  looksLikeFile(p.alt) ? p.caption || '' : p.alt || p.caption || '';
const entryHref = (e: IssueEntry) => safeUrl(e.url) || `${SITE}/flow/${e.id}`;
const entryTitle = (e: IssueEntry) => e.title || String(e.body || '').slice(0, 70) || entryHref(e);
const logWidth = (s: number, max: number) =>
  max <= 1 ? 100 : Math.max(8, Math.round((Math.log10(Math.max(s, 1)) / Math.log10(max)) * 100));

const videoChannel = (v: IssueEntry) =>
  String(v.metadata?.youtube?.author_name ?? v.metadata?.site_name ?? '');
function entriesWord(n: number, lang: IssueLang): string {
  if (lang === 'en') return n === 1 ? 'entry' : 'entries';
  const a = n % 10,
    b = n % 100;
  if (a === 1 && b !== 11) return 'запись';
  if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return 'записи';
  return 'записей';
}
const sortedDelays = (st: Stats): DelayRow[] =>
  [...(st.delays as DelayRow[])].sort((x, y) => x.seconds - y.seconds);
const delayLabel = (d: DelayRow, lang: IssueLang) =>
  d.label ?? `${d.count} ${entriesWord(d.count, lang)}`;

function linkMeta(item: LinkItem, lang: IssueLang): string {
  const t = L[lang];
  const parts = [
    item.siteName,
    item.author,
    item.originalDate ? dateLong(item.originalDate, lang) : '',
  ].filter(Boolean);
  const age = item.ageDays;
  if (age !== null && age >= 2) parts.push(`${t.age} ${age} ${t.ageDays}`);
  return parts.join('. ');
}

function issueTitle(payload: IssuePayload, number?: number | null) {
  const lang = payload.lang;
  const t = L[lang];
  const period = `${dateLong(payload.period.start, lang)} — ${dateLong(payload.period.end, lang)}`;
  const num = number ? `${t.issue} №${number}` : t.issue;
  return { period, num };
}

function issueSummary(payload: IssuePayload, items: IssueEntry[], lang: IssueLang): string {
  const explicit = typeof payload.summary === 'string' ? payload.summary.trim() : '';

  if (explicit) return explicit;

  const lead = payload.lead || items[0];
  const title = String(lead?.title || '').trim();

  if (!title) return lang === 'ru' ? 'Смыслы потока' : 'Signals of Flow';

  return title.split(/\s+/).slice(0, 6).join(' ');
}

function pierrotIntro(payload: IssuePayload, items: IssueEntry[], lang: IssueLang): string[] {
  if (Array.isArray(payload.pierrotIntro) && payload.pierrotIntro.length) {
    return payload.pierrotIntro
      .map((paragraph) => String(paragraph || '').trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  const lead = payload.lead || items[0];
  const title = String(lead?.title || '').trim();
  const count = items.length;

  if (lang === 'ru') {
    return [
      `В этом выпуске — ${count} ${entriesWord(count, lang)}. Пьеро читает их как один след внимания, а не как набор новостей.`,
      title
        ? `Точка сборки — «${title}». Важнее не событие, а то, что в нём задержало взгляд.`
        : 'Точка сборки — сам жест отбора: поток не объясняет мир, он его сортирует.',
      'Остальное — работа читателя.',
    ];
  }

  return [
    `This issue holds ${count} ${entriesWord(count, lang)}. Pierrot reads them as a single trace of attention, not as a news digest.`,
    title
      ? `The point of assembly is “${title}”. What matters is not the event, but what held the gaze within it.`
      : 'The point of assembly is the act of selection itself: Flow does not explain the world, it sorts it.',
    "The rest is the reader's work.",
  ];
}

/* ---------- WEB ---------- */

function issueTheme(payload: IssuePayload) {
  const theme = payload.template?.theme;

  return {
    paper: theme?.paper || PAPER,
    ink: theme?.ink || INK,
    soft: theme?.muted || SOFT,
    line: theme?.rule || LINE,
    accent: theme?.accent || ACCENT,
    maxWidth: theme?.maxWidth || 1120,
    // Keep the site typography when the template still uses its default
    // Georgia/Inter fallbacks. Custom template fonts still win.
    serif:
      theme?.serifFont && theme.serifFont !== DEFAULT_ISSUE_TEMPLATE.theme.serifFont
        ? theme.serifFont
        : SERIF_WEB,
    sans:
      theme?.sansFont && theme.sansFont !== DEFAULT_ISSUE_TEMPLATE.theme.sansFont
        ? theme.sansFont
        : SANS_WEB,
  };
}

function webCss(payload: IssuePayload): string {
  const theme = issueTheme(payload);

  return `
.flow-issue-root{--bg:${theme.paper};--ink:${theme.ink};--soft:${theme.soft};--line:${theme.line};--claret:${theme.accent};--tint:${TINT};--bar:${theme.ink};--bar2:${theme.line};
--serif:${theme.serif};--sans:${theme.sans};--mono:${MONO_WEB};position:relative;background:var(--bg);color:var(--ink);font:17px/1.65 var(--serif);scroll-padding-top:12px;color-scheme:light;padding-top:env(safe-area-inset-top,0);padding-bottom:env(safe-area-inset-bottom,0);-webkit-font-smoothing:antialiased}
.flow-issue-root,.flow-issue-root *{box-sizing:border-box}
.flow-issue-root:before{content:'';position:fixed;inset:0;pointer-events:none;opacity:.025;mix-blend-mode:overlay;z-index:5;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.flow-issue-root ::selection{background:var(--ink);color:var(--bg)}
.flow-issue-root a{color:inherit}.page{max-width:${theme.maxWidth}px;margin:0 auto;padding:22px 20px 64px;position:relative;z-index:10}
.top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font:12px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--soft);padding-bottom:12px}
.mast{border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);padding:24px 0 20px;text-align:center}
.mast .brand{margin:0 0 10px;font:500 12px var(--mono);letter-spacing:.28em;text-transform:uppercase;color:var(--soft)}
.mast h1{margin:0 auto;max-width:920px;font:400 clamp(28px,4.6vw,54px)/1.12 var(--serif);letter-spacing:-.02em;text-wrap:balance;overflow-wrap:anywhere}
.mast .mast-period{margin:14px 0 0;font:12px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--soft)}
.nav{display:flex;gap:10px 30px;justify-content:center;flex-wrap:wrap;font:500 12px var(--mono);letter-spacing:.2em;text-transform:uppercase;padding:14px 0;border-bottom:1px solid var(--line)}
.nav a{text-decoration:underline;text-underline-offset:8px;text-decoration-color:#D4D4D8;padding:6px 0}.nav a:hover{text-decoration-color:var(--ink)}
.g{display:grid;grid-template-columns:1fr;gap:0 40px;margin-top:40px}
@media(min-width:900px){.g{grid-template-columns:repeat(12,1fr)}.c8{grid-column:span 8}.c4{grid-column:span 4}.c6{grid-column:span 6}.c12{grid-column:span 12}}
.flow-issue-root section,.flow-issue-root aside{margin-bottom:48px;min-width:0}
.k{font:500 12px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--soft);margin:0 0 12px}
.flow-issue-root h2{font:400 clamp(32px,5vw,52px)/1.1 var(--serif);margin:0 0 14px;letter-spacing:-.015em;overflow-wrap:anywhere}
.flow-issue-root h3{font:400 21px/1.28 var(--serif);margin:0 0 6px;overflow-wrap:anywhere}
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
.metrics{display:grid;grid-template-columns:1fr;border-top:1px solid var(--ink);border-bottom:1px solid var(--line)}
@media(min-width:700px){.metrics{grid-template-columns:repeat(3,1fr)}}
.metrics div{padding:18px 0 16px;border-top:1px solid var(--line)}
@media(min-width:700px){.metrics div{padding:18px 18px 16px;border-top:0;border-left:1px solid var(--line)}.metrics div:first-child{padding-left:0;border-left:0}}
.metrics b{display:block;font:400 46px/1 var(--serif);overflow-wrap:anywhere}
.metrics span{display:block;margin-top:6px;font:13px/1.35 var(--sans);color:var(--soft)}
.metrics .metric-summary b{font:400 clamp(19px,2.4vw,28px)/1.2 var(--serif);letter-spacing:-.01em}
.intro{border-top:1px solid var(--ink);padding-top:20px}
.intro p{font:400 18px/1.65 var(--serif);margin:0 0 14px;max-width:76ch;color:var(--ink)}
.intro p:last-child{margin-bottom:0}
.issue-feed{display:flex;flex-direction:column}
.item{padding:26px 0;border-top:1px solid var(--line);min-width:0}
.item:first-child{border-top:1px solid var(--ink)}
.item-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font:11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--soft);margin-bottom:10px}
.item h3{font:400 clamp(23px,3vw,32px)/1.2 var(--serif);margin:0 0 12px;overflow-wrap:anywhere}
.item h3 a{text-decoration:none}.item h3 a:hover{text-decoration:underline;text-underline-offset:5px;text-decoration-color:#A1A1AA}
.item p{font:400 17px/1.7 var(--serif);margin:0 0 12px;color:var(--ink);overflow-wrap:anywhere}
.item .item-dek{font:italic 18px/1.55 var(--serif);color:var(--soft);max-width:76ch}
.item-image{display:block;margin:14px 0 12px;max-width:760px}
.item-image img{display:block;width:100%;height:auto;background:var(--tint)}
.item-open{display:inline-block;font:11px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--soft);text-decoration:none;border-bottom:1px solid transparent;padding-bottom:2px}
.item-open:hover{color:var(--ink);border-bottom-color:var(--ink)}
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
.flow-issue-root table{width:100%;border-collapse:collapse;font:14px var(--sans)}
.flow-issue-root th{font:500 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;text-align:left;color:var(--soft);border-bottom:1px solid var(--ink);padding:6px 8px 8px 0}
.flow-issue-root td{padding:10px 8px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}.scroll{overflow-x:auto}
.data{background:var(--tint);padding:16px 18px;font:14px/1.55 var(--sans)}.data p{margin:0 0 6px}
.statsHead{border-top:1px solid var(--ink);padding-top:16px;margin-bottom:16px}.statsHead .k{margin:0}
.sub{border-top:1px solid var(--ink);padding-top:22px;text-align:center}.sub h2{font-size:clamp(28px,4vw,42px)}
.dek{font:italic 20px/1.5 var(--serif);color:var(--soft);margin:0 auto 22px;max-width:640px}
.mail{display:inline-flex;align-items:center;gap:10px;border:1px solid rgba(17,17,17,.2);background:rgba(255,255,255,.8);color:var(--ink);padding:14px 30px;border-radius:999px;font:italic 18px var(--serif);text-decoration:none;transition:all .3s}
.mail:hover{background:var(--ink);color:var(--bg)}
.flow-issue-root footer{border-top:1px solid var(--ink);padding-top:14px;font:12px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--soft)}
`;
}

function webStack(
  parts: { value: number; label?: string; color: string; dark?: boolean }[]
): string {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return '';
  return `<div class="stack">${parts
    .filter((p) => p.value > 0)
    .map(
      (p) =>
        `<div style="width:${((p.value / total) * 100).toFixed(1)}%;background:${p.color};${p.dark ? 'color:#1C1A1B;' : ''}">${esc(p.label ?? p.value)}</div>`
    )
    .join('')}</div>`;
}

function publishedCount(payload: IssuePayload, ext: Stats): number {
  if (Array.isArray(payload.items) && payload.items.length > 0) {
    return payload.items.length;
  }

  return typeof ext.published === 'number' ? ext.published : issueEntries(payload).length;
}

function issueSections(payload: IssuePayload) {
  const used = new Set<string>();
  const take = <T extends IssueEntry>(entry: T | null | undefined): T | null => {
    if (!entry || used.has(entry.id)) return null;
    used.add(entry.id);
    return entry;
  };

  const takeList = <T extends IssueEntry>(entries: T[]): T[] => {
    const result: T[] = [];
    for (const entry of entries || []) {
      const next = take(entry);
      if (next) result.push(next);
    }
    return result;
  };

  return {
    lead: take(payload.lead),
    latest: takeList(payload.latest || []),
    links: takeList(payload.links || []),
    videos: takeList(payload.videos || []),
    photos: takeList(payload.photos || []),
  };
}

function issueLabels(payload: IssuePayload) {
  const lang = payload.lang;
  const fallback = L[lang];
  const labels = payload.template?.labels?.[lang];

  return {
    lead: labels?.lead || fallback.lead,
    latest: labels?.latest || fallback.latest,
    links: labels?.links || fallback.read,
    videos: labels?.videos || fallback.watch,
    photos: labels?.photos || fallback.frame,
    metrics: labels?.metrics || fallback.main,
    sources: labels?.sources || fallback.sources,
    subscribe: labels?.subscribe || fallback.join,
    subscribeCopy: labels?.subscribeCopy || fallback.joinCopy,
  };
}

type MaterialKey = 'lead' | 'latest' | 'links' | 'videos' | 'photos';

const MATERIAL_KEYS: MaterialKey[] = ['lead', 'latest', 'links', 'videos', 'photos'];

function materialOrder(payload: IssuePayload): MaterialKey[] {
  const order = payload.template?.sections?.order || [];
  const enabled = payload.template?.sections?.enabled || {};
  const requested = order.filter((key): key is MaterialKey =>
    MATERIAL_KEYS.includes(key as MaterialKey)
  );
  const active = requested.filter((key) => enabled[key] !== false);
  const remainder = MATERIAL_KEYS.filter((key) => !active.includes(key) && enabled[key] !== false);

  return [...new Set([...active, ...remainder])];
}

function renderWeb(payload: IssuePayload, ext: Stats, o: Opts): string {
  const lang = payload.lang;
  const t = L[lang];
  const labels = issueLabels(payload);
  const sections = issueSections(payload);
  const { period, num } = issueTitle(payload, o.number);
  const summary = issueSummary(payload, issueEntries(payload), lang);
  const intro = pierrotIntro(payload, issueEntries(payload), lang);
  const flowDays = ext.flowActiveDays ?? ext.days ?? 1;
  const published = publishedCount(payload, ext);
  const order = materialOrder(payload);
  const enabled = payload.template?.sections?.enabled || {};

  const leadHtml = sections.lead
    ? `<section id="lead" class="c8">
        <p class="k">${esc(labels.lead)}</p>
        <h2>${esc(sections.lead.title || labels.lead)}</h2>
        <p class="by">${esc(dateLong(sections.lead.publishedAt, lang))}, ${esc(hhmm(sections.lead.publishedAt, lang))} UTC</p>
        ${paragraphs(sections.lead.body, 'var(--serif)', 18)}
        ${safeUrl(sections.lead.url) ? `<p class="meta"><a href="${esc(safeUrl(sections.lead.url))}" style="color:var(--claret)">${esc(sections.lead.url)}</a></p>` : ''}
      </section>`
    : '';

  const latestHtml = sections.latest.length
    ? `<aside id="latest" class="${sections.lead ? 'c4' : 'c12'}">
        <p class="k">${esc(labels.latest)}</p>
        <ul class="feed">${sections.latest
          .map(
            (entry) =>
              `<li><time>${esc(dayShort(entry.publishedAt, lang))}<br>${esc(hhmm(entry.publishedAt, lang))}</time><div><b>${esc(t.types[entry.type] || entry.type)}</b><a href="${esc(entryHref(entry))}" style="text-decoration:none">${esc(entryTitle(entry))}</a>${entry.body ? `<p class="meta">${esc(String(entry.body).replace(/\s+/g, ' ').slice(0, 220))}</p>` : ''}</div></li>`
          )
          .join('')}</ul>
      </aside>`
    : '';

  const readHtml = sections.links.length
    ? `<section id="links" class="c12"><p class="k">${esc(labels.links)}</p><div class="cards">${sections.links
        .map((entry) => {
          const img = safeUrl(entry.image);
          return `<a class="card" href="${esc(entryHref(entry))}">${img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">` : ''}<h3>${esc(entryTitle(entry))}</h3>${entry.body ? `<p>${esc(String(entry.body).replace(/\s+/g, ' ').slice(0, 280))}</p>` : ''}${entry.description ? `<p>${esc(entry.description)}</p>` : ''}<p class="meta">${esc(linkMeta(entry, lang))}</p></a>`;
        })
        .join('')}</div></section>`
    : '';

  const watchHtml = sections.videos.length
    ? `<section id="videos" class="c12"><p class="k">${esc(labels.videos)}</p><div class="v4">${sections.videos
        .map((entry) => {
          const img = safeUrl(entry.image);
          const meta = [videoChannel(entry), `${t.inStream} ${dayShort(entry.publishedAt, lang)}`]
            .filter(Boolean)
            .join('. ');
          return `<a class="card" href="${esc(entryHref(entry))}"><div class="plate">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}</div><h3>${esc(entryTitle(entry))}</h3><p class="meta">${esc(meta)}</p></a>`;
        })
        .join('')}</div></section>`
    : '';

  const frameHtml = sections.photos.length
    ? `<section id="photos" class="c12"><p class="k">${esc(labels.photos)}</p><div class="v4">${sections.photos
        .map((entry) => {
          const img = safeUrl(entry.image);
          return `<div>${img ? `<img class="frame" src="${esc(img)}" alt="${esc(photoAlt(entry))}" loading="lazy">` : `<div class="frame"></div>`}<p class="meta">${esc(dayShort(entry.publishedAt, lang))}${entry.caption ? `. ${esc(entry.caption)}` : ''}</p></div>`;
        })
        .join('')}</div></section>`
    : '';

  const blocks: Record<MaterialKey, string> = {
    lead: leadHtml,
    latest: latestHtml,
    links: readHtml,
    videos: watchHtml,
    photos: frameHtml,
  };

  const materialsHtml = order.map((key) => blocks[key]).join('');

  const metricsHtml =
    enabled.metrics !== false
      ? `<section class="c12"><p class="k">${esc(labels.metrics)}</p><div class="metrics">
        <div><b>${esc(published)}</b><span>${esc(t.publishedItems)}</span></div>
        <div><b>${esc(flowDays)}</b><span>${esc(t.flowActiveDays)}</span></div>
        <div class="metric-summary"><b>${esc(summary)}</b><span>${esc(t.summary)}</span></div>
      </div></section>`
      : '';

  const introHtml = intro.length
    ? `<section class="c12 intro"><p class="k">${esc(t.authorColumn)}</p>${paragraphs(intro.join('\n\n'), 'var(--serif)', 18)}</section>`
    : '';

  const srcHtml =
    enabled.sources !== false && payload.sourceIndex.length
      ? `<section id="sources" class="c12"><p class="k">${esc(labels.sources)}</p><div class="scroll"><table>
        <tr><th>${esc(t.colSource)}</th><th>${esc(t.colItem)}</th><th>${esc(t.colOrig)}</th><th>${esc(t.colAdded)}</th></tr>
        ${payload.sourceIndex
          .map((source) => {
            const href = safeUrl(source.url);
            const title = esc(source.title || source.source);
            return `<tr><td>${esc(source.source)}</td><td>${href ? `<a href="${esc(href)}">${title}</a>` : title}</td><td>${esc(source.originalDate ? dateLong(source.originalDate, lang) : t.unknown)}</td><td>${esc(source.addedAt ? dayShort(source.addedAt, lang) : '')}</td></tr>`;
          })
          .join('')}</table></div></section>`
      : '';

  const joinHtml =
    enabled.subscribe !== false
      ? `<section id="join" class="c12 sub"><p class="k">${esc(labels.subscribe)}</p><h2>${esc(t.joinTitle)}</h2><p class="dek">${esc(labels.subscribeCopy)}</p><a class="mail" href="${SITE}/flow/join">${esc(t.joinCta)} <span aria-hidden="true">↗</span></a></section>`
      : '';

  const nav = [
    ...order.map((key) => ({ href: key, label: labels[key] })),
    ...(enabled.sources !== false && payload.sourceIndex.length
      ? [{ href: 'sources', label: labels.sources }]
      : []),
    ...(enabled.subscribe !== false ? [{ href: 'join', label: labels.subscribe }] : []),
  ];

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(`${t.brand}. ${num}. ${period}. ${summary}`)}">
<link rel="canonical" href="${esc(o.canonical)}">
<style>${webCss(payload)}</style>
</head>
<body>
<div class="flow-issue-root">
<div class="page">
<div class="top"><span>${esc(period)}</span><span>${esc(num)}. ${esc(t.utc)}</span><span>merkurov.love/flow</span></div>
<header class="mast">
  <p class="brand">${esc(t.brand)}</p>
  <h1>${esc(o.title)}</h1>
  <p class="mast-period">${esc(period)} · ${esc(num)}</p>
</header>
<nav class="nav">${nav.map((item) => `<a href="#${item.href}">${esc(item.label)}</a>`).join('')}</nav>
<div class="g">
${metricsHtml}
${introHtml}
${materialsHtml}
${srcHtml}${joinHtml}
</div>
<footer><a href="${esc(o.canonical)}">${esc(t.openPage)}</a></footer>
</div>
</div>
</body>
</html>`;
}

function mailH(label: string): string {
  return `<p style="margin:34px 0 12px;padding-top:14px;border-top:1px solid ${INK};font-family:${MONO_MAIL};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${SOFT};">${esc(label)}</p>`;
}

function mailBars(
  rows: { label: string; value: number; text: string; light?: boolean }[],
  max: number,
  log = false
): string {
  if (!rows.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows
    .map((r) => {
      const w = log
        ? logWidth(r.value, max)
        : Math.max(3, Math.round((r.value / Math.max(1, max)) * 100));
      const c = r.light ? BAR2 : CLARET;
      return `<tr>
<td width="120" style="padding:5px 8px 5px 0;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(r.label)}</td>
<td style="padding:5px 0;"><table role="presentation" width="${w}%" cellpadding="0" cellspacing="0" border="0"><tr><td height="9" bgcolor="${c}" style="height:9px;background:${c};font-size:0;line-height:0;">&nbsp;</td></tr></table></td>
<td width="56" align="right" style="padding:5px 0 5px 8px;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(r.text)}</td></tr>`;
    })
    .join('')}</table>`;
}

function renderEmail(payload: IssuePayload, ext: Stats, o: Opts): string {
  const theme = issueTheme(payload);
  const PAPER = theme.paper;
  const INK = theme.ink;
  const SOFT = theme.soft;
  const LINE = theme.line;
  const SERIF_MAIL = theme.serif.includes('var(') ? "Georgia,'Times New Roman',serif" : theme.serif;
  const SANS_MAIL = theme.sans.includes('var(') ? 'Arial,Helvetica,sans-serif' : theme.sans;
  const lang = payload.lang;
  const t = L[lang];
  const labels = issueLabels(payload);
  const sections = issueSections(payload);
  const { period, num } = issueTitle(payload, o.number);
  const summary = issueSummary(payload, issueEntries(payload), lang);
  const intro = pierrotIntro(payload, issueEntries(payload), lang);
  const flowDays = ext.flowActiveDays ?? ext.days ?? 1;
  const published = publishedCount(payload, ext);
  const order = materialOrder(payload);
  const enabled = payload.template?.sections?.enabled || {};

  const metricsHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${INK};border-bottom:1px solid ${LINE};"><tr>${[
    [published, t.publishedItems],
    [flowDays, t.flowActiveDays],
    [summary, t.summary],
  ]
    .map(
      ([value, label], index) =>
        `<td valign="top" width="${index === 2 ? '46%' : '27%'}" style="padding:14px 6px 12px ${index ? 12 : 0}px;${index ? `border-left:1px solid ${LINE};` : ''}"><div style="font-family:${SERIF_MAIL};font-size:${index === 2 ? 18 : 30}px;line-height:1.2;color:${INK};">${esc(value)}</div><div style="margin-top:4px;font-family:${SANS_MAIL};font-size:11px;line-height:1.35;color:${SOFT};">${esc(label)}</div></td>`
    )
    .join('')}</tr></table>`;

  const introHtml = intro.length
    ? `${mailH(t.authorColumn)}${paragraphs(intro.join('\n\n'), SERIF_MAIL, 16)}`
    : '';

  const img = (url: unknown, alt: string, href: string) => {
    const u = safeUrl(url);
    return u
      ? `<a href="${esc(href)}"><img src="${esc(u)}" alt="${esc(alt)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;margin:0 0 10px;"></a>`
      : '';
  };

  const leadHtml = sections.lead
    ? `${mailH(labels.lead)}<h2 style="margin:0 0 8px;font-family:${SERIF_MAIL};font-size:30px;line-height:1.12;font-weight:normal;color:${INK};">${esc(sections.lead.title || labels.lead)}</h2>
<p style="margin:0 0 16px;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(dateLong(sections.lead.publishedAt, lang))}, ${esc(hhmm(sections.lead.publishedAt, lang))} UTC</p>${paragraphs(sections.lead.body, SERIF_MAIL, 16)}`
    : '';

  const latestHtml = sections.latest.length
    ? `${mailH(labels.latest)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${sections.latest
        .map(
          (entry) =>
            `<tr><td width="74" valign="top" style="padding:8px 8px 8px 0;border-top:1px solid ${LINE};font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(dayShort(entry.publishedAt, lang))}<br>${esc(hhmm(entry.publishedAt, lang))}</td><td style="padding:8px 0;border-top:1px solid ${LINE};font-family:${SERIF_MAIL};font-size:15px;line-height:1.35;color:${INK};"><span style="font-family:${MONO_MAIL};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${SOFT};">${esc(t.types[entry.type] || entry.type)}</span><br><a href="${esc(entryHref(entry))}" style="color:${INK};text-decoration:none;">${esc(entryTitle(entry))}</a>${entry.body ? `<br><span style="font-family:${SANS_MAIL};font-size:12px;line-height:1.5;color:${SOFT};">${esc(String(entry.body).replace(/\s+/g, ' ').slice(0, 240))}</span>` : ''}</td></tr>`
        )
        .join('')}</table>`
    : '';

  const readHtml = sections.links.length
    ? mailH(labels.links) +
      sections.links
        .map(
          (entry) =>
            `<div style="margin:0 0 26px;">${img(entry.image, '', entryHref(entry))}<h3 style="margin:0 0 6px;font-family:${SERIF_MAIL};font-size:21px;line-height:1.25;"><a href="${esc(entryHref(entry))}" style="color:${INK};text-decoration:none;">${esc(entryTitle(entry))}</a></h3>${entry.body ? `<p style="margin:0 0 6px;font-family:${SERIF_MAIL};font-size:15px;line-height:1.6;color:${INK};">${esc(String(entry.body).replace(/\s+/g, ' ').slice(0, 280))}</p>` : ''}${entry.description ? `<p style="margin:0 0 6px;font-family:${SERIF_MAIL};font-size:15px;line-height:1.6;color:${INK};">${esc(entry.description)}</p>` : ''}<p style="margin:0;font-family:${SANS_MAIL};font-size:12px;line-height:1.5;color:${SOFT};">${esc(linkMeta(entry, lang))}</p></div>`
        )
        .join('')
    : '';

  const watchHtml = sections.videos.length
    ? mailH(labels.videos) +
      sections.videos
        .map(
          (entry) =>
            `<div style="margin:0 0 26px;">${img(entry.image, '', entryHref(entry))}<h3 style="margin:0 0 6px;font-family:${SERIF_MAIL};font-size:20px;line-height:1.25;"><a href="${esc(entryHref(entry))}" style="color:${INK};text-decoration:none;">${esc(entryTitle(entry))}</a></h3><p style="margin:0;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc([videoChannel(entry), `${t.inStream} ${dayShort(entry.publishedAt, lang)}`].filter(Boolean).join('. '))} &nbsp;<a href="${esc(entryHref(entry))}" style="color:${INK};">${esc(t.watchCta)} →</a></p></div>`
        )
        .join('')
    : '';

  const frameHtml = sections.photos.length
    ? mailH(labels.photos) +
      sections.photos
        .map((entry) => {
          const u = safeUrl(entry.image);
          return `<div style="margin:0 0 22px;">${u ? `<img src="${esc(u)}" alt="${esc(photoAlt(entry))}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;">` : ''}<p style="margin:6px 0 0;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(dayShort(entry.publishedAt, lang))}${entry.caption ? `. ${esc(entry.caption)}` : ''}</p></div>`;
        })
        .join('')
    : '';

  const blocks: Record<MaterialKey, string> = {
    lead: leadHtml,
    latest: latestHtml,
    links: readHtml,
    videos: watchHtml,
    photos: frameHtml,
  };

  const materialsHtml = order.map((key) => blocks[key]).join('');

  const srcHtml =
    enabled.sources !== false && payload.sourceIndex.length
      ? mailH(labels.sources) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${payload.sourceIndex
          .map((source) => {
            const href = safeUrl(source.url);
            const title = esc(source.title || source.source);
            return `<tr><td style="padding:8px 8px 8px 0;border-top:1px solid ${LINE};font-family:${SANS_MAIL};font-size:13px;line-height:1.5;color:${INK};">${href ? `<a href="${esc(href)}" style="color:${INK};">${title}</a>` : title}<br><span style="font-size:12px;color:${SOFT};">${esc(source.source)}${source.originalDate ? `. ${esc(dateLong(source.originalDate, lang))}` : ''}</span></td></tr>`;
          })
          .join('')}</table>`
      : '';

  const joinHtml =
    enabled.subscribe !== false
      ? `<div style="margin-top:38px;padding-top:18px;border-top:2px solid ${INK};"><h2 style="margin:0 0 10px;font-family:${SERIF_MAIL};font-size:28px;line-height:1.15;color:${INK};">${esc(t.joinTitle)}</h2><p style="margin:0 0 16px;font-family:${SERIF_MAIL};font-size:16px;line-height:1.55;color:${SOFT};">${esc(labels.subscribeCopy)}</p><a href="${SITE}/flow/join" style="display:inline-block;background:${INK};color:${PAPER};padding:13px 26px;border-radius:999px;font-family:${SERIF_MAIL};font-size:16px;font-style:italic;text-decoration:none;">${esc(t.joinCta)} ↗</a></div>`
      : '';

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(`${num}. ${period}. ${summary}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER};"><tr><td align="center" style="padding:0 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td style="padding:22px 18px 36px;">
<p style="margin:0 0 8px;font-family:${SANS_MAIL};font-size:12px;color:${SOFT};">${esc(period)}. ${esc(num)}</p>
<div style="border-top:1px solid ${INK};border-bottom:1px solid ${INK};padding:16px 0 14px;text-align:center;"><span style="font-family:${MONO_MAIL};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${SOFT};">${esc(t.brand)}</span><div style="margin-top:8px;font-family:${SERIF_MAIL};font-size:30px;font-weight:normal;letter-spacing:-.5px;line-height:1.2;color:${INK};">${esc(o.title)}</div></div>
<p style="margin:20px 0 8px;font-family:${MONO_MAIL};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${SOFT};">${esc(labels.metrics)}</p>
${metricsHtml}
${introHtml}
${materialsHtml}
${srcHtml}${joinHtml}
<p style="margin:30px 0 0;padding-top:14px;border-top:1px solid ${LINE};font-family:${SANS_MAIL};font-size:12px;color:${SOFT};"><a href="${esc(o.canonical)}" style="color:${SOFT};">${esc(t.openWeb)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
}

/* ---------- TEXT ---------- */

function renderText(payload: IssuePayload, ext: Stats, o: Opts): string {
  const lang = payload.lang;
  const t = L[lang];
  const labels = issueLabels(payload);
  const sections = issueSections(payload);
  const { period, num } = issueTitle(payload, o.number);
  const summary = issueSummary(payload, issueEntries(payload), lang);
  const intro = pierrotIntro(payload, issueEntries(payload), lang);
  const flowDays = ext.flowActiveDays ?? ext.days ?? 1;
  const published = publishedCount(payload, ext);
  const order = materialOrder(payload);
  const enabled = payload.template?.sections?.enabled || {};
  const out: string[] = [o.title, `${t.brand}. ${num}`, period, ''];

  out.push(
    labels.metrics,
    `${t.publishedItems}: ${published}`,
    `${t.flowActiveDays}: ${flowDays}`,
    `${t.summary}: ${summary}`,
    ''
  );

  if (intro.length) out.push(t.authorColumn, ...intro, '');

  const blocks: Record<MaterialKey, string[]> = {
    lead: sections.lead
      ? [
          labels.lead,
          sections.lead.title,
          '',
          String(sections.lead.body || ''),
          entryHref(sections.lead),
          '',
        ]
      : [],
    latest: sections.latest.length
      ? [
          labels.latest,
          ...sections.latest.map(
            (entry) =>
              `${dateLong(entry.publishedAt, lang)} · ${t.types[entry.type] || entry.type} · ${entryTitle(entry)}\n${String(entry.body || '').trim()}\n${entryHref(entry)}`
          ),
          '',
        ]
      : [],
    links: sections.links.length
      ? [
          labels.links,
          ...sections.links.map((entry) =>
            [entryTitle(entry), entry.body, entry.description, entryHref(entry)]
              .filter(Boolean)
              .join('\n')
          ),
          '',
        ]
      : [],
    videos: sections.videos.length
      ? [
          labels.videos,
          ...sections.videos.map((entry) => `${entryTitle(entry)}\n${entryHref(entry)}`),
          '',
        ]
      : [],
    photos: sections.photos.length
      ? [
          labels.photos,
          ...sections.photos.map((entry) =>
            [entry.caption, entry.image].filter(Boolean).join('\n')
          ),
          '',
        ]
      : [],
  };

  for (const key of order) out.push(...blocks[key]);

  if (enabled.sources !== false && payload.sourceIndex.length) {
    out.push(
      labels.sources,
      ...payload.sourceIndex.map((s) => [s.title || s.source, s.url].filter(Boolean).join('\n')),
      ''
    );
  }

  if (enabled.subscribe !== false) {
    out.push(t.joinTitle, labels.subscribeCopy, `${t.joinCta}: ${SITE}/flow/join`, '');
  }

  out.push(o.canonical);
  return out.join('\n');
}

/* ---------- API ---------- */

type IssueRenderOptions = {
  title: string;
  slug: string;
  siteUrl?: string;
  number?: number | null;
};

function renderOptions(payload: IssuePayload, options: IssueRenderOptions): Opts {
  const issueBase = payload.lang === 'ru' ? '/flow-issues' : '/en/flow-issues';
  const canonical = `${options.siteUrl || SITE}${issueBase}/${options.slug}`;

  return { title: options.title, canonical, number: options.number };
}

/** Web-only renderer for public pages; avoids building the email payload. */
export function renderIssueWeb(payload: IssuePayload, options: IssueRenderOptions): string {
  return renderWeb(payload, payload.stats, renderOptions(payload, options));
}

export function renderIssue(payload: IssuePayload, options: IssueRenderOptions) {
  const ext = payload.stats;
  const o = renderOptions(payload, options);

  return {
    htmlWeb: renderWeb(payload, ext, o),
    htmlEmail: renderEmail(payload, ext, o),
    textEmail: renderText(payload, ext, o),
  };
}
