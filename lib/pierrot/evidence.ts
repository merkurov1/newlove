/**
 * Deterministic evidence guard.
 *
 * This module does not call a model. It compares what the answer claims with
 * what the retrieval layer actually returned and enforces the minimum honesty
 * contract: no invented URLs, no "found sources" when the source was empty or
 * unavailable, and an explicit limitation when a requested source failed.
 */

export type SourceStatus =
  | 'success'
  | 'empty'
  | 'unavailable'
  | 'timeout'
  | 'error'
  | 'permission_denied'
  | 'partial'
  | 'not_requested';

export type EvidenceSourceStatuses = {
  brain: SourceStatus;
  media: SourceStatus;
  web: SourceStatus;
};

export type EvidenceRequestedSources = {
  brain: boolean;
  media: boolean;
  web: boolean;
};

export type EvidenceGuardResult = {
  reply: string;
  violations: string[];
  changed: boolean;
};

export type EvidenceLanguage = 'ru' | 'en';

function isTimeoutCode(code?: string | null): boolean {
  return code === 'timeout' || code === 'embedding_timeout';
}

export function brainStatusFromOutcome(
  outcome: string | null | undefined,
  code?: string | null
): SourceStatus {
  if (outcome === 'relevant_results') return 'success';
  if (outcome === 'no_match' || outcome === 'weak_match') return 'empty';
  if (outcome === 'disabled') return 'unavailable';
  if (outcome === 'partial_results') return 'partial';
  if (outcome === 'unavailable') {
    if (isTimeoutCode(code)) return 'timeout';
    if (code === 'unauthorized_scope') return 'permission_denied';
    if (code === 'database_unavailable' || code === 'missing_configuration') return 'unavailable';
    return 'error';
  }
  return 'unavailable';
}

export function mediaStatusFromOutcome(
  outcome: string | null | undefined,
  code?: string | null
): SourceStatus {
  return brainStatusFromOutcome(outcome, code);
}

export function webStatusFromResult(
  result: { outcome: string; code?: string | null } | null,
  requested: boolean
): SourceStatus {
  if (!requested) return 'not_requested';
  if (!result) return 'unavailable';
  if (result.outcome === 'relevant_results') return 'success';
  if (result.outcome === 'no_results') return 'empty';
  if (isTimeoutCode(result.code)) return 'timeout';
  if (result.code === 'disabled' || result.code === 'missing_api_key') return 'unavailable';
  if (result.code === 'http_error' || result.code === 'invalid_response') return 'error';
  return 'unavailable';
}

export function buildSourceStatuses(input: {
  brain?: { outcome?: string | null; code?: string | null } | null;
  media?: { outcome?: string | null; code?: string | null } | null;
  web?: { outcome: string; code?: string | null } | null;
  requested: EvidenceRequestedSources;
}): EvidenceSourceStatuses {
  return {
    brain: input.requested.brain
      ? brainStatusFromOutcome(input.brain?.outcome, input.brain?.code)
      : 'not_requested',
    media: input.requested.media
      ? mediaStatusFromOutcome(input.media?.outcome, input.media?.code)
      : 'not_requested',
    web: webStatusFromResult(input.web ?? null, input.requested.web),
  };
}

function statusCopy(
  status: SourceStatus,
  source: 'brain' | 'media' | 'web',
  language: EvidenceLanguage
): string {
  if (language === 'en') {
    if (source === 'brain') {
      if (status === 'empty')
        return 'The Brain search completed, but no relevant material was found.';
      if (status === 'timeout')
        return 'The Brain search did not finish in time. This does not mean the material is absent from the archive.';
      if (status === 'permission_denied')
        return 'This Brain scope is not available to the current account.';
      if (status === 'partial')
        return 'Only part of the Brain search completed, so the evidence may be incomplete.';
      if (status === 'error')
        return 'The Brain search failed technically; this is not evidence that the material is absent.';
      return 'Brain is currently unavailable, so this answer is not grounded in your archive.';
    }
    if (source === 'media') {
      if (status === 'empty') return 'No Media Archive publication matched this request.';
      if (status === 'permission_denied')
        return 'This part of the Media Archive is not available to the current account.';
      if (status === 'partial')
        return 'Only part of the Media Archive search completed, so the results may be incomplete.';
      if (status === 'timeout')
        return 'The Media Archive search timed out; no absence of coverage is implied.';
      if (status === 'error')
        return 'The Media Archive search failed technically; no absence of coverage is implied.';
      return 'The Media Archive is currently unavailable, so publications and links are unverified.';
    }
    if (status === 'empty') return 'The external web search returned no verified results.';
    if (status === 'timeout')
      return 'The external web search timed out, so external sources are unverified.';
    return 'The external web search is unavailable, so external publications and links are unverified.';
  }

  if (source === 'brain') {
    if (status === 'empty') return 'Поиск по Brain завершён, но подходящих материалов не найдено.';
    if (status === 'timeout')
      return 'Поиск в Brain не завершился вовремя. Это не означает, что материалов в архиве нет.';
    if (status === 'permission_denied')
      return 'Этот раздел Brain недоступен для текущего аккаунта; закрытые документы не раскрываются.';
    if (status === 'partial')
      return 'Поиск по Brain завершился частично, поэтому доказательства могут быть неполными.';
    if (status === 'error')
      return 'Поиск по Brain завершился технической ошибкой; это не означает, что материалов нет.';
    return 'Сейчас не удалось подключиться к Brain, поэтому ответ не опирается на твой архив.';
  }
  if (source === 'media') {
    if (status === 'empty') return 'Поиск по Media Archive завершён, но публикаций не найдено.';
    if (status === 'permission_denied')
      return 'Этот раздел Media Archive недоступен для текущего аккаунта.';
    if (status === 'partial')
      return 'Поиск по Media Archive завершился частично, поэтому результаты могут быть неполными.';
    if (status === 'timeout')
      return 'Поиск по Media Archive не завершился вовремя; это не означает, что публикаций нет.';
    if (status === 'error')
      return 'Поиск по Media Archive завершился технической ошибкой; это не означает, что публикаций нет.';
    return 'Media Archive сейчас недоступен, поэтому публикации и ссылки не проверены.';
  }
  if (status === 'empty') return 'Внешний поиск не нашёл подтверждённых результатов.';
  if (status === 'timeout')
    return 'Внешний поиск не успел завершиться, поэтому внешние источники не проверены.';
  return 'Внешний поиск недоступен, поэтому внешние публикации и ссылки не проверены.';
}

export function buildEvidenceDisclosure(
  statuses: EvidenceSourceStatuses,
  requested: EvidenceRequestedSources,
  language: EvidenceLanguage
): string | null {
  const lines: string[] = [];

  if (requested.brain && statuses.brain !== 'success' && statuses.brain !== 'not_requested') {
    lines.push(statusCopy(statuses.brain, 'brain', language));
  }

  if (requested.media && statuses.media !== 'success' && statuses.media !== 'not_requested') {
    lines.push(statusCopy(statuses.media, 'media', language));
  }

  if (requested.web && statuses.web !== 'success' && statuses.web !== 'not_requested') {
    lines.push(statusCopy(statuses.web, 'web', language));
  }

  if (lines.length === 0) return null;

  return lines.join(' ');
}

const NEGATION =
  /(не\s+наш|не\s+удалось|недоступ|нет\s+доступа|не\s+могу\s+подтверд|не\s+провер|not\s+found|unavailable|no\s+access|could\s+not|did\s+not\s+find|not\s+verified)/i;

const WEB_FOUND_CLAIM =
  /(наш[её]л|нашл[аи]|обнаруж|вот\s+(?:публикац|источник|список|ссылки)|ниже\s+(?:представлен|список|публикац)|according\s+to|i\s+found|sources\s*:|found\s+(?:the\s+following|these)|публикации\s+за|упоминания\s+в\s+сми|цитаты\s+в\s+сми)/i;

const BRAIN_CLAIM =
  /(в\s+твоих\s+(?:текстах|записях|материалах)|в\s+brain|согласно\s+твоим|ты\s+писал|ты\s+говорил|твои\s+записи|in\s+your\s+(?:texts|writing|archive)|you\s+wrote|you\s+said)/i;

const MEDIA_CLAIM =
  /(в\s+медиа|media\s+archive|публикации\s+в\s+сми|в\s+прессе|media\s+publications|press\s+coverage)/i;

function normalizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function collectAllowedExternalUrls(urls: Array<string | null | undefined>): Set<string> {
  const allowed = new Set<string>();

  for (const raw of urls) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const normalized = normalizeUrl(raw.trim());
    if (normalized) allowed.add(normalized);
  }

  return allowed;
}

function isAllowedUrl(value: string, allowed: Set<string>): boolean {
  const normalized = normalizeUrl(value);
  if (!normalized) return false;
  if (allowed.has(normalized)) return true;

  // Allow the same host+path even when the model added/stripped a trailing
  // slash or a harmless query parameter.
  try {
    const url = new URL(normalized);
    for (const candidate of allowed) {
      const allowedUrl = new URL(candidate);
      if (url.hostname === allowedUrl.hostname && url.pathname === allowedUrl.pathname) return true;
    }
  } catch {
    return false;
  }

  return false;
}

function stripUnknownExternalLinks(
  reply: string,
  allowed: Set<string>,
  language: EvidenceLanguage
): { reply: string; stripped: number } {
  let stripped = 0;

  const withoutMarkdown = reply.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (match, label: string, url: string) => {
      if (isAllowedUrl(url, allowed)) return match;
      stripped += 1;
      return label;
    }
  );

  const withoutBare = withoutMarkdown.replace(/https?:\/\/[^\s<>)"']+/g, (url) => {
    const cleaned = url.replace(/[.,;:!?]+$/g, '');
    if (isAllowedUrl(cleaned, allowed)) return url;
    stripped += 1;
    return language === 'en' ? '[link unavailable]' : '[ссылка недоступна]';
  });

  return { reply: withoutBare, stripped };
}

function removeClaimSentences(reply: string, pattern: RegExp): { reply: string; removed: number } {
  let removed = 0;
  const lines = reply.split('\n').filter((line) => {
    if (!pattern.test(line)) return true;
    if (NEGATION.test(line)) return true;
    removed += 1;
    return false;
  });

  return {
    reply: lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    removed,
  };
}

function hasWebClaim(reply: string): boolean {
  if (!WEB_FOUND_CLAIM.test(reply)) return false;
  if (
    BRAIN_CLAIM.test(reply) &&
    !/(сми|публикац|press|media|web|интернет|according|sources|канал)/i.test(reply)
  ) {
    return false;
  }

  return /(сми|публикац|источник|ссылк|канал|press|media|web|интернет|according|sources|цитат)/i.test(
    reply
  );
}

function safeMessage(kind: 'web' | 'brain' | 'media', language: EvidenceLanguage): string {
  if (language === 'en') {
    if (kind === 'brain') {
      return 'Brain did not return confirmed context for this request, so I will not present your materials as established fact. I can answer a general question or retry when retrieval is available.';
    }
    if (kind === 'media') {
      return 'The Media Archive did not return usable publications, so I cannot confirm outlets, dates or links. I will not invent them.';
    }
    return 'The external web search is unavailable, so I cannot confirm external publications, quotes or links. I will not present assumptions as search results.';
  }

  if (kind === 'brain') {
    return 'Brain не вернул подтверждённый контекст по этому запросу, поэтому я не буду пересказывать твои материалы как установленный факт. Могу ответить на общий вопрос или повторить попытку позже.';
  }
  if (kind === 'media') {
    return 'Media Archive не вернул пригодных публикаций, поэтому я не могу подтвердить издания, даты и ссылки. Я не буду их выдумывать.';
  }
  return 'Внешний поиск сейчас недоступен, поэтому я не могу подтвердить внешние публикации, цитаты или ссылки. Я не буду выдавать предположения за результаты поиска.';
}

/**
 * Final deterministic pass before persistence/sending. It is intentionally
 * conservative: when a source failed, only a clear disclosure is required; a
 * response that explicitly says "not found" is preserved.
 */
export function guardAnswerEvidence(input: {
  reply: string;
  statuses: EvidenceSourceStatuses;
  requested: EvidenceRequestedSources;
  allowedExternalUrls?: Array<string | null | undefined>;
  language?: EvidenceLanguage;
  intent?: string;
}): EvidenceGuardResult {
  const language = input.language === 'en' ? 'en' : 'ru';
  const allowed = collectAllowedExternalUrls(input.allowedExternalUrls ?? []);
  const violations: string[] = [];
  const originalReply = (input.reply || '').trim();
  const originalNegated = NEGATION.test(originalReply);
  let reply = originalReply;

  if (!reply) return { reply, violations, changed: false };

  const links = stripUnknownExternalLinks(reply, allowed, language);
  reply = links.reply;
  if (links.stripped > 0) violations.push('unverified_external_url_removed');

  const webFailed = input.requested.web && input.statuses.web !== 'success';
  const brainFailed = input.requested.brain && input.statuses.brain !== 'success';
  const mediaFailed = input.requested.media && input.statuses.media !== 'success';
  const sourceSuccess =
    input.statuses.web === 'success' ||
    input.statuses.media === 'success' ||
    input.statuses.brain === 'success';

  if (webFailed && !sourceSuccess && hasWebClaim(reply) && !originalNegated) {
    violations.push('web_claim_without_results');
    reply = safeMessage('web', language);
  } else if (
    webFailed &&
    input.statuses.media !== 'success' &&
    hasWebClaim(reply) &&
    !originalNegated
  ) {
    const removed = removeClaimSentences(reply, WEB_FOUND_CLAIM);
    reply = removed.reply;
    if (removed.removed > 0) violations.push('web_claim_sentences_removed');
    if (reply.length < 40) {
      reply = safeMessage('web', language);
    }
  }

  if (brainFailed && BRAIN_CLAIM.test(reply) && !originalNegated) {
    violations.push('brain_claim_without_context');
    reply = safeMessage('brain', language);
  }

  if (
    mediaFailed &&
    input.statuses.web !== 'success' &&
    MEDIA_CLAIM.test(reply) &&
    !originalNegated
  ) {
    violations.push('media_claim_without_results');
    reply = safeMessage('media', language);
  }

  if (violations.length === 0) {
    const externalIntent =
      input.intent === 'web_research' ||
      input.intent === 'media_mentions' ||
      input.intent === 'brain_web_research';
    const shouldDisclose =
      (input.requested.web && externalIntent) ||
      input.requested.media ||
      (input.requested.brain && input.intent !== 'general');

    const disclosure = shouldDisclose
      ? buildEvidenceDisclosure(input.statuses, input.requested, language)
      : null;

    if (disclosure && !originalNegated) {
      reply = `${reply}\n\n${disclosure}`.trim();
      violations.push('source_limitation_disclosed');
    }
  }

  return {
    reply,
    violations,
    changed: reply !== (input.reply || '').trim(),
  };
}
