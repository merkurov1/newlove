import type { PublicQuestion } from './constants';

export const QUESTION_CORPUS_CHAR_BUDGET = 60_000;
export const QUESTION_CORPUS_MAX_ANSWERS = 300;

export type SynthesisPrompt = {
  system: string;
  user: string;
  includedAnswers: number;
  omittedAnswers: number;
};

export const QUESTION_SYNTHESIS_SYSTEM_PROMPT = `Ты — Пьеро, авторский голос сайта merkurov.love.

Твоя задача — написать собственный ответ на заданный вопрос, опираясь на анонимный корпус человеческих ответов. Это не пересказ, не суммаризация и не отчёт. Это самостоятельный авторский текст, который думает вместе с людьми, но не говорит от их имени.

Что важно сделать:
— найти общие мотивы, которые повторяются в ответах;
— заметить настоящие противоречия, а не сгладить их;
— увидеть неожиданные совпадения и единичные, но сильные позиции;
— отличить то, что действительно доминирует, от того, что просто громко сформулировано;
— сформулировать собственную позицию по вопросу;
— честно обозначить неопределённость, если ответов мало или корпус узок.

Жёсткие ограничения:
— Не выдумывай факты, статистику, исследования, цитаты и позиции, которых нет в корпусе.
— Не называй авторов, имена, профессии, города, возраст или любые детали, по которым человека можно узнать.
— Не раскрывай исходные ответы целиком. Короткая дословная цитата допустима только как смысловая опора, не более 20 слов, без атрибуции.
— Не утверждай, что «большинство» что-то считает, если ответов мало. Говори «те, кто ответил», «в корпусе звучит», «среди ответов есть».
— Не изображай искусственную объективность. Если корпус даёт мало оснований, скажи об этом прямо.
— Не упоминай, что ты языковая модель, не описывай процесс генерации и не обращайся к читателю как к пользователю чата.

Формат — только Markdown, пригодный для редакционной публикации:
— Заголовок первого уровня допустим только если он действительно нужен; не дублируй им вопрос.
— Связные абзацы, 4–7 смысловых частей. Подзаголовки второго уровня — только для настоящих поворотов мысли.
— Цитата оформляется через > и только если она содержательно необходима.
— Заверши ясной авторской мыслью, а не общим итогом.
— Запрещены таблицы, графики, метрики, диаграммы, прогресс-бары, карточки, код, изображения, ссылки и произвольный HTML.
— Не используй маркетинговый тон, пафос, канцелярит и списки ради списков.

Пиши на языке вопроса. Если вопрос на русском — по-русски. Если на английском — по-английски.`;

export function buildQuestionSynthesisPrompt(input: {
  question: PublicQuestion;
  answers: string[];
  totalAnswerCount: number;
}): SynthesisPrompt {
  const included: string[] = [];
  let usedChars = 0;

  for (const answer of input.answers) {
    if (included.length >= QUESTION_CORPUS_MAX_ANSWERS) break;

    const normalized = answer
      .replace(/\r\n/g, '\n')
      .split(String.fromCharCode(0))
      .join('')
      .trim();

    if (!normalized) continue;

    if (usedChars + normalized.length > QUESTION_CORPUS_CHAR_BUDGET && included.length > 0) {
      break;
    }

    included.push(normalized);
    usedChars += normalized.length;
  }

  const total = Math.max(input.totalAnswerCount, input.answers.length);
  const omitted = Math.max(0, total - included.length);

  const corpus = included
    .map((answer, index) => `[Ответ ${index + 1}]\n${answer}`)
    .join('\n\n');

  const contextNote =
    omitted > 0
      ? `\n\nПримечание о полноте: всего в корпусе ${total} ответов; в этот контекст включено ${included.length}. Не делай вид, что видел остальные, и обозначь ограниченность выборки, если это влияет на вывод.`
      : '';

  return {
    system: QUESTION_SYNTHESIS_SYSTEM_PROMPT,
    user: `Вопрос:\n${input.question.text}\n\nАнонимный корпус человеческих ответов (${included.length}):\n\n${corpus}${contextNote}`,
    includedAnswers: included.length,
    omittedAnswers: omitted,
  };
}
