import {
  addLocalDays,
  getZonedParts,
  resolveOwnerTimeZone,
  zonedTimeToUtc,
  type ZonedParts,
} from './time';
import type { IntakeParseResult, IntakeType, ParsedIntakeItem } from './types';

// JavaScript \b is ASCII-only and does not work around Cyrillic words, so
// every phrase-level pattern uses an explicit letter/number boundary.
const B = '(?:^|[^a-zа-я0-9])';
const E = '(?=$|[^a-zа-я0-9])';

function phrase(source: string): RegExp {
  return new RegExp(`${B}(?:${source})${E}`, 'i');
}

const QUESTION_PATTERN = new RegExp(
  `\\?|^\\s*(?:что|сколько|какие|какой|какая|где|когда|почему|зачем|можно|нужно\\s+ли|есть\\s+ли|did\\s+i|do\\s+i|does|what|how|which|when|why|where|is\\s+there|are\\s+there|have\\s+i|am\\s+i)(?=$|[\\s,.!?;:])`,
  'i'
);

const NEGATION_PATTERN = phrase(
  `не\\s+(?:ел|ела|ели|пил|пила|пили|съел|съела|выпил|выпила|употреблял|употребляла)|ничего\\s+не|без\\s+еды|без\\s+напитков|didn'?t\\s+(?:eat|drink)|did\\s+not\\s+(?:eat|drink)|haven'?t\\s+(?:eaten|drunk)|hasn'?t\\s+(?:eaten|drunk)|no\\s+food|no\\s+drinks?|never\\s+(?:eat|drink)`
);

const FUTURE_OR_HYPOTHETICAL_PATTERN = phrase(
  `собираюсь|планирую|буду|хочу|хотел\\s+бы|хотела\\s+бы|надо|нужно|давай|завтра|послезавтра|съесть|выпить|перекусить|если\\s+бы|наверное|возможно|представь|will\\s+(?:eat|drink|have)|going\\s+to\\s+(?:eat|drink|have)|plan\\s+to|tomorrow|would\\s+(?:eat|drink|have)|should\\s+(?:eat|drink|have)|could\\s+(?:eat|drink|have)|might\\s+(?:eat|drink)|maybe|probably|imagine|if\\s+i\\s+(?:eat|drink|had)`
);

const RECIPE_PATTERN = phrase(
  `рецепт|рецепты|ингредиент|ингредиенты|приготовлен|приготовить|как\\s+приготовить|recipe|recipes|ingredients?|how\\s+to\\s+(?:cook|make)|preparation|instructions?`
);

const THIRD_PARTY_PATTERN = new RegExp(
  `${B}(?:он|она|они|друг|подруга|жена|муж|ребенок|ребёнок|мама|папа|брат|сестра|коллега|he|she|they|my\\s+friend|my\\s+wife|my\\s+husband|someone)\\s+(?:съел|съела|съели|выпил|выпила|выпили|ел|ела|ели|пил|пила|пили|ate|eaten|drank|drunk|had|consumed)${E}`,
  'i'
);

const QUOTE_PATTERN = /^\s*(?:>|«|"|“|')|(?:сказал|сказала|said|says)\s*[:\-—]/i;

const FOOD_VERB_PATTERN = phrase(
  `съел|съела|съели|поел|поела|поели|ел|ела|ели|перекусил|перекусила|перекусили|попробовал|попробовала|ate|eaten|had|consumed|tasted`
);
const DRINK_VERB_PATTERN = phrase(
  `выпил|выпила|выпили|пил|пила|пили|drank|drunk|sipped`
);
const MEAL_PATTERN = new RegExp(
  `(?:^|\\s)(?:на\\s+)?(?:завтрак|обед|ужин|перекус|ланч|breakfast|lunch|dinner|brunch)\\s+(?:был|была|было|были|was|were)${E}|(?:^|\\s)(?:завтракал|завтракала|обедал|обедала|ужинал|ужинала|had\\s+(?:breakfast|lunch|dinner))${E}`,
  'i'
);

const DRINK_WORDS = new Set([
  'вода',
  'воды',
  'воду',
  'воде',
  'водой',
  'кофе',
  'чай',
  'чаю',
  'чай',
  'вино',
  'вина',
  'вино',
  'сок',
  'сока',
  'соки',
  'молоко',
  'молока',
  'кефир',
  'пиво',
  'пива',
  'кола',
  'колы',
  'лимонад',
  'компот',
  'морс',
  'квас',
  'шампанское',
  'шампанского',
  'виски',
  'водка',
  'водки',
  'коньяк',
  'коньяка',
  'какао',
  'смузи',
  'water',
  'coffee',
  'tea',
  'wine',
  'juice',
  'milk',
  'kefir',
  'beer',
  'cola',
  'lemonade',
  'compote',
  'smoothie',
  'champagne',
  'whisky',
  'whiskey',
  'vodka',
  'cognac',
  'cocoa',
]);

const NUMBER_WORDS: Record<string, number> = {
  один: 1,
  одна: 1,
  одно: 1,
  одну: 1,
  два: 2,
  две: 2,
  двух: 2,
  три: 3,
  трех: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  полтора: 1.5,
  половина: 0.5,
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
};

const UNIT_PATTERN =
  /^(?:г|гр|кг|мг|мл|л|шт|штук(?:а|и)?|чашк(?:а|и)?|стакан(?:а|ов)?|бокал(?:а|ов)?|рюмк(?:а|и)?|ложк(?:а|и)?|ст\.?\s*л\.?|ч\.?\s*л\.?|кусок|кусоч(?:ек|ка)|ломтик(?:а|ов)?|порци(?:я|и|й)|тарелк(?:а|и)?|пакет(?:а|ов)?|бутылк(?:а|и)?|банк(?:а|и)?|g|gram(?:s)?|kg|kilogram(?:s)?|mg|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|oz|ounce(?:s)?|lb|lbs?|pound(?:s)?|cup(?:s)?|glass(?:es)?|bowl(?:s)?|slice(?:s)?|piece(?:s)?|serving(?:s)?|bottle(?:s)?|can(?:s)?|tbsp|tsp|clove(?:s)?|pinch(?:es)?)$/i;

const UNIT_ONLY_PREFIX =
  /^(чашк(?:а|и)?|стакан(?:а|ов)?|бокал(?:а|ов)?|рюмк(?:а|и)?|ложк(?:а|и)?|кусок|кусоч(?:ек|ка)|ломтик(?:а|ов)?|порци(?:я|и|й)|тарелк(?:а|и)?|пакет(?:а|ов)?|бутылк(?:а|и)?|банк(?:а|и)?|cup|glass|bowl|slice|piece|serving|bottle|can|clove|pinch)(?=$|[\s-])[\s-]*(.*)$/i;

const TIME_WORDS_PATTERN =
  /^(?:(?:сегодня|вчера|позавчера|сейчас|только\s+что|утром|днем|вечером|ночью|на\s+завтрак|на\s+обед|на\s+ужин|за\s+завтраком|за\s+обедом|за\s+ужином|today|yesterday|now|just\s+now|this\s+morning|this\s+afternoon|tonight|last\s+night|for\s+breakfast|for\s+lunch|for\s+dinner)\s+)+/i;

const FILLER_PATTERN =
  /^(?:(?:я|i|и|and|also|еще|ещё|немного|примерно|about|just|пожалуйста|please)\s+)+/i;

const VERB_PATTERN =
  /^(?:(?:сейчас|just|только\s+что)?\s*)?(?:съел|съела|съели|поел|поела|поели|ел|ела|ели|перекусил|перекусила|перекусили|попробовал|попробовала|выпил|выпила|выпили|пил|пила|пили|ate|eaten|drank|drunk|had|consumed|tasted|sipped)\s+/i;

const RU_NUMBER =
  '(?:один|одна|одно|одну|два|две|двух|три|трех|четыре|пять|шесть|семь|восемь|девять|десять|полтора|половина)';
const EN_NUMBER = '(?:one|two|three|four|five|six|seven|eight|nine|ten|a|an|half)';

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectLanguage(value: string): 'ru' | 'en' {
  const cyrillic = (value.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  return cyrillic >= latin ? 'ru' : 'en';
}

function splitItems(text: string): string[] {
  return text
    .split(/\s+(?:и|and|plus)\s+|[,;]\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

const NAME_CANONICAL: Record<string, string> = {
  воды: 'вода',
  воду: 'вода',
  воде: 'вода',
  водой: 'вода',
  чаю: 'чай',
  чая: 'чай',
  вина: 'вино',
  вином: 'вино',
  сока: 'сок',
  соку: 'сок',
  молока: 'молоко',
  пива: 'пиво',
  водки: 'водка',
  коньяка: 'коньяк',
  шампанского: 'шампанское',
};

function canonicalItemName(value: string): string {
  const cleaned = value
    .replace(/^[-–—•\s]+/, '')
    .replace(/^(?:of|с|со)\s+/i, '')
    .replace(/[.!?,;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = normalize(cleaned);
  return NAME_CANONICAL[normalized] || cleaned;
}

function parseQuantity(value: string): {
  quantity: number | null;
  unit: string | null;
  name: string;
} {
  let text = value.trim().toLowerCase().replace(/ё/g, 'е');
  text = text.replace(TIME_WORDS_PATTERN, '').replace(FILLER_PATTERN, '').replace(VERB_PATTERN, '');
  text = text
    .replace(/^(?:на|for)\s+(?:завтрак|обед|ужин|breakfast|lunch|dinner)\s*/i, '')
    .replace(/^(?:был|была|было|были|was|were)\s+/i, '')
    .trim();

  // 500 мл воды / 2 cups of coffee / 1 бокал вина
  const measured = text.match(
    new RegExp(`^(\\d+(?:[.,]\\d+)?|${RU_NUMBER}|${EN_NUMBER})\\s*([^\\s]+)?\\s+(.+)$`, 'i')
  );
  if (measured) {
    const rawQuantity = measured[1];
    const maybeUnit = measured[2] || '';
    const rest = measured[3] || '';
    const unit = UNIT_PATTERN.test(maybeUnit) ? maybeUnit.replace(/\.$/, '') : null;
    const numeric = NUMBER_WORDS[rawQuantity.toLowerCase()];
    const quantity =
      typeof numeric === 'number'
        ? numeric
        : Number.isFinite(Number(rawQuantity.replace(',', '.')))
          ? Number(rawQuantity.replace(',', '.'))
          : null;

    if (quantity !== null) {
      return {
        quantity,
        unit,
        name: canonicalItemName(unit ? rest : `${maybeUnit} ${rest}`.trim()),
      };
    }
  }

  // "бокал вина" / "cup of coffee" — the unit itself implies one.
  const unitPrefix = text.match(UNIT_ONLY_PREFIX);
  if (unitPrefix) {
    const unit = unitPrefix[1].toLowerCase();
    const name = canonicalItemName(
      (unitPrefix[2] || '').replace(/^(?:of|с|со)\s+/i, '')
    );
    return { quantity: 1, unit, name };
  }

  // "два яйца" / "two eggs" — a count without an explicit unit.
  const countPrefix = text.match(
    new RegExp(`^(\\d+(?:[.,]\\d+)?|${RU_NUMBER}|${EN_NUMBER})\\s+(.+)$`, 'i')
  );
  if (countPrefix) {
    const raw = countPrefix[1].toLowerCase();
    const numeric = NUMBER_WORDS[raw];
    const quantity =
      typeof numeric === 'number'
        ? numeric
        : Number.isFinite(Number(raw.replace(',', '.')))
          ? Number(raw.replace(',', '.'))
          : null;
    if (quantity !== null) {
      return { quantity, unit: null, name: canonicalItemName(countPrefix[2]) };
    }
  }

  return { quantity: null, unit: null, name: canonicalItemName(text) };
}

function itemType(
  name: string,
  inherited: IntakeType | null,
  segmentHasDrinkVerb: boolean,
  segmentHasFoodVerb: boolean
): IntakeType | null {
  if (segmentHasDrinkVerb) return 'drink';

  const words = normalize(name).split(/\s+/);
  if (words.some((word) => DRINK_WORDS.has(word))) return 'drink';
  if (segmentHasFoodVerb) return 'food';
  if (inherited) return inherited;
  return null;
}

function timeFromMessage(
  text: string,
  now: Date,
  timeZone: string
): { occurredAt: string; explicit: boolean; dayOffset: number } {
  const normalized = normalize(text);
  let dayOffset = 0;
  if (phrase('вчера|yesterday').test(normalized)) dayOffset = -1;
  if (phrase('позавчера').test(normalized)) dayOffset = -2;

  let hour: number | null = null;
  let minute = 0;
  let explicit = false;

  const clock =
    normalized.match(
      /(?:^|[^a-zа-я0-9])(?:в|at)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|утра|дня|вечера|ночи|o'clock)?/i
    ) || normalized.match(/(?:^|[^0-9])(\d{1,2}):(\d{2})(?:$|[^0-9])/);
  if (clock) {
    let value = Number(clock[1]);
    minute = Number(clock[2] || 0);
    const marker = (clock[3] || '').toLowerCase();
    if ((marker === 'pm' || marker === 'вечера' || marker === 'дня') && value < 12) value += 12;
    if ((marker === 'am' || marker === 'утра' || marker === 'ночи') && value === 12) value = 0;
    if (value >= 0 && value <= 23 && minute >= 0 && minute <= 59) {
      hour = value;
      explicit = true;
    }
  }

  if (hour === null) {
    if (phrase('утром|this\\s+morning|morning').test(normalized)) {
      hour = 8;
      explicit = true;
    } else if (phrase('днем|this\\s+afternoon|afternoon|lunch|обед').test(normalized)) {
      hour = 13;
      explicit = true;
    } else if (phrase('вечером|tonight|evening|last\\s+night|ужин|dinner').test(normalized)) {
      hour = 19;
      explicit = true;
    } else if (phrase('ночью|night').test(normalized)) {
      hour = 23;
      explicit = true;
    } else if (phrase('завтрак|breakfast').test(normalized)) {
      hour = 8;
      explicit = true;
    }
  }

  const nowParts = getZonedParts(now, timeZone);
  let local: ZonedParts;
  if (hour === null) {
    if (dayOffset === 0) {
      local = nowParts;
    } else {
      local = { ...nowParts, hour: 12, minute: 0, second: 0 };
    }
  } else {
    local = {
      ...addLocalDays(nowParts, dayOffset),
      hour,
      minute,
      second: 0,
    };
  }

  return {
    occurredAt: zonedTimeToUtc(local, timeZone).toISOString(),
    explicit,
    dayOffset,
  };
}

export function resolveIntakeOccurredAt(
  message: string,
  input: { now?: Date; timezone: string }
): { occurredAt: string; explicit: boolean; dayOffset: number } {
  return timeFromMessage(message, input.now || new Date(), input.timezone);
}

export type ParseIntakeOptions = {
  now?: Date;
  timezone?: string;
  timezoneKnown?: boolean;
};

/**
 * Deterministic extractor for actual, already-completed consumption.
 * It deliberately fails closed: a question, negation, plan, recipe, quote or
 * third-party statement produces no record.
 */
export function parseIntakeMessage(
  message: string,
  options: ParseIntakeOptions = {}
): IntakeParseResult {
  const now = options.now || new Date();
  const zone = resolveOwnerTimeZone();
  const timezone = options.timezone || zone.timezone;
  const timezoneKnown = options.timezoneKnown ?? zone.known;
  const language = detectLanguage(message);
  const text = message.trim();
  const normalized = normalize(text);

  const empty = (reason: string, confidence = 0): IntakeParseResult => ({
    detected: false,
    items: [],
    confidence,
    reason,
    language,
    timezone,
    timezoneKnown,
    usedModel: false,
  });

  if (!text) return empty('empty_message');
  if (QUESTION_PATTERN.test(text) && !FOOD_VERB_PATTERN.test(text) && !DRINK_VERB_PATTERN.test(text)) {
    return empty('question');
  }
  if (NEGATION_PATTERN.test(normalized)) return empty('negation');
  if (FUTURE_OR_HYPOTHETICAL_PATTERN.test(normalized)) return empty('future_or_hypothetical');
  if (RECIPE_PATTERN.test(normalized)) return empty('recipe');
  if (THIRD_PARTY_PATTERN.test(normalized)) return empty('third_party');
  if (QUOTE_PATTERN.test(text)) return empty('quote');

  const foodVerb = FOOD_VERB_PATTERN.test(normalized);
  const drinkVerb = DRINK_VERB_PATTERN.test(normalized);
  const mealPattern = MEAL_PATTERN.test(normalized);

  if (!foodVerb && !drinkVerb && !mealPattern) {
    return empty('no_consumption_verb');
  }

  // A question mark with a consumption verb is still a question. An explicit
  // past-tense statement normally has none.
  if (text.includes('?')) return empty('question');

  const inherited: IntakeType | null =
    drinkVerb && !foodVerb
      ? 'drink'
      : foodVerb && !drinkVerb
        ? 'food'
        : mealPattern
          ? 'food'
          : null;
  const time = timeFromMessage(text, now, timezone);
  const segments = splitItems(text);
  const items: ParsedIntakeItem[] = [];

  for (const segment of segments) {
    const segmentDrink = DRINK_VERB_PATTERN.test(segment);
    const segmentFood = FOOD_VERB_PATTERN.test(segment);
    const parsed = parseQuantity(segment);
    if (!parsed.name || parsed.name.length < 2) continue;

    const type = itemType(parsed.name, inherited, segmentDrink, segmentFood);
    if (!type) continue;

    // Reject leftover command/question fragments that survived cleanup.
    if (
      /^(?:что|сколько|какие|почему|зачем|what|how|which|why|where|did|do|does)\b/i.test(
        parsed.name
      )
    ) {
      continue;
    }

    items.push({
      type,
      itemName: parsed.name.slice(0, 120),
      quantity: parsed.quantity,
      unit: parsed.unit,
      occurredAt: time.occurredAt,
      timezone: timezoneKnown ? timezone : 'UTC',
    });
  }

  if (items.length === 0) return empty('no_items', 0.2);

  let confidence = 0.55;
  if (foodVerb || drinkVerb) confidence += 0.25;
  if (mealPattern) confidence += 0.08;
  if (time.explicit) confidence += 0.05;
  if (timezoneKnown) confidence += 0.04;
  if (items.some((item) => item.quantity === null)) confidence -= 0.04;
  confidence = Math.max(0, Math.min(0.98, Number(confidence.toFixed(2))));

  return {
    detected: true,
    items,
    confidence,
    reason: 'consumption_detected',
    language,
    timezone: timezoneKnown ? timezone : 'UTC',
    timezoneKnown,
    usedModel: false,
  };
}
