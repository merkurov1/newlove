export type ArtEngineModeCommand = 'enter' | 'exit';
export type ArtEngineModeLanguage = 'ru' | 'en';

const ENTER_PHRASES = new Set([
  'включи art engine',
  'включить art engine',
  'включи режим art engine',
  'включить режим art engine',
  'запусти art engine',
  'запустить art engine',
  'запусти режим art engine',
  'перейди в art engine',
  'перейти в art engine',
  'перейдем в art engine',
  'перейти в режим art engine',
  'перейдем в режим art engine',
  'пойдем в art engine',
  'пойдем в режим art engine',
  'давай в art engine',
  'открой art engine',
  'открыть art engine',
  'режим art engine',
  'art engine режим',
  'хочу создать изображение',
  'хочу сгенерировать изображение',
  'хочу создать картинку',
  'создай изображение',
  'создать изображение',
  'сгенерируй изображение',
  'сгенерировать изображение',
  'turn on art engine',
  'switch on art engine',
  'enable art engine',
  'activate art engine',
  'start art engine',
  'enter art engine',
  'open art engine',
  'switch to art engine',
  'go to art engine',
  'art engine mode',
  'art engine mode on',
  'i want to create an image',
  'i want to generate an image',
  'create an image',
  'generate an image',
]);

const EXIT_PHRASES = new Set([
  'вернуться в обычный чат',
  'вернуться к обычному чату',
  'вернемся в обычный чат',
  'вернемся к обычному чату',
  'перейти в обычный чат',
  'перейти к обычному чату',
  'перейдем в обычный чат',
  'перейдем к обычному чату',
  'выйти из art engine',
  'выход из art engine',
  'выключи art engine',
  'выключить art engine',
  'отключи art engine',
  'отключить art engine',
  'закрой art engine',
  'закрыть art engine',
  'обычный режим',
  'обычный чат',
  'вернуться в чат',
  'back to normal chat',
  'return to normal chat',
  'back to chat',
  'return to chat',
  'exit art engine',
  'leave art engine',
  'turn off art engine',
  'disable art engine',
  'stop art engine',
  'normal mode',
  'normal chat',
]);

const POLITE_PREFIX = /^(pierrot|пьеро|please|пожалуйста)\s+/;
const POLITE_SUFFIX = /\s+(please|пожалуйста)$/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect an explicit Art Engine mode command. Matching is deliberately exact:
 * ordinary conversation about art, images or the Art Engine must not switch the
 * interface, so a bare mention is never enough.
 */
export function detectArtEngineModeCommand(text: string): ArtEngineModeCommand | null {
  const normalized = normalize(text);

  if (!normalized) return null;

  const withoutPoliteness = normalized.replace(POLITE_PREFIX, '').replace(POLITE_SUFFIX, '').trim();

  const candidates =
    withoutPoliteness === normalized ? [normalized] : [normalized, withoutPoliteness];

  if (candidates.some((candidate) => EXIT_PHRASES.has(candidate))) return 'exit';
  if (candidates.some((candidate) => ENTER_PHRASES.has(candidate))) return 'enter';

  return null;
}

export function isArtEngineExitCommand(text: string): boolean {
  return detectArtEngineModeCommand(text) === 'exit';
}

export function getArtEngineModeText(
  language: ArtEngineModeLanguage,
  command: ArtEngineModeCommand
): string {
  if (command === 'exit') {
    return language === 'ru'
      ? 'Обычный чат. Art Engine выключен.'
      : 'Back to normal chat. Art Engine is off.';
  }

  return language === 'ru'
    ? 'Art Engine включён. Вставьте ссылку на лот — карточка появится здесь. Чтобы вернуться, напишите «обычный режим».'
    : 'Art Engine is on. Paste a lot URL and the record will appear here. Write “normal mode” to return.';
}
