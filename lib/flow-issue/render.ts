import { DEFAULT_ISSUE_TEMPLATE } from './template';
import { buildIssueHeader } from './header';
import { issueEntries } from './title';
import { readEditorialComposition } from './composition';
import type {
  EditorialComposition,
  EditorialLedgerEntry,
  EditorialPartKind,
  IssueEntry,
  IssuePayload,
  IssueLang,
} from './types';

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
// Mail palette: warm paper, soft black ink, graphite secondary text, one muted
// wine accent and thin light rules. Kept independent from the web gallery theme
// so the newsletter rendering stays byte-for-byte predictable.
const ACCENT = '#7A2233';
const PAPER = '#FAF8F5';
const INK = '#1C1A1B';
const SOFT = '#5B5658'; // graphite
const LINE = '#DAD3CC';
const CLARET = ACCENT;
const BAR2 = '#DAD3CC';
// Шрифты сайта: если страница открывается внутри приложения, подхватятся его переменные
// (--font-serif, --font-sans, --font-mono), иначе работают запасные.
const SERIF_WEB = "var(--font-serif,'Source Serif 4',Georgia,'Times New Roman',serif)";
const SANS_WEB = "var(--font-sans,'Inter',system-ui,-apple-system,'Segoe UI',Arial,sans-serif)";
const MONO_WEB = "var(--font-mono,ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace)";
const SERIF_MAIL = "Georgia,'Times New Roman',serif";
const SANS_MAIL = 'Arial,Helvetica,sans-serif';
const MONO_MAIL = "'Courier New',Courier,monospace";

// Daylight Glass web palette. Kept separate from the mail constants above so
// the public redesign never alters the newsletter's rendered colours.
const WEB_PAPER = '#F7F3EC';
const WEB_INK = '#201E1A';
const WEB_SOFT = '#6B6257';
const WEB_LINE = '#DDD4C5';
const WEB_ACCENT = '#7A2233';
const WEB_TINT = '#EFE9DF';

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
  const legacy = (value: string | undefined, legacyValues: string[], fallback: string) =>
    !value || legacyValues.includes(value.toUpperCase()) ? fallback : value;

  return {
    paper: legacy(theme?.paper, ['#FFFFFF', '#FAF8F5'], PAPER),
    ink: legacy(theme?.ink, ['#111111', '#1C1A1B'], INK),
    soft: legacy(theme?.muted, ['#52525B', '#6B6568', '#5B5658'], SOFT),
    line: legacy(theme?.rule, ['#D4D4D8', '#DDD6D8', '#DAD3CC'], LINE),
    accent: legacy(theme?.accent, ['#111111', '#990F3D', '#7A2233'], ACCENT),
    // Older issue payloads stored the previous 760px template width. Keep the
    // stored value as a lower bound only so every published issue benefits
    // from the wider newspaper composition without rewriting its snapshot.
    maxWidth: Math.max(theme?.maxWidth || 0, 1440),
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

const WEB_LEGACY = {
  paper: ['#FFFFFF', '#FAF8F5', '#F7F3EC', '#FBF9F5'],
  ink: ['#111111', '#1C1A1B', '#201E1A', '#000000'],
  soft: ['#52525B', '#6B6568', '#5B5658', '#6B6257'],
  line: ['#D4D4D8', '#DDD6D8', '#DAD3CC', '#DDD4C5'],
  accent: ['#111111', '#990F3D', '#7A2233'],
} as const;

const WEB_LEGACY_SERIF = [
  "Georgia, 'Times New Roman', serif",
  'Georgia',
  'Georgia, serif',
  "'Times New Roman', Times, serif",
  'Times New Roman',
];

const WEB_LEGACY_SANS = [
  'Inter, Arial, sans-serif',
  'Inter',
  'Arial, sans-serif',
  'Arial',
  'system-ui, sans-serif',
];

function normalizedFont(value: string): string {
  return value.replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function webThemeValue(
  value: string | undefined,
  legacyValues: readonly string[],
  fallback: string
): string {
  const candidate = typeof value === 'string' ? value.trim() : '';

  if (!candidate) return fallback;

  return legacyValues.some((legacy) => legacy.toUpperCase() === candidate.toUpperCase())
    ? fallback
    : candidate;
}

function webThemeFont(
  value: string | undefined,
  legacyFonts: readonly string[],
  fallback: string
): string {
  const candidate = typeof value === 'string' ? value.trim() : '';

  if (!candidate) return fallback;

  return legacyFonts.some((legacy) => normalizedFont(legacy) === normalizedFont(candidate))
    ? fallback
    : candidate;
}

/**
 * Web-only theme resolution.
 *
 * Stored issue payloads carry snapshots of the old newspaper template. The
 * public page deliberately maps those legacy defaults onto the current
 * Daylight Glass tokens while preserving genuinely custom colours and fonts.
 */
function issueWebTheme(payload: IssuePayload) {
  const theme = payload.template?.theme;

  return {
    paper: webThemeValue(theme?.paper, WEB_LEGACY.paper, WEB_PAPER),
    ink: webThemeValue(theme?.ink, WEB_LEGACY.ink, WEB_INK),
    soft: webThemeValue(theme?.muted, WEB_LEGACY.soft, WEB_SOFT),
    line: webThemeValue(theme?.rule, WEB_LEGACY.line, WEB_LINE),
    accent: webThemeValue(theme?.accent, WEB_LEGACY.accent, WEB_ACCENT),
    // Older payloads stored the previous 760px template width. Keep the
    // stored value as a lower bound so every published issue benefits from
    // the gallery composition without rewriting its snapshot.
    maxWidth: Math.max(theme?.maxWidth || 0, 1440),
    serif: webThemeFont(theme?.serifFont, WEB_LEGACY_SERIF, SERIF_WEB),
    sans: webThemeFont(theme?.sansFont, WEB_LEGACY_SANS, SANS_WEB),
  };
}

function webCss(payload: IssuePayload): string {
  const theme = issueWebTheme(payload);

  return `
.flow-issue-root{--bg:${theme.paper};--ink:${theme.ink};--soft:${theme.soft};--line:${theme.line};--claret:${theme.accent};--tint:${WEB_TINT};--bar:${theme.ink};--bar2:${theme.line};--glass:rgba(255,255,255,.58);
--serif:${theme.serif};--sans:${theme.sans};--mono:${MONO_WEB};position:relative;isolation:isolate;background:var(--bg);color:var(--ink);font:17px/1.68 var(--serif);scroll-padding-top:12px;color-scheme:light;padding-top:env(safe-area-inset-top,0);padding-bottom:env(safe-area-inset-bottom,0);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.flow-issue-root,.flow-issue-root *{box-sizing:border-box}
.flow-issue-root ::selection{background:var(--claret);color:var(--bg)}
.flow-issue-root a{color:inherit;overflow-wrap:anywhere;word-break:break-word;text-underline-offset:.18em;text-decoration-thickness:1px}
.flow-issue-root img,.flow-issue-root video,.flow-issue-root iframe{max-width:100%}
.flow-issue-root img,.flow-issue-root video{height:auto}
.flow-issue-root .page{max-width:${theme.maxWidth}px;min-width:0;margin:0 auto;padding:clamp(18px,2.6vw,34px) clamp(16px,4vw,56px) clamp(52px,7vw,84px);position:relative;z-index:10}
.flow-issue-root .top{display:grid;grid-template-columns:minmax(0,1fr);gap:7px 20px;align-items:baseline;padding:0 0 14px;border-bottom:1px solid color-mix(in srgb,var(--line) 82%,transparent);color:var(--soft);font:500 10.5px/1.45 var(--mono);letter-spacing:.16em;text-transform:uppercase}
.flow-issue-root .top span{min-width:0;overflow-wrap:anywhere}
@media(min-width:640px){.flow-issue-root .top{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 24px}}
@media(min-width:960px){.flow-issue-root .top{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 28px}.flow-issue-root .top span:nth-child(4){text-align:right}}
.flow-issue-root .mast{border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);padding:clamp(28px,5vw,60px) clamp(2px,3vw,52px) clamp(26px,4vw,46px);text-align:center;background:linear-gradient(180deg,color-mix(in srgb,var(--glass) 34%,transparent),transparent 72%)}
.flow-issue-root .mast .brand{margin:0 0 clamp(14px,2vw,22px);color:var(--claret);font:600 11px/1 var(--mono);letter-spacing:.38em;text-transform:uppercase}
.flow-issue-root .mast h1{max-width:min(1120px,100%);margin:0 auto;font:400 clamp(30px,5.1vw,62px)/1.08 var(--serif);letter-spacing:-.025em;text-wrap:balance;overflow-wrap:anywhere;word-break:break-word}
.flow-issue-root .nav{display:flex;flex-wrap:wrap;justify-content:center;gap:4px clamp(12px,3vw,34px);padding:12px 0;border-bottom:1px solid var(--line);font:500 11px/1.4 var(--mono);letter-spacing:.2em;text-transform:uppercase}
.flow-issue-root .nav a{display:inline-flex;min-height:36px;align-items:center;padding:4px 0;text-decoration:underline;text-underline-offset:7px;text-decoration-color:var(--line);transition:color 140ms ease,text-decoration-color 140ms ease}
.flow-issue-root .nav a:hover{color:var(--claret);text-decoration-color:var(--claret)}
.flow-issue-root .g{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(34px,5vw,56px);margin-top:clamp(36px,5vw,56px)}
@media(min-width:1024px){.flow-issue-root .g{grid-template-columns:repeat(12,minmax(0,1fr));column-gap:clamp(26px,3.4vw,52px);row-gap:clamp(30px,4vw,52px)}.flow-issue-root .c8{grid-column:span 8}.flow-issue-root .c4{grid-column:span 4}.flow-issue-root .c6{grid-column:span 6}.flow-issue-root .c12{grid-column:span 12}}
.flow-issue-root section,.flow-issue-root aside{margin:0;min-width:0}
.flow-issue-root .k{margin:0 0 12px;color:var(--soft);font:500 11px/1.45 var(--mono);letter-spacing:.18em;text-transform:uppercase}
.flow-issue-root h2{margin:0 0 14px;font:400 clamp(30px,4.4vw,48px)/1.08 var(--serif);letter-spacing:-.02em;overflow-wrap:anywhere;text-wrap:balance}
.flow-issue-root h3{margin:0 0 8px;font:400 clamp(20px,2.3vw,26px)/1.26 var(--serif);letter-spacing:-.008em;overflow-wrap:anywhere}
.flow-issue-root .by{margin:0 0 20px;padding-bottom:14px;border-bottom:1px solid var(--line);color:var(--soft);font:italic 15px/1.5 var(--serif)}
.flow-issue-root .meta{margin:0;color:var(--soft);font:13px/1.55 var(--sans);overflow-wrap:anywhere}
.flow-issue-root .card p{margin:0 0 8px}
.flow-issue-root .feed{list-style:none;margin:0;padding:0}
.flow-issue-root .feed li{display:grid;grid-template-columns:minmax(54px,72px) minmax(0,1fr);gap:12px;min-width:0;padding:14px 0;border-top:1px solid var(--line);font-size:16px;line-height:1.42}
.flow-issue-root .feed li > div{min-width:0}
.flow-issue-root .feed li a{overflow-wrap:anywhere}
.flow-issue-root .feed li:first-child{border-top:0;padding-top:0}
.flow-issue-root .feed time{color:var(--soft);font:11px/1.5 var(--mono);letter-spacing:.04em}
.flow-issue-root .feed b{display:block;margin-bottom:3px;color:var(--soft);font:500 10px/1.4 var(--mono);letter-spacing:.16em;text-transform:uppercase}
.flow-issue-root #latest{border:1px solid var(--line);border-radius:20px;padding:clamp(16px,2.4vw,24px);background:var(--glass);box-shadow:0 1px 2px rgba(32,30,26,.04),0 24px 48px -40px rgba(32,30,26,.42)}
.flow-issue-root #latest .k{margin-bottom:10px}
.flow-issue-root .nums{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--ink);border-bottom:1px solid var(--line)}
@media(min-width:700px){.flow-issue-root .nums{grid-template-columns:repeat(var(--n,5),minmax(0,1fr))}}
.flow-issue-root .nums div{min-width:0;padding:18px 0 16px 16px;border-left:1px solid var(--line)}
.flow-issue-root .nums div:first-child{padding-left:0;border-left:0}
.flow-issue-root .nums b{display:block;font:400 46px/1 var(--serif);overflow-wrap:anywhere}
.flow-issue-root .nums span{color:var(--soft);font:13px/1.45 var(--sans)}
.flow-issue-root .metrics{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(10px,1.6vw,16px)}
@media(min-width:560px){.flow-issue-root .metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:900px){.flow-issue-root .metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
.flow-issue-root .metrics div{min-width:0;padding:clamp(18px,2.4vw,26px);border:1px solid var(--line);border-radius:18px;background:var(--glass);box-shadow:0 1px 2px rgba(32,30,26,.04),0 22px 44px -38px rgba(32,30,26,.44)}
.flow-issue-root .metrics b{display:block;font:400 clamp(38px,6vw,58px)/.95 var(--serif);overflow-wrap:anywhere}
.flow-issue-root .metrics span{display:block;margin-top:9px;color:var(--soft);font:12.5px/1.45 var(--sans)}
.flow-issue-root .metrics .metric-summary b{font:400 clamp(20px,2.4vw,29px)/1.2 var(--serif);letter-spacing:-.012em;text-wrap:balance}
.flow-issue-root .lead p{max-width:72ch}
.flow-issue-root .intro{border-top:1px solid var(--ink);padding-top:clamp(20px,3vw,28px)}
.flow-issue-root .intro p{max-width:72ch;margin:0 0 16px;color:var(--ink);font:400 19px/1.72 var(--serif);overflow-wrap:anywhere}
.flow-issue-root .intro p:first-child{font-size:clamp(21px,2.4vw,26px);line-height:1.52;letter-spacing:-.012em}
.flow-issue-root .intro p:last-child{margin-bottom:0}
.flow-issue-root .issue-feed{display:flex;flex-direction:column;min-width:0}
.flow-issue-root .item{min-width:0;padding:clamp(22px,3vw,32px) 0;border-top:1px solid var(--line)}
.flow-issue-root .item:first-child{border-top-color:var(--ink)}
.flow-issue-root .item-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px;color:var(--soft);font:11px/1.45 var(--mono);letter-spacing:.14em;text-transform:uppercase}
.flow-issue-root .item h3{margin:0 0 12px;font:400 clamp(23px,3vw,34px)/1.18 var(--serif);overflow-wrap:anywhere}
.flow-issue-root .item h3 a{text-decoration:none}
.flow-issue-root .item h3 a:hover{text-decoration:underline;text-underline-offset:5px;text-decoration-color:var(--line)}
.flow-issue-root .item p{max-width:72ch;margin:0 0 12px;color:var(--ink);font:400 17px/1.72 var(--serif);overflow-wrap:anywhere}
.flow-issue-root .item .item-dek{max-width:76ch;color:var(--soft);font:italic 18px/1.58 var(--serif)}
.flow-issue-root .item-image{display:block;max-width:min(100%,780px);margin:16px 0 14px}
.flow-issue-root .item-image img{display:block;width:100%;height:auto;border-radius:14px;background:var(--tint);object-fit:contain}
.flow-issue-root .item-open{display:inline-block;padding-bottom:2px;border-bottom:1px solid transparent;color:var(--soft);font:11px/1.4 var(--mono);letter-spacing:.16em;text-transform:uppercase;text-decoration:none}
.flow-issue-root .item-open:hover{color:var(--ink);border-bottom-color:var(--ink)}
.flow-issue-root .row{display:grid;grid-template-columns:96px minmax(0,1fr) 56px;gap:10px;align-items:center;margin:7px 0;font:13px/1.5 var(--sans)}
.flow-issue-root .rowL{grid-template-columns:150px minmax(0,1fr) 56px}
.flow-issue-root .row i{display:block;height:10px;background:var(--bar)}
.flow-issue-root .row.alt i{background:var(--bar2)}
.flow-issue-root .row span:last-child{text-align:right;color:var(--soft)}
.flow-issue-root .days{display:flex;align-items:flex-end;gap:14px;height:130px;margin-top:26px;border-bottom:1px solid var(--ink)}
.flow-issue-root .days div{position:relative;flex:1;min-width:0;background:var(--bar)}
.flow-issue-root .days i{position:absolute;top:-22px;width:100%;font:500 13px var(--mono);font-style:normal;text-align:center}
.flow-issue-root .dl{display:flex;gap:14px;margin-top:6px}
.flow-issue-root .dl span{flex:1;min-width:0;color:var(--soft);font:12px var(--mono);text-align:center}
.flow-issue-root .stack{display:flex;height:34px;margin:10px 0 8px}
.flow-issue-root .stack div{display:flex;min-width:0;align-items:center;padding-left:8px;overflow:hidden;color:#FAF8F5;font:500 12px var(--mono)}
.flow-issue-root .legend{margin:0;color:var(--soft);font:13px/1.5 var(--sans)}
.flow-issue-root .cap{margin:12px 0 0;color:var(--soft);font:13.5px/1.55 var(--sans)}
.flow-issue-root .cards{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(16px,2.2vw,24px);min-width:0}
@media(min-width:600px){.flow-issue-root .cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:960px){.flow-issue-root .cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
.flow-issue-root .v4{display:grid;grid-template-columns:minmax(0,1fr);gap:clamp(18px,2.4vw,28px);min-width:0}
@media(min-width:560px){.flow-issue-root .v4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1200px){.flow-issue-root .v4{grid-template-columns:repeat(4,minmax(0,1fr))}}
.flow-issue-root .card{display:flex;flex-direction:column;min-width:0;padding:clamp(14px,1.8vw,18px);border:1px solid var(--line);border-radius:18px;background:var(--glass);box-shadow:0 1px 2px rgba(32,30,26,.04),0 22px 48px -40px rgba(32,30,26,.42);text-decoration:none;overflow-wrap:anywhere;transition:transform 180ms ease,border-color 180ms ease,box-shadow 180ms ease}
.flow-issue-root .card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--line) 55%,var(--ink));box-shadow:0 2px 4px rgba(32,30,26,.05),0 28px 54px -38px rgba(32,30,26,.5)}
.flow-issue-root .card h3 a{text-decoration:none}
.flow-issue-root .thumb{display:block;width:100%;aspect-ratio:16/10;margin:0 0 14px;border-radius:12px;background:var(--tint);object-fit:contain}
.flow-issue-root .plate{position:relative;aspect-ratio:16/9;margin-bottom:14px;border-radius:12px;background:var(--tint)}
.flow-issue-root .plate img{display:block;width:100%;height:100%;border-radius:inherit;object-fit:contain}
.flow-issue-root .plate:before{content:'';position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(17,17,17,.56)}
.flow-issue-root .plate:after{content:'';position:absolute;left:50%;top:50%;margin:-11px 0 0 -6px;border-left:20px solid #FAF8F5;border-top:11px solid transparent;border-bottom:11px solid transparent}
.flow-issue-root .frame{display:block;width:100%;height:auto;margin-bottom:10px;border-radius:14px;background:var(--tint);object-fit:contain}
.flow-issue-root .strip{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:2px;margin-top:12px}
.flow-issue-root .strip i{height:34px;background:var(--bar)}
.flow-issue-root .sl{display:flex;justify-content:space-between;margin-top:4px;color:var(--soft);font:12px var(--mono)}
.flow-issue-root table{width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;font:14px/1.55 var(--sans)}
.flow-issue-root th{padding:8px 10px 9px 0;border-bottom:1px solid var(--ink);color:var(--soft);font:500 11px/1.4 var(--mono);letter-spacing:.14em;text-align:left;text-transform:uppercase;overflow-wrap:anywhere;word-break:break-word}
.flow-issue-root td{padding:11px 10px 11px 0;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere;word-break:break-word}
.flow-issue-root .scroll{max-width:100%;overflow-x:auto;border:1px solid var(--line);border-radius:16px;background:var(--glass)}
.flow-issue-root .scroll table{min-width:560px}
.flow-issue-root .scroll th:nth-child(1){width:18%}.flow-issue-root .scroll th:nth-child(2){width:50%}.flow-issue-root .scroll th:nth-child(3){width:18%}.flow-issue-root .scroll th:nth-child(4){width:14%}
.flow-issue-root .scroll th,.flow-issue-root .scroll td{padding-left:14px}
.flow-issue-root .scroll th:last-child,.flow-issue-root .scroll td:last-child{padding-right:14px}
.flow-issue-root .data{padding:16px 18px;border:1px solid var(--line);border-radius:16px;background:var(--tint);font:14px/1.6 var(--sans)}
.flow-issue-root .data p{margin:0 0 6px}
.flow-issue-root .statsHead{margin-bottom:16px;padding-top:16px;border-top:1px solid var(--ink)}
.flow-issue-root .statsHead .k{margin:0}
.flow-issue-root .sub{padding:clamp(26px,4vw,48px);border:1px solid var(--line);border-radius:24px;background:linear-gradient(135deg,var(--glass),color-mix(in srgb,var(--tint) 70%,transparent));box-shadow:0 1px 2px rgba(32,30,26,.04),0 30px 58px -44px rgba(32,30,26,.46);text-align:center}
.flow-issue-root .sub h2{font-size:clamp(28px,4vw,44px)}
.flow-issue-root .dek{max-width:640px;margin:0 auto 22px;color:var(--soft);font:italic 20px/1.55 var(--serif)}
.flow-issue-root .mail{display:inline-block;padding:4px 0;border-bottom:1px solid var(--claret);color:var(--claret);font:italic 19px var(--serif);text-decoration:none;transition:color .2s,border-color .2s}
.flow-issue-root .mail:hover{color:var(--ink);border-bottom-color:var(--ink)}
.flow-issue-root footer{padding-top:14px;border-top:1px solid var(--line);color:var(--soft);font:12px/1.6 var(--mono);letter-spacing:.1em;text-transform:uppercase}
.flow-issue-root footer a{text-decoration:none}
.flow-issue-root footer a:hover{color:var(--ink)}
@media(prefers-reduced-motion:reduce){.flow-issue-root .nav a,.flow-issue-root .card,.flow-issue-root .mail{transition:none}.flow-issue-root .card:hover{transform:none}}
@media(forced-colors:active){.flow-issue-root .metrics div,.flow-issue-root .card,.flow-issue-root .sub{border-color:CanvasText}}
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

  // Every published video belongs to the issue. A template switch may change
  // where the section sits (or hide other optional sections), but it must not
  // silently erase the week's video record.
  const mandatory: MaterialKey[] = payload.videos?.length ? ['videos'] : [];

  return [...new Set([...active, ...remainder, ...mandatory])];
}

const PART_LABELS: Record<IssueLang, Record<EditorialPartKind, string>> = {
  ru: {
    central: 'Главная линия',
    thread: 'Тематическая линия',
    context: 'Контекст',
    episode: 'Отдельные сюжеты',
    visual: 'Визуальная пауза',
    sources: 'Источники и дополнительное чтение',
    archive: 'Полный обзор выпуска',
  },
  en: {
    central: 'Main line',
    thread: 'Thematic line',
    context: 'Context',
    episode: 'Standalone stories',
    visual: 'Visual pause',
    sources: 'Sources and further reading',
    archive: 'Full overview of the issue',
  },
};

/**
 * Resolve every material of the composition from the canonical snapshot.
 * Translated/edited legacy arrays are layered on top so that an EN issue and
 * the admin editor see the same copy as before.
 */
function compositionEntries(payload: IssuePayload): Map<string, IssueEntry> {
  const map = new Map<string, IssueEntry>();

  for (const entry of issueEntries(payload)) {
    if (entry?.id) map.set(entry.id, entry);
  }

  const add = (entry: IssueEntry | null | undefined) => {
    if (entry?.id) map.set(entry.id, entry);
  };

  add(payload.lead);
  for (const entry of payload.latest || []) add(entry);
  for (const entry of payload.links || []) add(entry);
  for (const entry of payload.videos || []) add(entry);
  for (const entry of payload.photos || []) add(entry);

  return map;
}

function ledgerFallbackEntry(ledger: EditorialLedgerEntry): IssueEntry {
  return {
    id: ledger.id,
    type: ledger.type,
    title: ledger.title,
    body: '',
    url: `/flow/${ledger.id}`,
    publishedAt: '',
    createdAt: '',
    metadata: {},
    lang: 'other',
    kind: 'other',
    own: true,
  };
}

function compositionEntryHtml(
  entry: IssueEntry,
  ledger: EditorialLedgerEntry | undefined,
  lang: IssueLang,
  full: boolean
): string {
  const t = L[lang];
  const href = safeUrl(entry.url) || `${SITE}/flow/${entry.id}`;
  const title = entryTitle(entry) || ledger?.title || entry.id;
  const image = safeUrl(entry.image);
  const body = String(entry.body || '');
  const visibleBody = full ? body : body.slice(0, 900);
  const description = String(entry.description || '');
  const caption = String(entry.caption || '');
  const typeLabel = t.types[entry.type] || entry.type;
  const date = entry.publishedAt
    ? `${dateLong(entry.publishedAt, lang)}${hhmm(entry.publishedAt, lang) ? `, ${hhmm(entry.publishedAt, lang)} UTC` : ''}`
    : '';

  return `<article class="item" data-item-id="${esc(entry.id)}">
  <div class="item-meta"><span>${esc(typeLabel)}</span>${date ? `<time>${esc(date)}</time>` : ''}${ledger ? `<span>${esc(ledger.role)}</span>` : ''}</div>
  <h3><a href="${esc(href)}">${esc(title)}</a></h3>
  ${image ? `<figure class="item-image"><img src="${esc(image)}" alt="${esc(entry.type === 'photo' ? photoAlt(entry as PhotoItem) : caption || title)}" loading="lazy"></figure>` : ''}
  ${visibleBody ? paragraphs(visibleBody, 'var(--serif)', 17) : ''}
  ${description ? `<p class="item-dek">${esc(description)}</p>` : ''}
  ${caption && entry.type !== 'photo' ? `<p class="meta">${esc(caption)}</p>` : ''}
  ${entry.type === 'photo' && caption ? `<p class="meta">${esc(caption)}</p>` : ''}
  ${safeUrl(entry.url) ? `<p class="meta"><a href="${esc(safeUrl(entry.url) as string)}">${esc(entry.url as string)}</a></p>` : ''}
  <a class="item-open" href="${esc(href)}">${esc(t.readMore)}</a>
</article>`;
}

function compositionPartHtml(
  part: { id: string; kind: EditorialPartKind; title: string; annotation: string; entryIds: string[] },
  entries: Map<string, IssueEntry>,
  ledgerById: Map<string, EditorialLedgerEntry>,
  lang: IssueLang,
  renderIds: Set<string>,
  centralLabel?: string
): string {
  const labels = PART_LABELS[lang];
  const items: string[] = [];
  const seen = new Set<string>();
  const full = part.kind === 'central';
  const kindLabel =
    part.kind === 'central' && centralLabel ? centralLabel : labels[part.kind] || '';

  for (const id of part.entryIds) {
    if (seen.has(id) || renderIds.has(id)) continue;
    seen.add(id);
    renderIds.add(id);

    const entry = entries.get(id) || (ledgerById.get(id) ? ledgerFallbackEntry(ledgerById.get(id) as EditorialLedgerEntry) : null);
    if (!entry) continue;

    items.push(compositionEntryHtml(entry, ledgerById.get(id), lang, full));
  }

  if (!items.length) return '';

  return `<section id="${esc(part.id)}" class="c12 composition-part" data-part-kind="${esc(part.kind)}">
  <p class="k">${esc(kindLabel)}</p>
  <h2>${esc(part.title)}</h2>
  ${part.annotation ? `<p class="by">${esc(part.annotation)}</p>` : ''}
  <div class="issue-feed">${items.join('')}</div>
</section>`;
}

/**
 * Render the editorial composition and guarantee that every ledger ID that
 * belongs to this edition has a visible, linked representation.
 */
function renderEditorialComposition(
  payload: IssuePayload,
  composition: EditorialComposition,
  lang: IssueLang
): { html: string; nav: { href: string; label: string }[] } {
  const entries = compositionEntries(payload);
  const ledgerById = new Map(composition.ledger.map((entry) => [entry.id, entry]));
  const rendered = new Set<string>();
  const sections: string[] = [];
  const nav: { href: string; label: string }[] = [];
  const uiLabels = issueLabels(payload);

  for (const part of composition.parts) {
    const html = compositionPartHtml(
      part,
      entries,
      ledgerById,
      lang,
      rendered,
      uiLabels.lead
    );

    if (!html) continue;

    sections.push(html);
    nav.push({
      href: part.id,
      label:
        part.kind === 'central'
          ? uiLabels.lead
          : PART_LABELS[lang][part.kind] || part.title,
    });
  }

  // Safety net: any ledger entry of this edition that was not rendered by a
  // part is still shown, never silently dropped.
  const missing = composition.ledger.filter(
    (entry) => entry.role !== 'other_edition' && !rendered.has(entry.id)
  );

  if (missing.length) {
    const part = {
      id: 'archive-extra',
      kind: 'archive' as const,
      title: lang === 'ru' ? 'Полный обзор выпуска' : 'Full overview of the issue',
      annotation:
        lang === 'ru'
          ? 'Материалы, которые не удалось распределить по линиям, сохраняются здесь с рабочими ссылками.'
          : 'Materials that could not be placed in a line are kept here with working links.',
      entryIds: missing.map((entry) => entry.id),
    };

    const html = compositionPartHtml(part, entries, ledgerById, lang, rendered);

    if (html) {
      sections.push(html);
      nav.push({ href: part.id, label: PART_LABELS[lang].archive });
    }
  }

  // A stale composition must not hide records from the canonical `items`
  // snapshot either. Anything still unrendered is shown once more.
  const leftover = [...entries.values()].filter(
    (entry) => !rendered.has(entry.id)
  );

  if (leftover.length) {
    const items = leftover
      .map((entry) => {
        rendered.add(entry.id);
        return compositionEntryHtml(entry, ledgerById.get(entry.id), lang, false);
      })
      .join('');

    sections.push(`<section id="archive-leftover" class="c12 composition-part" data-part-kind="archive">
  <p class="k">${esc(PART_LABELS[lang].archive)}</p>
  <div class="issue-feed">${items}</div>
</section>`);
    nav.push({ href: 'archive-leftover', label: PART_LABELS[lang].archive });
  }

  return { html: sections.join(''), nav };
}

function renderWeb(payload: IssuePayload, ext: Stats, o: Opts): string {
  const lang = payload.lang;
  const t = L[lang];
  const labels = issueLabels(payload);
  const sections = issueSections(payload);
  const header = buildIssueHeader(payload, o.number);
  const summary = issueSummary(payload, issueEntries(payload), lang);
  const intro = pierrotIntro(payload, issueEntries(payload), lang);
  const flowDays = ext.flowActiveDays ?? ext.days ?? 1;
  const published = publishedCount(payload, ext);
  const order = materialOrder(payload);
  const enabled = payload.template?.sections?.enabled || {};
  const composition = readEditorialComposition(payload);
  const compositionView = composition
    ? renderEditorialComposition(payload, composition, lang)
    : null;

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

  // A versioned composition replaces the mechanical section feed on the web.
  // Legacy payloads keep the exact same path as before.
  const materialsHtml = compositionView
    ? compositionView.html
    : order.map((key) => blocks[key]).join('');

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
    ...(compositionView
      ? compositionView.nav
      : order.map((key) => ({ href: key, label: labels[key] }))),
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
<meta name="description" content="${esc(`${o.title}. ${summary}`)}">
<link rel="canonical" href="${esc(o.canonical)}">
<style>${webCss(payload)}</style>
</head>
<body>
<div class="flow-issue-root">
<div class="page">
<div class="top"><span>${esc(header.period)}</span><span>${esc(header.issueNumber)}</span><span>${esc(header.timezone)}</span><span>${esc(header.address)}</span></div>
<header class="mast">
  <p class="brand">${esc(header.brand)}</p>
  <h1>${esc(o.title)}</h1>
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

/**
 * The public web title now closes with a bare `| brand - date` signature.
 * Newsletter delivery keeps its existing quoted masthead form so the email
 * and text representations stay visually unchanged for new issues.
 */
function mailIssueTitle(title: string): string {
  const match = title.trim().match(/^(.*\S)\s+\|\s+((?:Поток|Flow)(?:\s+[-–—]\s+[^|]+)?)$/u);

  return match ? `${match[1]} «| ${match[2]}»` : title;
}

function renderEmail(payload: IssuePayload, ext: Stats, o: Opts): string {
  const theme = issueTheme(payload);
  const mailTitle = mailIssueTitle(o.title);
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
  const header = buildIssueHeader(payload, o.number);
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
      ? `<div style="margin-top:38px;padding-top:18px;border-top:2px solid ${INK};"><h2 style="margin:0 0 10px;font-family:${SERIF_MAIL};font-size:28px;line-height:1.15;color:${INK};">${esc(t.joinTitle)}</h2><p style="margin:0 0 16px;font-family:${SERIF_MAIL};font-size:16px;line-height:1.55;color:${SOFT};">${esc(labels.subscribeCopy)}</p><a href="${SITE}/flow/join" style="display:inline-block;color:${CLARET};border-bottom:1px solid ${CLARET};padding-bottom:2px;font-family:${SERIF_MAIL};font-size:18px;font-style:italic;text-decoration:none;">${esc(t.joinCta)} ↗</a></div>`
      : '';

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(summary)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER};"><tr><td align="center" style="padding:0 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;"><tr><td style="padding:22px 18px 36px;">
<p style="margin:0 0 4px;font-family:${SANS_MAIL};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${SOFT};">${esc(header.period)}</p>
<p style="margin:0 0 4px;font-family:${SANS_MAIL};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${SOFT};">${esc(header.issueNumber)}</p>
<p style="margin:0 0 4px;font-family:${SANS_MAIL};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${SOFT};">${esc(header.timezone)}</p>
<p style="margin:0 0 8px;font-family:${SANS_MAIL};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${SOFT};">${esc(header.address)}</p>
<div style="border-top:1px solid ${INK};border-bottom:1px solid ${INK};padding:16px 0 14px;text-align:center;"><span style="font-family:${MONO_MAIL};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${CLARET};">${esc(header.brand)}</span><div style="margin-top:8px;font-family:${SERIF_MAIL};font-size:30px;font-weight:normal;letter-spacing:-.5px;line-height:1.2;color:${INK};">${esc(mailTitle)}</div></div>
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
  const mailTitle = mailIssueTitle(o.title);
  const lang = payload.lang;
  const t = L[lang];
  const labels = issueLabels(payload);
  const sections = issueSections(payload);
  const header = buildIssueHeader(payload, o.number);
  const summary = issueSummary(payload, issueEntries(payload), lang);
  const intro = pierrotIntro(payload, issueEntries(payload), lang);
  const flowDays = ext.flowActiveDays ?? ext.days ?? 1;
  const published = publishedCount(payload, ext);
  const order = materialOrder(payload);
  const enabled = payload.template?.sections?.enabled || {};
  const out: string[] = [
    header.period,
    header.issueNumber,
    header.timezone,
    header.address,
    header.brand,
    '',
    mailTitle,
    '',
  ];

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
