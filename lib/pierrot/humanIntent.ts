/**
 * Natural-language detection for "ask Piero to call Anton".
 *
 * The detector is deliberately conservative: it looks for a request verb
 * (call / connect / speak / ask) near Anton's name, not for the name alone.
 * A question *about* Anton must never start a human takeover request.
 *
 * JavaScript's \b and \w are ASCII-only even with the u flag, so the patterns
 * use Unicode property escapes and lookarounds around Cyrillic text.
 */

export type HumanIntentResult = {
  requested: boolean;
  confidence: 'high' | 'medium';
  matched: string | null;
};

const NB = '(?<![\\p{L}\\p{N}])';
const NE = '(?![\\p{L}\\p{N}])';
const L = '[\\p{L}]';

const ANTON = `${NB}(?:антон(?:а|у|ом|е)?|меркуров(?:а|у|ым|е)?)${NE}`;
const ANTON_EN = `${NB}(?:anton|mr\\.?\\s+merkurov|merkurov)${NE}`;

const RU_REQUEST_VERBS = `${NB}(?:позов${L}*|позвать|вызов${L}*|вызвать|попроси${L}*|просить|соедин${L}*|связать${L}*|связаться|поговор${L}*|побеседов${L}*|пообща${L}*|переключ${L}*|переда${L}*|дай|дать|нужен|нужна|можно|хочу|хотел${L}*|хотелось)${NE}`;

const RU_AVAILABILITY = `${NB}(?:подойд${L}*|подойти|приди|прийти|зайди|зайти|здесь|тут|на\\s+связи|на\\s+месте|доступен|доступна|свободен|свободна|может|сможет)${NE}`;

const STRONG_RU = [
  new RegExp(`${RU_REQUEST_VERBS}[\\s\\S]{0,80}${ANTON}`, 'u'),
  new RegExp(`${ANTON}[\\s\\S]{0,80}${RU_AVAILABILITY}`, 'u'),
];

const STRONG_EN = [
  new RegExp(
    `${NB}(?:call|invite|summon|bring|get|connect|speak|talk|chat|ask)${NE}[\\s\\S]{0,80}${ANTON_EN}`,
    'iu',
  ),
  new RegExp(
    `${ANTON_EN}[\\s\\S]{0,60}${NB}(?:here|available|around|free|join|come|online)${NE}`,
    'iu',
  ),
  new RegExp(
    `${ANTON_EN}[\\s\\S]{0,50}${NB}(?:call|speak|talk|chat|connect|reply)${NE}`,
    'iu',
  ),
  new RegExp(
    `${NB}(?:let\\s+me|can\\s+i|may\\s+i|i\\s+(?:want|would\\s+like|need))${NE}[\\s\\S]{0,60}${NB}(?:speak|talk|chat|connect)${NE}[\\s\\S]{0,40}${ANTON_EN}`,
    'iu',
  ),
];

const EXPLICIT_RU = new RegExp(
  `^\\s*(?:позови|вызови|попроси)\\s+(?:антона|антон|меркурова)${NE}`,
  'u',
);
const EXPLICIT_EN = new RegExp(
  `^\\s*(?:call|invite|summon)\\s+(?:anton|merkurov)${NE}`,
  'iu',
);

const NEGATIVE_RU =
  /(?:кто\s+такой|кто\s+такая|расскажи|расскажите|что\s+известно|биограф|о\s+жизни|про\s+антона|об\s+антоне)/u;
const NEGATIVE_EN =
  /(?:who\s+is\s+anton|tell\s+me\s+about\s+anton|what\s+do\s+you\s+know\s+about\s+anton|about\s+anton|anton'?s\s+(?:work|book|life|art))/iu;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(patterns: RegExp[], text: string): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].slice(0, 120);
  }

  return null;
}

export function detectHumanPresenceIntent(text: string): HumanIntentResult {
  if (typeof text !== 'string' || !text.trim()) {
    return { requested: false, confidence: 'high', matched: null };
  }

  const normalized = normalize(text);

  const explicit =
    normalized.match(EXPLICIT_RU)?.[0] ?? normalized.match(EXPLICIT_EN)?.[0] ?? null;

  if (explicit) {
    return { requested: true, confidence: 'high', matched: explicit };
  }

  const ruMatch = firstMatch(STRONG_RU, normalized);

  if (ruMatch) {
    // "Расскажи про Антона" contains neither a request verb nor availability.
    // The negative guard protects unusual phrasings such as
    // "расскажи, кто такой Антон".
    if (
      NEGATIVE_RU.test(normalized) &&
      !/(?:позов|вызов|соедин|позвать|вызвать)/u.test(normalized) &&
      !/(?:поговор|побеседов)[\p{L}]*\s+(?:с|со)\s+антон/u.test(normalized)
    ) {
      return { requested: false, confidence: 'high', matched: null };
    }

    return { requested: true, confidence: 'high', matched: ruMatch };
  }

  const enMatch = firstMatch(STRONG_EN, normalized);

  if (enMatch) {
    if (
      NEGATIVE_EN.test(normalized) &&
      !/\b(?:speak|talk|chat)\s+(?:to|with)\s+anton\b/iu.test(normalized)
    ) {
      return { requested: false, confidence: 'high', matched: null };
    }

    return { requested: true, confidence: 'high', matched: enMatch };
  }

  // A soft fallback: a short imperative that names Anton and asks for a
  // connection. This catches "Антон, можно?" without matching biographies.
  if (
    new RegExp(`${ANTON}`, 'u').test(normalized) &&
    /(?:можно|сможешь|сможете|пожалуйста|плиз|срочно)/u.test(normalized) &&
    normalized.length <= 80
  ) {
    return { requested: true, confidence: 'medium', matched: 'soft-ru' };
  }

  if (
    new RegExp(`${ANTON_EN}`, 'iu').test(normalized) &&
    /(?:\bplease\b|\burgent\b|can you|could you|\bnow\b)/iu.test(normalized) &&
    normalized.length <= 90
  ) {
    return { requested: true, confidence: 'medium', matched: 'soft-en' };
  }

  return { requested: false, confidence: 'high', matched: null };
}
