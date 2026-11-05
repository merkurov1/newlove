/**
 * Deterministic text comparison for the Memory Steward. No model call, no
 * external service. The result is a hint ("these two records look related"),
 * never proof of semantic equivalence.
 */

const STOP_WORDS = new Set([
  'и',
  'в',
  'во',
  'не',
  'на',
  'я',
  'с',
  'со',
  'а',
  'то',
  'все',
  'она',
  'так',
  'его',
  'но',
  'да',
  'ты',
  'к',
  'у',
  'же',
  'вы',
  'за',
  'бы',
  'по',
  'только',
  'ее',
  'мне',
  'было',
  'вот',
  'от',
  'меня',
  'еще',
  'нет',
  'о',
  'из',
  'ему',
  'теперь',
  'когда',
  'даже',
  'ну',
  'вдруг',
  'ли',
  'если',
  'уже',
  'или',
  'ни',
  'быть',
  'был',
  'него',
  'до',
  'вас',
  'нибудь',
  'опять',
  'уж',
  'вам',
  'ведь',
  'там',
  'потом',
  'себя',
  'ничего',
  'ей',
  'может',
  'они',
  'тут',
  'где',
  'есть',
  'надо',
  'ней',
  'для',
  'мы',
  'тебя',
  'их',
  'чем',
  'была',
  'сам',
  'чтоб',
  'без',
  'будто',
  'чего',
  'раз',
  'тоже',
  'себе',
  'под',
  'будет',
  'ж',
  'тогда',
  'кто',
  'этот',
  'того',
  'потому',
  'этого',
  'какой',
  'совсем',
  'ним',
  'здесь',
  'этом',
  'один',
  'почти',
  'мой',
  'тем',
  'чтобы',
  'нее',
  'сейчас',
  'были',
  'куда',
  'зачем',
  'всех',
  'никогда',
  'можно',
  'при',
  'наконец',
  'два',
  'об',
  'другой',
  'хоть',
  'после',
  'над',
  'больше',
  'тот',
  'через',
  'эти',
  'нас',
  'про',
  'всего',
  'них',
  'какая',
  'много',
  'разве',
  'три',
  'эту',
  'моя',
  'впрочем',
  'хорошо',
  'свою',
  'этой',
  'перед',
  'иногда',
  'лучше',
  'чуть',
  'том',
  'нельзя',
  'такой',
  'им',
  'более',
  'всегда',
  'конечно',
  'всю',
  'между',
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'this',
  'that',
  'these',
  'those',
  'i',
  'we',
  'you',
  'he',
  'she',
  'they',
  'my',
  'our',
  'your',
  'as',
  'at',
  'by',
  'from',
  'not',
  'no',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'about',
]);

export function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeForComparison(value)
    .split(' ')
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
    .map((token) => token.slice(0, 32));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/** Jaccard similarity of meaningful tokens (0..1). */
export function lexicalSimilarity(left: string, right: string): number {
  const a = unique(tokenize(left));
  const b = unique(tokenize(right));

  if (a.length === 0 || b.length === 0) {
    if (normalizeForComparison(left) === normalizeForComparison(right)) return 1;
    return 0;
  }

  const setB = new Set(b);
  let intersection = 0;
  for (const token of a) if (setB.has(token)) intersection += 1;

  return intersection / (a.length + b.length - intersection);
}

function trigrams(value: string): Set<string> {
  const normalized = `  ${normalizeForComparison(value)}  `;
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 2; index += 1) {
    result.add(normalized.slice(index, index + 3));
  }
  return result;
}

/** Character trigram Dice coefficient, robust to word-form changes. */
export function trigramSimilarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;

  return (2 * intersection) / (a.size + b.size);
}

export type TextRelation = {
  score: number;
  duplicate: boolean;
  related: boolean;
  contradiction: boolean;
  reasons: string[];
};

const NEGATION = /(?:^|\s)(не|нет|never|not|no|без)\s+/i;

function numbersIn(value: string): string[] {
  return normalizeForComparison(value).match(/\b\d+(?:[.,]\d+)?\b/g) || [];
}

/**
 * Detects only *obvious* contradictions: the same subject with opposite
 * negation or different explicit numbers. It deliberately does not try to be a
 * semantic judge; ambiguous cases become review candidates.
 */
export function compareMemoryTexts(
  left: { title: string; content: string },
  right: { title: string; content: string }
): TextRelation {
  const leftText = `${left.title} ${left.content}`;
  const rightText = `${right.title} ${right.content}`;
  const lexical = lexicalSimilarity(leftText, rightText);
  const trigram = trigramSimilarity(leftText, rightText);
  const score = Math.max(lexical, trigram * 0.9);
  const reasons: string[] = [];

  const duplicate = score >= 0.86;
  if (duplicate) reasons.push('almost identical wording');

  const leftNegated = NEGATION.test(leftText);
  const rightNegated = NEGATION.test(rightText);
  const numbersLeft = numbersIn(leftText).sort();
  const numbersRight = numbersIn(rightText).sort();
  const numbersDiffer =
    numbersLeft.length > 0 &&
    numbersRight.length > 0 &&
    numbersLeft.join(',') !== numbersRight.join(',');

  const contradiction =
    score >= 0.55 && ((leftNegated !== rightNegated && score >= 0.62) || numbersDiffer);

  if (contradiction) {
    reasons.push(
      numbersDiffer ? 'the same topic has different explicit numbers' : 'opposite negation'
    );
  }

  return {
    score,
    duplicate,
    related: score >= 0.55,
    contradiction,
    reasons,
  };
}

/** Best match from a list, using title + content. */
export function bestMatch<T extends { id: string; title: string; content: string }>(
  target: { title: string; content: string },
  candidates: T[]
): { record: T; relation: TextRelation } | null {
  let best: { record: T; relation: TextRelation } | null = null;

  for (const candidate of candidates) {
    const relation = compareMemoryTexts(target, candidate);
    if (!best || relation.score > best.relation.score) best = { record: candidate, relation };
  }

  return best;
}

/**
 * True when the new text clearly extends the old one (the old meaningful tokens
 * are almost all present and the new text adds more). This is a deterministic
 * hint that the owner is refining an existing record, not starting an
 * unrelated one.
 */
export function isRefinementOf(oldValue: string, newValue: string): boolean {
  const oldTokens = unique(tokenize(oldValue));
  const newTokens = new Set(tokenize(newValue));

  if (oldTokens.length < 3 || newTokens.size <= oldTokens.length) return false;

  const covered = oldTokens.filter((token) => newTokens.has(token)).length;
  return covered / oldTokens.length >= 0.85;
}
