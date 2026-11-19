/**
 * Small, deterministic language hint for user-facing system messages.
 *
 * The model is instructed to answer in the language of the latest user
 * message, so this helper is not a whitelist. It only localises short
 * operational replies and gives the model an explicit latest-language hint.
 * Unrecognised languages fall back to English while the model still handles
 * the actual reply.
 */

export type AssistantLanguage = 'ru' | 'en' | 'es' | 'fr' | 'de' | 'und';

const CYRILLIC = /[\u0400-\u04FF]/;

const LATIN_STOPWORDS: Record<Exclude<AssistantLanguage, 'ru' | 'und'>, RegExp> = {
  en: /\b(?:the|and|you|your|what|how|why|please|thanks|hello|remember|forget|memory|privacy|today|news)\b/i,
  es: /\b(?:el|la|los|las|que|qué|cómo|como|por|para|gracias|hola|recuerda|olvida|memoria|privacidad|hoy|noticias)\b/i,
  fr: /\b(?:le|la|les|des|que|qué|comment|pour|merci|bonjour|souviens|oublie|mémoire|confidentialité|aujourd|nouvelles)\b/i,
  de: /\b(?:der|die|das|und|wie|was|warum|bitte|danke|hallo|erinnere|vergiss|gedächtnis|datenschutz|heute|nachrichten)\b/i,
};

export function detectAssistantLanguage(text: string): AssistantLanguage {
  const value = String(text || '').trim();
  if (!value) return 'und';

  if (CYRILLIC.test(value)) return 'ru';

  const scores: Array<{ language: Exclude<AssistantLanguage, 'ru' | 'und'>; matches: number }> = [];
  const words = value.toLowerCase().match(/[a-zà-ÿœæß]+/gi) || [];

  for (const language of ['en', 'es', 'fr', 'de'] as const) {
    const pattern = LATIN_STOPWORDS[language];
    const matches = words.filter((word) => pattern.test(word)).length;
    scores.push({ language, matches });
  }

  scores.sort((a, b) => b.matches - a.matches);

  if (scores[0] && scores[0].matches > 0 && scores[0].matches > (scores[1]?.matches ?? 0)) {
    return scores[0].language;
  }

  return 'en';
}

const ERROR_TEXT: Record<Exclude<AssistantLanguage, 'und'>, string> = {
  ru: 'Не удалось получить ответ. Попробуйте ещё раз через минуту.',
  en: 'I could not get an answer just now. Please try again in a minute.',
  es: 'No pude obtener una respuesta ahora. Inténtalo de nuevo en un minuto.',
  fr: 'Je n’ai pas pu obtenir de réponse pour le moment. Réessayez dans une minute.',
  de: 'Ich konnte gerade keine Antwort erhalten. Bitte versuchen Sie es in einer Minute erneut.',
};

export function personalAssistantErrorText(language: string): string {
  const normalized = (language as AssistantLanguage) || 'und';
  if (normalized in ERROR_TEXT) {
    return ERROR_TEXT[normalized as Exclude<AssistantLanguage, 'und'>];
  }

  return ERROR_TEXT.en;
}
