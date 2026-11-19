/**
 * Deterministic, side-effect-free parser for memory commands.
 *
 * Only an explicit command at the start of the message mutates memory. An
 * ordinary question that merely contains the word "remember" is answered by
 * the model and never writes a record by accident.
 */

export type PersonalAssistantMemoryCommand =
  | { kind: 'remember'; content: string }
  | { kind: 'update'; content: string }
  | { kind: 'forget'; query: string | null }
  | { kind: 'disable' }
  | { kind: 'enable' }
  | { kind: 'list' }
  | { kind: 'privacy' };

function cleanContent(value: string | undefined): string {
  return String(value || '')
    .replace(/^[\s:—–\-]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

const REMEMBER_PATTERNS = [
  /^запомни(?:\s*,)?(?:\s+что)?\s*(.+)$/i,
  /^remember(?:\s*,)?(?:\s+that)?\s*(.+)$/i,
  /^recuerda(?:\s*,)?(?:\s+que)?\s*(.+)$/i,
  /^merke\s+dir(?:\s*,)?(?:\s+dass)?\s*(.+)$/i,
  /^souviens[- ]toi(?:\s*,)?(?:\s+que)?\s*(.+)$/i,
];

const UPDATE_PATTERNS = [
  /^обнови(?:\s+)?(?:память|запомненное)(?:\s*[:—-])?\s*(.+)$/i,
  /^update(?:\s+)?memory(?:\s*[:—-])?\s*(.+)$/i,
  /^actualiza(?:\s+)?(?:la\s+)?memoria(?:\s*[:—-])?\s*(.+)$/i,
  /^aktualisiere(?:\s+)?(?:das\s+)?gedächtnis(?:\s*[:—-])?\s*(.+)$/i,
  /^mets?\s+à\s+jour(?:\s+la\s+)?mémoire(?:\s*[:—-])?\s*(.+)$/i,
];

const FORGET_PATTERNS = [
  /^забудь(?:\s+(?:что|об|о|это))?\s*(.*)$/i,
  /^forget(?:\s+(?:that|about|this))?\s*(.*)$/i,
  /^olvida(?:\s+(?:que|sobre|esto))?\s*(.*)$/i,
  /^vergiss(?:\s+(?:dass|das|dies))?\s*(.*)$/i,
  /^oublie(?:\s+(?:que|ceci|ça))?\s*(.*)$/i,
];

const DISABLE_PATTERNS = [
  /^(?:отключи|выключи|приостанови)\s+(?:свою\s+)?память[\s.!?]*$/i,
  /^(?:disable|turn\s+off|pause)\s+(?:your\s+)?memory[\s.!?]*$/i,
  /^(?:desactiva|apaga)\s+(?:tu\s+)?memoria[\s.!?]*$/i,
  /^(?:deaktiviere|schalte)\s+(?:dein\s+)?gedächtnis(?:\s+aus)?[\s.!?]*$/i,
  /^(?:désactive|désactiver)\s+(?:ta\s+|la\s+)?mémoire[\s.!?]*$/i,
];

const ENABLE_PATTERNS = [
  /^(?:включи|верни)\s+(?:свою\s+)?память[\s.!?]*$/i,
  /^(?:enable|turn\s+on|resume)\s+(?:your\s+)?memory[\s.!?]*$/i,
  /^(?:activa|enciende)\s+(?:tu\s+)?memoria[\s.!?]*$/i,
  /^(?:aktiviere|schalte)\s+(?:dein\s+)?gedächtnis(?:\s+ein)?[\s.!?]*$/i,
  /^(?:active|réactive)\s+(?:ta\s+|la\s+)?mémoire[\s.!?]*$/i,
];

const LIST_PATTERNS = [
  /^(?:что\s+ты\s+помнишь|покажи\s+(?:свою\s+)?память|что\s+в\s+памяти)[\s.!?]*$/i,
  /^(?:what\s+do\s+you\s+remember|show\s+(?:your\s+)?memory|what\s+is\s+in\s+memory)[\s.!?]*$/i,
  /^(?:qué\s+recuerdas|qué\s+hay\s+en\s+(?:tu\s+)?memoria)[\s.!?]*$/i,
  /^(?:was\s+erinnerst\s+du\s+dich|was\s+ist\s+im\s+gedächtnis)[\s.!?]*$/i,
  /^(?:qu['’]?est-ce\s+que\s+tu\s+te\s+souviens|montre\s+(?:ta\s+)?mémoire)[\s.!?]*$/i,
];

const PRIVACY_PATTERNS = [
  /^(?:приватность|конфиденциальность|что\s+ты\s+знаешь\s+обо\s+мне|как\s+хранится\s+(?:моя\s+)?память)[\s.!?]*$/i,
  /^(?:privacy|confidentiality|what\s+do\s+you\s+know\s+about\s+me)[\s.!?]*$/i,
  /^(?:privacidad|confidencialidad|qué\s+sabes\s+de\s+mí)[\s.!?]*$/i,
  /^(?:datenschutz|was\s+weißt\s+du\s+über\s+mich)[\s.!?]*$/i,
  /^(?:confidentialité|que\s+sais-tu\s+de\s+moi)[\s.!?]*$/i,
];

export function parsePersonalAssistantMemoryCommand(
  text: string
): PersonalAssistantMemoryCommand | null {
  const value = String(text || '').trim();
  if (!value) return null;

  if (firstMatch(value, PRIVACY_PATTERNS)) return { kind: 'privacy' };
  if (firstMatch(value, LIST_PATTERNS)) return { kind: 'list' };
  if (firstMatch(value, DISABLE_PATTERNS)) return { kind: 'disable' };
  if (firstMatch(value, ENABLE_PATTERNS)) return { kind: 'enable' };

  const remember = firstMatch(value, REMEMBER_PATTERNS);
  if (remember) {
    const content = cleanContent(remember[1]);
    return content ? { kind: 'remember', content } : null;
  }

  const update = firstMatch(value, UPDATE_PATTERNS);
  if (update) {
    const content = cleanContent(update[1]);
    return content ? { kind: 'update', content } : null;
  }

  const forget = firstMatch(value, FORGET_PATTERNS);
  if (forget) {
    const query = cleanContent(forget[1]);
    return { kind: 'forget', query: query || null };
  }

  return null;
}
