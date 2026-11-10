/**
 * Shared, deterministic correction/recovery detection.
 *
 * This module is intentionally side-effect free and safe to use on both the
 * server and the client. It does not decide what the user wants; it only
 * distinguishes a new request from a correction, a repeat request, or a
 * request to recover the previous unresolved task.
 */

export type CorrectionSource = 'media' | 'brain' | 'web' | 'database' | null;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[^\p{L}\p{N}\s'"-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CORRECTION_PATTERNS: RegExp[] = [
  /(^|\s)(нет|не)\s+(ты\s+)?(все\s+|всё\s+)?(не\s+то|не\s+так|выдумал|выдумала|придумал|придумала)/i,
  /(^|\s)(нет,?\s+)?не\s+то/i,
  /(^|\s)не\s+так/i,
  /(^|\s)стоп/i,
  /(^|\s)я\s+(же\s+)?(просил|просила|имел\s+в\s+виду|имела\s+в\s+виду)/i,
  /(^|\s)я\s+имею\s+в\s+виду/i,
  /(^|\s)ты\s+(все\s+|всё\s+)?(выдумал|выдумала|придумал|придумала|не\s+то)/i,
  /(^|\s)(это\s+)?(не\s+то|неправильно|неверно),?\s+(я\s+)?(просил|имел|говорил)/i,
  /(^|\s)(сделай|выполни)\s+(то,?\s+)?что\s+(тебя\s+)?просят/i,
  /(^|\s)(сделай|выполни)\s+(то,?\s+)?о\s+чем\s+(я\s+)?просил/i,
  /(^|\s)(еще|ещё)\s+раз/i,
  /(^|\s)повтори/i,
  /(^|\s)перечитай\s+(мое|моё|мое сообщение|мой запрос|сообщение)/i,
  /(^|\s)прочитай\s+(мое|моё)\s+сообщение\s+(еще|ещё)?\s*раз/i,
  /(^|\s)не\s+надо\s+отвечать\s+на\s+другой\s+вопрос/i,
  /(^|\s)именно\s+по\s+базе/i,
  /(^|\s)по\s+базе\s+(медиа|media),?\s+а\s+не\s+(brain|мозг)/i,
  /(^|\s)that'?s\s+not\s+what\s+i\s+asked/i,
  /(^|\s)that\s+is\s+not\s+what\s+i\s+asked/i,
  /(^|\s)you\s+(made\s+(that|this)\s+up|invented\s+(that|this))/i,
  /(^|\s)do\s+what\s+i\s+asked/i,
  /(^|\s)read\s+my\s+(message|request)\s+again/i,
  /(^|\s)use\s+the\s+(database|archive|media\s+database),?\s+not\s+brain/i,
  /(^|\s)(again|one\s+more\s+time|try\s+again)/i,
  /(^|\s)repeat\s+(that|the\s+request)/i,
];

const REPEAT_PATTERNS: RegExp[] = [
  /(^|\s)(еще|ещё)\s+раз/i,
  /(^|\s)повтори/i,
  /(^|\s)(сделай|выполни)\s+(то,?\s+)?что\s+(тебя\s+)?просят/i,
  /(^|\s)перечитай\s+(мое|моё|мое сообщение|мой запрос)/i,
  /(^|\s)(again|one\s+more\s+time|try\s+again)/i,
  /(^|\s)do\s+what\s+i\s+asked/i,
  /(^|\s)read\s+my\s+(message|request)\s+again/i,
];

export function isCorrectionMessage(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  return CORRECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isRepeatRequest(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized) return false;
  return REPEAT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isContextRecoveryRequest(text: string): boolean {
  return isCorrectionMessage(text) || isRepeatRequest(text);
}

export function detectCorrectionSource(text: string): CorrectionSource {
  const normalized = normalize(text);

  if (
    /(по\s+базе\s+(медиа|media)|в\s+(базе\s+)?(медиа|media)|медиа\s+баз|media\s+(archive|database)|в\s+сми|по\s+сми|в\s+прессе)/i.test(
      normalized
    )
  ) {
    return 'media';
  }

  if (/(а\s+не\s+(brain|мозг)|not\s+brain)/i.test(normalized)) return 'brain';

  if (/(в\s+(интернете|сети|вебе)|web|online|search\s+the\s+web)/i.test(normalized)) {
    return 'web';
  }

  if (/(по\s+базе|в\s+базе|database|архив[еа]?)/i.test(normalized)) return 'database';

  return null;
}

/**
 * If the current message corrects the source only ("не Brain, а база медиа"),
 * returns the constrained source. Otherwise null.
 */
export function detectSourceCorrection(text: string): CorrectionSource {
  if (!isContextRecoveryRequest(text)) return null;
  return detectCorrectionSource(text);
}
