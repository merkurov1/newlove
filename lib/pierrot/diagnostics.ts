/**
 * Owner-facing explanation of the previous answer. This module is pure and
 * only formats an already sanitized operational trace; it never receives
 * prompts, retrieved passages, API keys or raw provider payloads.
 */

export type PierrotAnswerTrace = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sourceStatus(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const parts = ['brain', 'media', 'web']
    .map((key) => {
      const state = text(record[key]);
      return state ? `${key}: ${state}` : null;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : null;
}

export function formatPierrotAnswerTrace(
  trace: PierrotAnswerTrace | null,
  language: 'ru' | 'en' = 'ru'
): string {
  if (!trace) {
    return language === 'ru'
      ? 'У меня нет сохранённого следа предыдущего ответа в этом диалоге. Я не буду придумывать, какой контекст использовался.'
      : 'I have no stored trace for the previous answer in this conversation. I will not invent which context was used.';
  }

  const provider = text(trace.provider);
  const model = text(trace.model);
  const deterministic = trace.deterministic === true;
  const tool = text(trace.tool);
  const operation = text(trace.operation);
  const webRequested = trace.web_requested === true;
  const webReason = text(trace.web_reason);
  const webOutcome = text(trace.web_outcome);
  const webSources = number(trace.web_source_count);
  const answerSources = text(trace.answer_sources);
  const statuses = sourceStatus(trace.source_status);
  const memoryStatus = text(trace.memory_status);
  const projectCommand = text(trace.project_command);
  const operationLog =
    trace.operation_log && typeof trace.operation_log === 'object'
      ? (trace.operation_log as Record<string, unknown>)
      : null;

  const lines: string[] = [];

  if (language === 'ru') {
    lines.push('Вот что использовалось для предыдущего ответа.');
    lines.push(
      deterministic
        ? 'Ответ был детерминированным: его собрал код Pierrot, а не языковая модель.'
        : `Ответ сгенерировала модель${provider ? ` ${provider}` : ''}${model ? ` (${model})` : ''}.`
    );
    if (operation || tool) {
      lines.push(`Маршрут: ${operation || '—'}${tool ? ` · инструмент: ${tool}` : ''}.`);
    }
    lines.push(
      webRequested
        ? `Веб-поиск запускался${webReason ? ` (причина: ${webReason})` : ''}${webOutcome ? `, результат: ${webOutcome}` : ''}${
            webSources !== null ? `, источников: ${webSources}` : ''
          }.`
        : 'Веб-поиск не запускался. Поисковые источники к ответу не добавлялись.'
    );
    if (answerSources) lines.push(`Источники ответа: ${answerSources}.`);
    if (statuses) lines.push(`Статусы источников: ${statuses}.`);
    if (memoryStatus) lines.push(`Состояние памяти: ${memoryStatus}.`);
    if (projectCommand) lines.push(`Команда проекта: ${projectCommand}.`);
    if (operationLog) {
      const result = text(operationLog.result);
      const objectId = text(operationLog.object_id);
      lines.push(
        `Операция: ${text(operationLog.intent) || '—'}${objectId ? ` · объект ${objectId.slice(0, 8)}` : ''}${result ? ` · результат: ${result}` : ''}.`
      );
    }
    lines.push('Полные промпты, ключи и содержимое закрытых источников не раскрываю.');
  } else {
    lines.push('Here is what the previous answer used.');
    lines.push(
      deterministic
        ? 'The answer was deterministic: Pierrot code produced it, not a language model.'
        : `A language model generated it${provider ? ` (${provider})` : ''}${model ? ` · ${model}` : ''}.`
    );
    if (operation || tool) {
      lines.push(`Route: ${operation || '—'}${tool ? ` · tool: ${tool}` : ''}.`);
    }
    lines.push(
      webRequested
        ? `Web search ran${webReason ? ` (reason: ${webReason})` : ''}${webOutcome ? `, outcome: ${webOutcome}` : ''}${
            webSources !== null ? `, sources: ${webSources}` : ''
          }.`
        : 'Web search did not run. No search sources were attached.'
    );
    if (answerSources) lines.push(`Answer sources: ${answerSources}.`);
    if (statuses) lines.push(`Source status: ${statuses}.`);
    if (memoryStatus) lines.push(`Memory status: ${memoryStatus}.`);
    if (projectCommand) lines.push(`Project command: ${projectCommand}.`);
    lines.push('I do not expose full prompts, keys or private source contents.');
  }

  return lines.join('\n');
}
