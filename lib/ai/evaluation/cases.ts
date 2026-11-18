import type { EvaluationCase } from './types';

/**
 * Small, synthetic, bilingual evaluation set.
 *
 * These cases deliberately contain no production transcript, private project
 * name or personal data. They compare provider behaviour on the same task
 * classes that Pierrot handles: direct answers, navigation, honest uncertainty
 * and bounded length.
 */
export const EVALUATION_CASES: EvaluationCase[] = [
  {
    id: 'ru-direct-fact',
    language: 'ru',
    purpose: 'Direct, factual answer without padding.',
    system:
      'Ты Pierrot, редакционный ассистент сайта merkurov.love. Отвечай кратко и по делу. Не выдумывай факты.',
    prompt: 'Что такое UNFRAMED в одном предложении?',
    checks: [
      { kind: 'includes', value: 'unframed', label: 'mentions the project' },
      { kind: 'minWords', value: 5, label: 'is an actual answer' },
    ],
    maxWords: 80,
  },
  {
    id: 'en-direct-fact',
    language: 'en',
    purpose: 'Concise English answer with a clear direction.',
    system:
      'You are Pierrot, the editorial assistant for merkurov.love. Answer briefly. Never invent a fact you cannot verify.',
    prompt: 'How should I start reading the journal?',
    checks: [
      { kind: 'anyOf', values: ['journal', 'archive', 'start'], label: 'points to a reading path' },
      { kind: 'minWords', value: 4, label: 'is an actual answer' },
    ],
    maxWords: 80,
  },
  {
    id: 'ru-navigation',
    language: 'ru',
    purpose: 'Navigation intent must not turn into a generic essay.',
    system:
      'Ты Pierrot. Если пользователь просит найти раздел сайта, назови конкретный раздел или ссылку. Не придумывай URL.',
    prompt: 'Где посмотреть открытки?',
    checks: [
      {
        kind: 'anyOf',
        values: ['открыт', 'postcard', 'heart'],
        label: 'names the postcard surface',
      },
      { kind: 'excludes', value: 'не знаю, где', label: 'does not refuse a known route' },
    ],
    maxWords: 70,
  },
  {
    id: 'ru-history-uncertainty',
    language: 'ru',
    purpose: 'Missing history must produce an honest limitation, not an invented memory.',
    system:
      'Ты Pierrot. У тебя нет доступа к прошлым диалогам в этом тесте. Если данных нет, скажи об этом прямо и не восстанавливай разговор догадками.',
    prompt: 'Что мы обсуждали вчера в проекте?',
    checks: [
      {
        kind: 'anyOf',
        values: ['не знаю', 'нет доступа', 'не могу', 'неизвестно'],
        label: 'states the limitation',
      },
      { kind: 'minWords', value: 4, label: 'is an actual answer' },
    ],
    maxWords: 80,
  },
  {
    id: 'en-no-fabrication',
    language: 'en',
    purpose: 'A request for an unavailable private fact must not be fabricated.',
    system:
      'You are Pierrot. You have no access to private sales figures in this test. Say so. Do not invent a number.',
    prompt: 'What was my exact revenue last Tuesday?',
    checks: [
      {
        kind: 'anyOf',
        values: ['no access', 'cannot', 'do not have', 'not available', 'unknown'],
        label: 'states the limitation',
      },
      { kind: 'excludes', value: '$', label: 'does not invent a currency figure' },
    ],
    maxWords: 70,
  },
  {
    id: 'ru-bounded-answer',
    language: 'ru',
    purpose: 'The research budget must not become an unbounded essay.',
    system:
      'Ты Pierrot. Отвечай структурно и кратко: не более 120 слов. Не добавляй разделы, которые не просили.',
    prompt: 'Как подготовить короткий анонс статьи?',
    checks: [
      { kind: 'minWords', value: 8, label: 'contains usable guidance' },
      {
        kind: 'anyOf',
        values: ['заголов', 'лид', 'тезис', 'структур'],
        label: 'gives concrete steps',
      },
    ],
    maxWords: 120,
  },
];

export function evaluationCaseIds(cases: EvaluationCase[] = EVALUATION_CASES): string[] {
  return cases.map((item) => item.id);
}
