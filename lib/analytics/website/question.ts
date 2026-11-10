import { parseCustomPeriod } from '@/lib/pierrot/commercialQuestion';
import {
  addZonedDays,
  startOfZonedDay,
} from '@/lib/pierrot/reportingPeriod';

import { DEFAULT_ANALYTICS_TIMEZONE } from './config';
import { PROJECT_DEFINITIONS, normalizePath } from './normalize';
import type { WebsiteQuestion, WebsiteQuestionScope } from './types';

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Extract an explicit public URL/path. A path is a precise page selector:
 * "посещаемость /flow" is about that page, not about the Flow project or the
 * Flow editorial stream as a whole.
 */
export function extractAnalyticsPagePath(message: string): string | null {
  if (typeof message !== 'string') return null;

  const absolute = message.match(/https?:\/\/[^\s<>"']+/i);
  if (absolute) {
    try {
      const path = normalizePath(new URL(absolute[0]).pathname);
      return path && path !== '/' ? path : null;
    } catch {
      return null;
    }
  }

  const relative = message.match(/(^|\s)(\/[a-z0-9][a-z0-9\-/_]*)/i);
  if (!relative) return null;

  const path = normalizePath(relative[2]);
  return path && path !== '/' ? path : null;
}

/**
 * A natural-language detector, not a slash command.
 *
 * It deliberately does not hijack a commercial question: revenue, sales and
 * orders keep their existing dedicated tool. It does claim questions about the
 * website, traffic, search, pages, content performance and named projects.
 */
export function detectWebsiteQuestion(
  message: string,
  options: { now?: Date; timezone?: string } = {}
): WebsiteQuestion | null {
  if (typeof message !== 'string' || !message.trim()) return null;

  const text = normalize(message);
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? DEFAULT_ANALYTICS_TIMEZONE;

  const explicitCommand = text.match(/^\/(site|website|web|traffic|seo)\b/);
  if (explicitCommand) {
    return buildQuestion(message, text, now, timezone, true);
  }

  const websiteTerms =
    /(сайт|website|веб-?сайт|трафик|traffic|посещаем|посетител|visitor|аудитор|audience|google\s*analytics|ga4|search\s*console|seo|органик|organic|поисков[а-яё]*\s+(трафик|видимост|запрос)|показы|impressions|клики|ctr|позици[а-яё]*\s+в\s+поиске|реферал|referral|лендинг|landing|источник[а-яё]*\s+трафика|канал[а-яё]*\s+трафика|страниц[а-яё]*\s+(сайта|привлека|просмотр)|просмотр[а-яё]*\s+страниц|конверси[а-яё]*\s+сайта|вовлеченност|bounce|отказы|bluesky|bsky|блускай|блюскай|рассыл[а-яё]*|newsletter|публичн[а-яё]*\s+присутств|public\s+presence|цифров[а-яё]*\s+след|digital\s+footprint|vercel|web\s+vitals|core\s+web\s+vitals|speed\s+insights|скорост[а-яё]*\s+сайта)/i;

  const searchTerms =
    /(что\s+люди\s+ищут|поисков[а-яё]*\s+запрос|запрос[а-яё]*\s+в\s+google|google\s*search|search\s*console|показы|клики|ctr|индексац|видимост[а-яё]*\s+в\s+google|позици[а-яё]*|органик)/i;

  const contentTerms =
    /(какие\s+страниц|страниц[а-яё]*\s+(привлека|интерес|просматрива|читают)|какие\s+публикац|публикац[а-яё]*\s+(набира|популярн|читают|интерес)|материал[а-яё]*\s+читают|популярн[а-яё]*\s+публикац|лучшие\s+страниц|топ\s+страниц|контент\s+(работает|не\s+работает)|стать[а-яё]*\s+(читают|популярн))/i;

  const engagementGap =
    /(читают.*не\s+(подпис|покупа|действ)|привлека.*не\s+привод|интерес.*но\s+не|посещают.*но\s+не|смотрят.*но\s+не|внимани.*но\s+не\s+привод)/i;

  const projectTerm = PROJECT_DEFINITIONS.map((project) => {
    const names: Record<string, RegExp> = {
      flow: /(\bflow\b|флоу)/i,
      heart: /(heart\s*(&|and|и)\s*angel|heartandangel|heart\s*angel|сердце\s*и\s*ангел)/i,
      journal: /(\bjournal\b|журнал)/i,
      letters: /(\bletters\b|письм[а-яё]*)/i,
      art: /(art\s*engine|арт[\s-]*движок)/i,
      unframed: /(\bunframed\b|анфреймд)/i,
    };
    return { key: project.key, pattern: names[project.key] };
  }).find((entry) => has(text, entry.pattern));

  const projectPerformance =
    /(что\s+происходит|как\s+дела|результат|эффект|интересу|популярн|посеща|трафик|просмотр|конверс|подпис|продаж|растет|растёт|падает|работает|привлека|вовлеч|статистик|метрик|данные|performance|traffic|results|interest|growing|declining)/i;

  const genericComparison =
    /(сравни|сравнить|compare|что\s+изменилось|what\s+changed|динамик|тренд|trend|по\s+сравнению|было\s+и\s+стало)/i;

  const genericProblems =
    /(какие\s+проблемы|проблемы\s+и\s+возможности|что\s+не\s+так|что\s+улучшить|возможности\s+роста|opportunit|anomal|аномал)/i;

  const previousPeriodSignal =
    /(прошл[а-яё]*\s+(месяц|недел)|предыдущ[а-яё]*\s+(месяц|недел)|в\s+прошлом\s+месяце|last\s+month|previous\s+month|last\s+week|previous\s+week)/i;

  const commercialOnly =
    /(заработ|выручк|доход|прибыл|revenue|sales|sold|earn|money|order|заказ|покуп|продаж|продал|checkout|корзин|attributed|монетизац|monetization)/i;

  const commercialCountQuestion =
    /(сколько|how\s+many).*(подписчик|донат|пожертв|покуп|заказ|денег|money|revenue|sales|orders)/i.test(
      text
    ) &&
    !/(почему|why|что\s+происходит|какие\s+страниц|трафик|поиск|посеща|показ|клик)/i.test(text);

  const pagePath = extractAnalyticsPagePath(message);
  const explicitWebsite = has(text, websiteTerms) || Boolean(pagePath);
  const projectSignal = Boolean(projectTerm) && has(text, projectPerformance);
  const contentSignal = has(text, contentTerms) || has(text, engagementGap);
  const searchSignal = has(text, searchTerms);
  const comparisonSignal = has(text, genericComparison) && !has(text, commercialOnly);
  const problemsSignal = has(text, genericProblems) && !has(text, commercialOnly);
  const periodSignal = has(text, previousPeriodSignal) && !has(text, commercialOnly);
  const trafficOrSearchSignal =
    explicitWebsite &&
    /(трафик|traffic|посещаем|посетител|visitor|аудитор|audience|поиск|показ|клик|ctr|страниц|источник|канал|реферал|referral|seo|органик|organic|видимост|позици)/i.test(
      text
    );

  // A pure revenue/sales/count question belongs to the commercial tool.
  if (commercialCountQuestion) return null;
  if (
    has(text, commercialOnly) &&
    !trafficOrSearchSignal &&
    !projectSignal &&
    !searchSignal
  ) {
    return null;
  }

  if (!explicitWebsite && !projectSignal && !contentSignal && !searchSignal && !comparisonSignal && !problemsSignal && !periodSignal) {
    return null;
  }

  return buildQuestion(
    message,
    text,
    now,
    timezone,
    explicitWebsite || projectSignal,
    pagePath
  );
}

function detectScope(
  text: string,
  options: { explicitWebsite: boolean; project: string | null; pagePath?: string | null }
): WebsiteQuestionScope {
  // An explicit URL path is the most precise scope. It wins over a project
  // name ("/flow" is one page; Flow as a project also includes /subscribe).
  if (options.pagePath) return 'page';

  if (/(подключ|синхрониз|sync|источник[а-яё]*\s+(данных|недоступ|ошиб)|статус\s+данных|доступ[а-яё]*\s+к\s+аналитик|source\s+health|данные\s+обновля|vercel|web\s+vitals|core\s+web\s+vitals|speed\s+insights|скорост[а-яё]*\s+сайта)/i.test(text)) {
    return 'health';
  }

  if (/(доказательств|evidence|какие\s+факты|на\s+основе\s+чего|откуда\s+данные|уверен)/i.test(text)) {
    return 'evidence';
  }

  if (/(аномал|anomal|что-то\s+странн|неожиданн|резко\s+(упал|вырос)|проблем[а-яё]*\s+и\s+возможност)/i.test(text)) {
    return 'anomalies';
  }

  if (/(возможност|потенциал|opportunit|что\s+улучш|точки\s+роста|недоиспользован)/i.test(text)) {
    return 'opportunities';
  }

  if (/(воронк|funnel|конверс|conversion|подпис|донат|пожертв|покуп|checkout|привод[а-яё]*\s+к\s+действ|дальнейш[а-яё]*\s+действ)/i.test(text)) {
    if (!/(какие\s+страниц|публикац[а-яё]*\s+(набира|популярн)|материал)/i.test(text)) {
      return 'funnel';
    }
  }

  if (options.project || /(что\s+происходит\s+с\s+(flow|heart|journal|art|unframed)|интересуются\s+ли)/i.test(text)) {
    return 'projects';
  }

  if (/(bluesky|bsky|блускай|блюскай)/i.test(text)) {
    return 'bluesky';
  }

  if (/(рассыл[а-яё]*|newsletter|email\s+newsletter|письм[а-яё]*\s+(рассыл[а-яё]*|подписчик)|подписчик[а-яё]*\s+(русск|англ)|russian\s+newsletter|english\s+newsletter)/i.test(text)) {
    return 'newsletter';
  }

  if (/(сравни|сравнить|compare|что\s+изменилось|what\s+changed|динамик|тренд|trend|по\s+сравнению|было\s+и\s+стало|предыдущ[а-яё]*\s+(период|месяц|недел)|прошл[а-яё]*\s+(месяц|недел))/i.test(text)) {
    return 'compare';
  }

  if (/(какие\s+страниц|страниц[а-яё]*\s+(привлека|интерес|просматрива)|какие\s+публикац|публикац[а-яё]*\s+(набира|популярн)|материал|контент|лендинг|landing|популярн)/i.test(text)) {
    return 'pages';
  }

  if (/(что\s+люди\s+ищут|поисков[а-яё]*\s+(запрос|трафик)|запрос[а-яё]*\s+в\s+google|search\s*console|показы|клики|ctr|позици|органик|seo|индексац|видимост)/i.test(text)) {
    return 'search';
  }

  if (/(bluesky|bsky|блускай|блюскай)/i.test(text)) {
    return 'bluesky';
  }

  if (/(рассыл[а-яё]*|newsletter|email\s+newsletter|письм[а-яё]*\s+(рассыл[а-яё]*|подписчик)|подписчик[а-яё]*\s+(русск|англ)|russian\s+newsletter|english\s+newsletter)/i.test(text)) {
    return 'newsletter';
  }

  if (/(трафик|traffic|посещаем|посетител|аудитор|audience|источник|канал|откуда\s+приход|referral|реферал|географ|устройств|device|страны)/i.test(text)) {
    return 'traffic';
  }

  if (options.explicitWebsite) return 'overview';

  return 'overview';
}

function detectPeriod(
  message: string,
  text: string,
  now: Date,
  timezone: string
): Pick<WebsiteQuestion, 'periodKey' | 'customPeriod'> {
  const custom = parseCustomPeriod(message, now, timezone);
  if (custom) return { periodKey: 'custom', customPeriod: custom };

  if (/(сегодня|today|за сегодня)/i.test(text)) {
    const today = startOfZonedDay(now, timezone);
    return {
      periodKey: 'custom',
      customPeriod: { start: iso(today), end: iso(today) },
    };
  }

  if (/(вчера|yesterday|за вчера)/i.test(text)) {
    const today = startOfZonedDay(now, timezone);
    const yesterday = addZonedDays(today, -1, timezone);
    return {
      periodKey: 'custom',
      customPeriod: { start: iso(yesterday), end: iso(yesterday) },
    };
  }

  if (/(90\s*дней|90\s*days|три\s+месяца|three\s+months|квартал|quarter)/i.test(text)) {
    const today = startOfZonedDay(now, timezone);
    const start = addZonedDays(today, -89, timezone);
    return {
      periodKey: 'custom',
      customPeriod: { start: iso(start), end: iso(today) },
    };
  }

  if (/(30\s*дней|30\s*days|последн[а-яё]*\s+месяц|last\s+30|past\s+month|за\s+месяц)/i.test(text)) {
    return { periodKey: 'last_30_days' };
  }

  if (/(предыдущ[а-яё]*\s+месяц|прошл[а-яё]*\s+месяц|previous\s+month|last\s+month)/i.test(text)) {
    if (!/(сравни|compare|по\s+сравнению)/i.test(text)) {
      return { periodKey: 'previous_month' };
    }
    return { periodKey: 'last_30_days' };
  }

  if (/(этот\s+месяц|текущ[а-яё]*\s+месяц|current\s+month)/i.test(text)) {
    return { periodKey: 'current_month' };
  }

  if (/(прошл[а-яё]*\s+недел|previous\s+week|last\s+week)/i.test(text)) {
    if (/(после|since|изменилось|changed)/i.test(text)) return { periodKey: 'last_7_days' };
    return { periodKey: 'previous_7_days' };
  }

  return { periodKey: 'last_7_days' };
}

function buildQuestion(
  message: string,
  text: string,
  now: Date,
  timezone: string,
  explicitWebsite: boolean,
  pagePath: string | null = null
): WebsiteQuestion {
  const projectEntries = PROJECT_DEFINITIONS.map((project) => {
    const names: Record<string, RegExp> = {
      flow: /(\bflow\b|флоу)/i,
      heart: /(heart\s*(&|and|и)\s*angel|heartandangel|heart\s*angel)/i,
      journal: /(\bjournal\b|журнал)/i,
      letters: /(\bletters\b|письм[а-яё]*)/i,
      art: /(art\s*engine|арт[\s-]*движок)/i,
      unframed: /(\bunframed\b)/i,
    };
    return { key: project.key, pattern: names[project.key] };
  }).filter((entry) => has(text, entry.pattern));

  // A question that names several projects must show all of them, not the
  // first one the detector happened to find.
  const project = pagePath
    ? null
    : projectEntries.length === 1
      ? projectEntries[0].key
      : null;
  const scope = detectScope(text, { explicitWebsite, project, pagePath });
  const wantsComparison =
    /(сравни|сравнить|compare|что\s+изменилось|what\s+changed|динамик|тренд|по\s+сравнению|было\s+и\s+стало|предыдущ[а-яё]*\s+(период|месяц|недел))/i.test(
      text
    );
  const wantsProblems =
    /(проблем|problem|аномал|anomal|что\s+не\s+так|риск|сбой)/i.test(text);
  const wantsRecommendations =
    /(что\s+делать|что\s+мне\s+делать|рекоменд|recommend|возможност|потенциал|улучш|следующ[а-яё]*\s+шаг)/i.test(
      text
    );
  const wantsDetailed =
    /(подробн|детальн|полный\s+отчет|полный\s+отчёт|все\s+метрик|таблиц|full\s+report|detailed|breakdown)/i.test(
      text
    );
  const period = detectPeriod(message, text, now, timezone);

  return {
    website: true,
    scope,
    wantsComparison,
    wantsProblems,
    wantsRecommendations,
    wantsDetailed,
    project,
    pagePath,
    ...period,
  };
}

export function websiteQuestionLabel(question: WebsiteQuestion): string {
  const labels: Record<WebsiteQuestionScope, string> = {
    overview: 'обзор сайта',
    traffic: 'трафик и аудитория',
    search: 'поисковая видимость',
    pages: 'страницы и контент',
    page: 'метрики страницы',
    compare: 'сравнение периодов',
    projects: 'проекты',
    funnel: 'воронка действий',
    opportunities: 'возможности',
    anomalies: 'аномалии и проблемы',
    health: 'состояние источников',
    evidence: 'доказательства',
    bluesky: 'Bluesky',
    newsletter: 'рассылки',
  };

  return labels[question.scope];
}
