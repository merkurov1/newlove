import type { CustomPeriodInput, ReportingPeriodKey } from '@/lib/pierrot/reportingPeriod';

export type CommercialQuestion = {
  commercial: true;
  weeklyReview: boolean;
  wantsRevenue: boolean;
  wantsSales: boolean;
  wantsAttribution: boolean;
  wantsWhy: boolean;
  wantsBestOffer: boolean;
  wantsInterest: boolean;
  wantsAbandonment: boolean;
  wantsSubscriptions: boolean;
  wantsDonations: boolean;
  wantsRecommendations: boolean;
  wantsComparison: boolean;
  periodKey: ReportingPeriodKey;
  customPeriod?: CustomPeriodInput;
};

const RU_MONTHS: Record<string, number> = {
  январ: 1,
  феврал: 2,
  март: 3,
  апрел: 4,
  ма: 5,
  июн: 6,
  июл: 7,
  август: 8,
  сентябр: 9,
  октябр: 10,
  ноябр: 11,
  декабр: 12,
};

const EN_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function validDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const probe = new Date(Date.UTC(year, month - 1, day));

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
    day
  ).padStart(2, '0')}`;
}

function currentYear(now: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
  });

  return Number(formatter.format(now));
}

function parseMonthName(value: string): number | null {
  const key = value.toLowerCase();

  for (const [stem, month] of Object.entries(RU_MONTHS)) {
    if (key.startsWith(stem)) return month;
  }

  return EN_MONTHS[key] ?? null;
}

function buildCustom(
  first: { year?: number; month: number; day: number },
  second: { year?: number; month: number; day: number },
  fallbackYear: number
): CustomPeriodInput | null {
  let startYear = first.year ?? second.year ?? fallbackYear;
  let endYear = second.year ?? first.year ?? fallbackYear;

  if (!validDate(startYear, first.month, first.day)) return null;
  if (!validDate(endYear, second.month, second.day)) return null;

  const startSerial = startYear * 10000 + first.month * 100 + first.day;
  const endSerial = endYear * 10000 + second.month * 100 + second.day;

  if (endSerial < startSerial) {
    if (!first.year && !second.year) {
      endYear += 1;
    } else {
      return null;
    }
  }

  if (!validDate(endYear, second.month, second.day)) return null;

  return {
    start: iso(startYear, first.month, first.day),
    end: iso(endYear, second.month, second.day),
  };
}

export function parseCustomPeriod(
  message: string,
  now: Date,
  timezone: string
): CustomPeriodInput | null {
  const text = normalize(message);
  const fallbackYear = currentYear(now, timezone);

  const isoRange = text.match(
    /(\d{4})-(\d{2})-(\d{2})[^\d]{0,24}(\d{4})-(\d{2})-(\d{2})/
  );

  if (isoRange) {
    const first = {
      year: Number(isoRange[1]),
      month: Number(isoRange[2]),
      day: Number(isoRange[3]),
    };
    const second = {
      year: Number(isoRange[4]),
      month: Number(isoRange[5]),
      day: Number(isoRange[6]),
    };

    return buildCustom(first, second, fallbackYear);
  }

  const numericRange = text.match(
    /(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?[^\d]{0,24}(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?/
  );

  if (numericRange) {
    return buildCustom(
      {
        day: Number(numericRange[1]),
        month: Number(numericRange[2]),
        year: numericRange[3] ? Number(numericRange[3]) : undefined,
      },
      {
        day: Number(numericRange[4]),
        month: Number(numericRange[5]),
        year: numericRange[6] ? Number(numericRange[6]) : undefined,
      },
      fallbackYear
    );
  }

  const dayFirst: Array<{ day: number; month: number; year?: number }> = [];
  const dayFirstPattern =
    /(\d{1,2})\s+(январ[яь]?|феврал[яь]?|март[а]?|апрел[яь]?|ма[яй]?|июн[яь]?|июл[яь]?|август[а]?|сентябр[яь]?|октябр[яь]?|ноябр[яь]?|декабр[яь]?)(?:\s+(\d{4}))?/gi;

  for (const match of text.matchAll(dayFirstPattern)) {
    const month = parseMonthName(match[2]);

    if (!month) continue;

    dayFirst.push({
      day: Number(match[1]),
      month,
      year: match[3] ? Number(match[3]) : undefined,
    });
  }

  if (dayFirst.length >= 2) {
    return buildCustom(dayFirst[0], dayFirst[1], fallbackYear);
  }

  const monthFirst: Array<{ day: number; month: number; year?: number }> = [];
  const monthFirstPattern =
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s+(\d{4}))?/gi;

  for (const match of text.matchAll(monthFirstPattern)) {
    const month = parseMonthName(match[1]);

    if (!month) continue;

    monthFirst.push({
      day: Number(match[2]),
      month,
      year: match[3] ? Number(match[3]) : undefined,
    });
  }

  if (monthFirst.length >= 2) {
    return buildCustom(monthFirst[0], monthFirst[1], fallbackYear);
  }

  return null;
}

function choosePeriod(
  text: string,
  wantsComparison: boolean,
  customPeriod: CustomPeriodInput | null
): ReportingPeriodKey {
  if (customPeriod) return 'custom';

  if (/(позапрошл|two weeks ago|two weeks back)/.test(text)) {
    return 'previous_7_days';
  }

  if (
    /(предыдущ[а-яё]*\s+месяц|прошл[а-яё]*\s+месяц|previous month|last month)/.test(text) &&
    !/(сравни|compare|по сравнению)/.test(text)
  ) {
    return 'previous_month';
  }

  if (/(этот месяц|текущ[а-яё]*\s+месяц|current month)/.test(text)) {
    return 'current_month';
  }

  if (
    /(сравни|compare|по сравнению)/.test(text) &&
    /(месяц|month)/.test(text) &&
    !/(30 дней|30 days|последн[а-яё]*\s+месяц|last 30|два месяца|two months)/.test(text)
  ) {
    return 'current_month';
  }

  if (/(30 дней|30 days|последн[а-яё]*\s+месяц|за месяц|last 30|past month)/.test(text)) {
    return 'last_30_days';
  }

  if (/(два месяца|two months|2 месяцев)/.test(text)) {
    return 'last_30_days';
  }

  if (/(прошл[а-яё]*\s+недел|previous week|last week)/.test(text)) {
    // "что изменилось после прошлой недели" asks for the current week
    // compared with the previous one, not a report on the previous week alone.
    if (/(после|since|изменилось|changed)/.test(text)) return 'last_7_days';

    return 'previous_7_days';
  }

  if (/(недел|week)/.test(text)) return 'last_7_days';

  if (wantsComparison && /(месяц|month)/.test(text)) return 'current_month';

  return 'last_7_days';
}

export function detectCommercialQuestion(
  message: string,
  options: { now?: Date; timezone?: string } = {}
): CommercialQuestion | null {
  if (typeof message !== 'string' || !message.trim()) return null;

  const text = normalize(message);
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? 'Europe/London';

  const weeklyReview =
    /(как у нас дела|итоги недели|недельн[а-яё]*\s+отчет|weekly review|weekly report|how are we doing)/.test(
      text
    );

  const wantsWhy =
    /(почему\s+так\s+мало|почему\s+.*не\s+покупа|почему\s+.*(плохо|низк|мало)|что\s+происходит\s+с\s+продаж|why\s+.*(so little|not buy|low|poorly)|what.*happening.*sales)/.test(
      text
    );

  const wantsBestOffer =
    /(что\s+.*прода[её]тся\s+лучше|что\s+лучше\s+продается|best.?sell|what\s+sells\s+best|which.*sells)/.test(
      text
    );

  const wantsInterest =
    /(заинтерес|интерес[а-яё]*\s+к\s+(книг|предложен|покуп)|сколько\s+.*интерес|interested\s+.*(book|offer|buy)|book interest)/.test(
      text
    );

  const wantsAbandonment =
    /(начали\s+оформлен|не\s+закончил|брошенн[а-яё]*\s+корзин|abandon|checkout.*(start|finish|complete)|оформлен[а-яё]*.*не)/.test(
      text
    );

  const wantsSubscriptions =
    /(нов[а-яё]*\s+подписчик|подписчик[а-яё]*\s+flow|flow\s+подписчик|new\s+.*subscriber|subscriber\w*\s+flow)/.test(
      text
    );

  const asksProductPrice = /(сколько\s+стоит|how\s+much\s+is|\bprice\b|\bcost\b)/.test(text);

  const wantsDonations =
    !asksProductPrice &&
    /(пожертвован|donation|temple tribute|\btribute\b|подношен|сколько.*(храм|temple))/.test(text);

  const wantsRevenue =
    /(заработ|выручк|доход|прибыл|revenue|earned|\bearn\b|how much.*(money|make|made)|money did)/.test(
      text
    );

  const wantsSales =
    /(продаж|\bsales\b|\bsold\b|покупок|покупки|сколько\s+заказов|how many orders|продан)/.test(
      text
    );

  const wantsAttribution =
    /(благодаря\s+пьеро|attributed|pierrot.*(sale|revenue|sold|earned)|пьеро.*(прода|заработ|принес))/.test(
      text
    );

  const wantsRecommendations =
    /(что\s+мне\s+делать|что\s+делать|what\s+should\s+i\s+do|recommend|рекоменд)/.test(text);

  const wantsComparison =
    /(сравни|сравнить|compare|изменилось|what\s+changed|динамик|trend|по\s+сравнению)/.test(text);

  const genericCommercial =
    /(коммерческ|commercial|monetization|монетизац|зарабатыва|business result)/.test(text);

  if (
    !weeklyReview &&
    !wantsWhy &&
    !wantsBestOffer &&
    !wantsInterest &&
    !wantsAbandonment &&
    !wantsSubscriptions &&
    !wantsDonations &&
    !wantsRevenue &&
    !wantsSales &&
    !wantsRecommendations &&
    !wantsComparison &&
    !genericCommercial
  ) {
    return null;
  }

  const customPeriod = parseCustomPeriod(message, now, timezone);
  const periodKey = choosePeriod(text, wantsComparison, customPeriod);
  const comparison =
    wantsComparison ||
    /(две недели|two weeks|два месяца|two months|изменилось|what changed)/.test(text);

  return {
    commercial: true,
    weeklyReview,
    wantsRevenue,
    wantsSales,
    wantsAttribution,
    wantsWhy,
    wantsBestOffer,
    wantsInterest,
    wantsAbandonment,
    wantsSubscriptions,
    wantsDonations,
    wantsRecommendations:
      wantsRecommendations || weeklyReview || (wantsWhy && !wantsRevenue && !wantsSales),
    wantsComparison: comparison,
    periodKey,
    ...(customPeriod ? { customPeriod } : {}),
  };
}
