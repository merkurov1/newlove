/**
 * Natural-language detection for "ask Piero to call Anton".
 *
 * The detector is deliberately conservative: it looks for a request verb
 * (call / connect / speak / ask) near Anton's name, not for the name alone.
 * A question *about* Anton must never start a human takeover request.
 */

export type HumanIntentResult = {
  requested: boolean;
  confidence: 'high' | 'medium';
  matched: string | null;
};

const ANTON = '(?:антон(?:а|у|ом|е)?|меркуров(?:а|у|ым|е)?)';
const ANTON_EN = '(?:anton|mr\\.?\\s+merkurov|merkurov)';

const RU_REQUEST_VERBS =
  '(?:позов\\w*|позвать|вызов\\w*|вызвать|попроси\\w*|просить|соедин\\w*|связать\\w*|связаться|поговор\\w*|побеседов\\w*|пообща\\w*|переключ\\w*|переда\\w*|дай|дать|нужен|нужна|можно|хочу|хотел\\w*|хотелось)';

const RU_AVAILABILITY =
  '(?:подойд\\w*|подойти|приди|прийти|зайди|зайти|здесь|на\\s+связи|доступен|доступна|свободен|свободна|может|сможет)';

const STRONG_RU = [
  new RegExp(`\\b${RU_REQUEST_VERBS}\\b[\\s\\S]{0,80}\\b${ANTON}\\b`, 'u'),
  new RegExp(`\\b${ANTON}\\b[\\s\\S]{0,80}\\b${RU_AVAILABILITY}\\b`, 'u'),
  new RegExp(
    `\\b(?:хочу|хотел\\w*|хотелось|можно|дай|дайте)\\b[\\s\\S]{0,60}\\b(?:поговор\\w*|побеседов\\w*|пообща\\w*|связаться|соедин\\w*)\\b[\\s\\S]{0,40}\\b${ANTON}\\b`,
    'u',
  ),
];

const STRONG_EN = [
  new RegExp(
    `\\b(?:call|invite|summon|bring|get|connect|speak|talk|chat|ask)\\b[\\s\\S]{0,80}\\b${ANTON_EN}\\b`,
    'iu',
  ),
  new RegExp(
    `\\b${ANTON_EN}\\b[\\s\\S]{0,60}\\b(?:here|available|around|free|join|come|online)\\b`,
    'iu',
  ),
  new RegExp(
    `\\b(?:let\\s+me|can\\s+i|may\\s+i|i\\s+(?:want|would\\s+like|need))\\b[\\s\\S]{0,60}\\b(?:speak|talk|chat|connect)\\b[\\s\\S]{0,40}\\b${ANTON_EN}\\b`,
    'iu',
  ),
];

const EXPLICIT_RU = /^(?:позови|вызови|попроси)\s+(?:антона|антон|меркурова)\b/u;
const EXPLICIT_EN = /^(?:call|invite|summon)\s+(?:anton|merkurov)\b/iu;

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
    if (NEGATIVE_RU.test(normalized) && !/(?:позов|вызов|соедин|поговор|позвать|вызвать)/u.test(normalized)) {
      return { requested: false, confidence: 'high', matched: null };
    }

    return { requested: true, confidence: 'high', matched: ruMatch };
  }

  const enMatch = firstMatch(STRONG_EN, normalized);

  if (enMatch) {
    if (NEGATIVE_EN.test(normalized) && !/\b(?:speak|talk|chat)\s+(?:to|with)\s+anton\b/iu.test(normalized)) {
      return { requested: false, confidence: 'high', matched: null };
    }

    return { requested: true, confidence: 'high', matched: enMatch };
  }

  // A soft fallback: a short imperative that names Anton and asks for a
  // connection. This catches "Антон, можно?" without matching biographies.
  if (
    /\bантон\b/u.test(normalized) &&
    /(?:можно|сможешь|сможете|пожалуйста|плиз|срочно)/u.test(normalized) &&
    normalized.length <= 80
  ) {
    return { requested: true, confidence: 'medium', matched: 'soft-ru' };
  }

  if (
    /\banton\b/iu.test(normalized) &&
    /(?:please|can you|could you|now|urgent)/iu.test(normalized) &&
    normalized.length <= 90
  ) {
    return { requested: true, confidence: 'medium', matched: 'soft-en' };
  }

  return { requested: false, confidence: 'high', matched: null };
}
