/**
 * Editorial response safety helpers.
 *
 * A provider finish reason of `length` must never look like a complete answer.
 * The notice is explicit, and the next "continue" turn keeps the same evidence
 * scope so the model can continue instead of repeating itself.
 */

export function isTruncatedFinishReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && reason.toLowerCase() === 'length';
}

export function appendTruncationNotice(
  reply: string,
  language: 'ru' | 'en',
  finishReason?: string | null
): { reply: string; truncated: boolean } {
  const truncated = isTruncatedFinishReason(finishReason);
  if (!truncated) return { reply, truncated: false };

  const notice =
    language === 'ru'
      ? '_Ответ оборван по лимиту генерации. Скажите «продолжай» — продолжу с этого места, без повтора уже сказанного._'
      : '_The response was truncated by the generation limit. Say “continue” and I will continue from here without repeating what was already delivered._';

  return {
    reply: `${reply.trimEnd()}\n\n${notice}`,
    truncated: true,
  };
}

export function editorialContinuationInstruction(
  language: 'ru' | 'en',
  isValidFollowUp: boolean
): string | null {
  if (!isValidFollowUp) return null;
  return language === 'ru'
    ? 'CONTINUATION: продолжи предыдущий ответ, не повторяя уже сказанное; используй только приложенные проверенные фрагменты.'
    : 'CONTINUATION: continue from the previous assistant message without repeating it; use only the attached verified evidence.';
}
