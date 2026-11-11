import { entityTypeLabel } from '@/lib/pierrot/entities/types';
import {
  formatTimelineTime,
  TIMELINE_EVIDENCE_LABELS_EN,
  TIMELINE_EVIDENCE_LABELS_RU,
  groupTimelineByDay,
} from './timeline';
import type {
  ContextHit,
  ContextQueryResult,
  EvidenceClass,
  TimelineEvent,
} from './types';

function evidenceLabel(evidenceClass: EvidenceClass, language: 'ru' | 'en'): string {
  return language === 'ru'
    ? TIMELINE_EVIDENCE_LABELS_RU[evidenceClass]
    : TIMELINE_EVIDENCE_LABELS_EN[evidenceClass];
}

function link(href: string | null, language: 'ru' | 'en'): string {
  if (!href) return '';
  return language === 'ru' ? ` [Открыть](${href})` : ` [Open](${href})`;
}

function describeEvent(
  event: TimelineEvent,
  timezone: string,
  language: 'ru' | 'en',
  includeEvidence = true
): string {
  const time = formatTimelineTime(event.occurredAt, timezone, language);
  const evidence = includeEvidence ? ` · ${evidenceLabel(event.evidenceClass, language)}` : '';
  const text = event.description || event.title;
  const short = text.length > 220 ? `${text.slice(0, 219).trimEnd()}…` : text;
  return `- ${time} — ${short}${evidence}${link(event.href, language)}`;
}

function describeHit(hit: ContextHit, language: 'ru' | 'en'): string {
  const date = hit.eventAt
    ? formatTimelineTime(hit.eventAt, 'UTC', language)
    : language === 'ru'
      ? 'без даты'
      : 'undated';
  const method =
    hit.retrievalMethod === 'exact_phrase'
      ? language === 'ru'
        ? 'точная фраза'
        : 'exact phrase'
      : hit.retrievalMethod;
  return `- ${date} · ${hit.excerpt || hit.title} · ${evidenceLabel(
    hit.evidenceClass,
    language
  )} · ${method}${link(hit.href, language)}`;
}

function projectHeading(result: ContextQueryResult, language: 'ru' | 'en'): string {
  const name = result.projectState?.projectName;
  if (!name) return '';
  return language === 'ru' ? `Проект «${name}»` : `Project “${name}”`;
}

function formatDaily(result: ContextQueryResult, language: 'ru' | 'en'): string {
  const daily = result.daily;
  if (!daily) return '';
  const ru = language === 'ru';
  const lines: string[] = [];
  const periodLabel = daily.period?.label || (ru ? 'весь доступный период' : 'all available');
  const tz = result.plan.timezoneKnown === false ? `${daily.timezone} (fallback)` : daily.timezone;

  lines.push(
    ru
      ? `Итоги: ${periodLabel} (${tz}). Найдено ${result.counts.messages} сообщений в ${result.counts.conversations} диалогах, ${result.counts.tasks} задач, ${result.counts.decisions} решений, ${result.counts.documents} документов.`
      : `Summary: ${periodLabel} (${tz}). Found ${result.counts.messages} messages in ${result.counts.conversations} conversations, ${result.counts.tasks} tasks, ${result.counts.decisions} decisions, ${result.counts.documents} documents.`
  );

  const section = (
    title: string,
    events: TimelineEvent[],
    empty: string,
    includeEvidence = true
  ) => {
    lines.push('', `### ${title}`);
    lines.push(
      events.length
        ? events
            .slice(0, 8)
            .map((event) => describeEvent(event, daily.timezone, language, includeEvidence))
            .join('\n')
        : `- ${empty}`
    );
  };

  section(
    ru ? 'Завершено (подтверждено)' : 'Completed (confirmed)',
    daily.completed,
    ru ? 'Подтверждённых завершений нет.' : 'No confirmed completions.'
  );
  section(
    ru ? 'Результаты и материалы' : 'Deliverables and materials',
    daily.deliverables,
    ru ? 'Подтверждённых результатов не найдено.' : 'No confirmed deliverables found.'
  );
  section(
    ru ? 'Решения' : 'Decisions',
    daily.decisions,
    ru ? 'Решений за период не зафиксировано.' : 'No decisions recorded for the period.'
  );
  section(
    ru ? 'В работе / намерения' : 'In progress / intentions',
    daily.intentions,
    ru ? 'Открытых намерений не найдено.' : 'No open intentions found.',
    false
  );
  section(
    ru ? 'Обсуждалось' : 'Discussed',
    daily.discussions,
    ru ? 'Содержательных обсуждений не найдено.' : 'No substantive discussions found.',
    false
  );

  if (daily.gaps.length > 0) {
    lines.push('', `### ${ru ? 'Ограничения' : 'Limitations'}`);
    for (const gap of daily.gaps.slice(0, 6)) lines.push(`- ${gap}`);
  }

  return lines.join('\n');
}

function formatProjectStatus(result: ContextQueryResult, language: 'ru' | 'en'): string {
  const state = result.projectState;
  if (!state) return '';
  const ru = language === 'ru';
  const lines: string[] = [];

  lines.push(
    ru
      ? `**${state.projectName} — ${state.status}**`
      : `**${state.projectName} — ${state.status}**`
  );
  lines.push(state.statusReason);

  lines.push('', `### ${ru ? 'Направления' : 'Workstreams'}`);
  if (state.workstreams.length === 0) {
    lines.push(`- ${ru ? 'Направления ещё не заведены.' : 'No workstreams recorded yet.'}`);
  } else {
    for (const stream of state.workstreams.slice(0, 12)) {
      const type = entityTypeLabel(stream.entityType)[language];
      const notes = stream.notes.length ? ` · ${stream.notes.join(' · ')}` : '';
      lines.push(
        `- ${type.toUpperCase()} «${stream.name}» — ${stream.status}; ${ru ? 'задач' : 'tasks'}: ${stream.openTasks} ${ru ? 'открыто' : 'open'}/${stream.completedTasks} ${ru ? 'завершено' : 'done'}, ${ru ? 'результатов' : 'deliverables'}: ${stream.deliverables}${notes}`
      );
    }
  }

  const section = (title: string, events: TimelineEvent[], empty: string) => {
    lines.push('', `### ${title}`);
    lines.push(
      events.length
        ? events
            .slice(0, 8)
            .map((event) => describeEvent(event, result.plan.timezone, language))
            .join('\n')
        : `- ${empty}`
    );
  };

  section(
    ru ? 'Завершено (подтверждено)' : 'Completed (confirmed)',
    state.completed,
    ru ? 'Подтверждённых завершений нет.' : 'No confirmed completions.'
  );
  section(
    ru ? 'Осталось / в работе' : 'Remaining / in progress',
    state.remaining,
    ru ? 'Открытых задач не зафиксировано.' : 'No open tasks recorded.'
  );
  section(
    ru ? 'Решения' : 'Decisions',
    state.decisions,
    ru ? 'Решений не зафиксировано.' : 'No decisions recorded.'
  );
  if (state.blocked.length > 0) {
    section(ru ? 'Блокировки' : 'Blockers', state.blocked, '');
  }
  if (state.gaps.length > 0) {
    lines.push('', `### ${ru ? 'Пробелы' : 'Gaps'}`);
    for (const gap of state.gaps.slice(0, 6)) lines.push(`- ${gap}`);
  }

  return lines.join('\n');
}

function formatProjectHistory(result: ContextQueryResult, language: 'ru' | 'en'): string {
  const ru = language === 'ru';
  const heading = projectHeading(result, language);
  const lines: string[] = [];

  const days = groupTimelineByDay(result.timeline, result.plan.timezone).filter((group) =>
    group.events.some(
      (event) =>
        event.type === 'message' ||
        event.type === 'decision' ||
        event.type === 'task' ||
        event.type === 'artifact' ||
        event.type === 'deliverable' ||
        event.type === 'project_event' ||
        event.type === 'status_change'
    )
  );

  lines.push(
    ru
      ? `История${heading ? ` · ${heading}` : ''} (${result.plan.timezone}).`
      : `History${heading ? ` · ${heading}` : ''} (${result.plan.timezone}).`
  );
  lines.push(
    ru
      ? `Найдено ${result.counts.messages} сообщений в ${result.counts.conversations} диалогах, ${result.counts.decisions} решений, ${result.counts.tasks} задач, ${result.counts.documents} документов.`
      : `Found ${result.counts.messages} messages in ${result.counts.conversations} conversations, ${result.counts.decisions} decisions, ${result.counts.tasks} tasks, ${result.counts.documents} documents.`
  );

  if (days.length === 0) {
    lines.push(
      '',
      ru
        ? 'Сохранённых событий по этому запросу не найдено. Я не буду реконструировать историю по догадкам.'
        : 'No saved events matched this request. I will not reconstruct history from guesses.'
    );
  }

  let remaining = 30;
  for (const day of days) {
    if (remaining <= 0) break;
    lines.push('', `### ${day.day}`);
    const events = day.events.slice(0, remaining);
    for (const event of events) {
      lines.push(describeEvent(event, result.plan.timezone, language));
      remaining -= 1;
      if (remaining <= 0) break;
    }
  }

  if (result.documents.length > 0) {
    lines.push('', `### ${ru ? 'Документы Brain' : 'Brain documents'}`);
    for (const document of result.documents.slice(0, 6)) {
      lines.push(
        `- **${document.title}** · ${document.sectionCount} ${ru ? 'разделов' : 'sections'}${
          document.headings.length
            ? `: ${document.headings.slice(0, 8).join('; ')}`
            : ''
        }`
      );
    }
  }

  if (result.gaps.length > 0) {
    lines.push('', `### ${ru ? 'Пробелы' : 'Gaps'}`);
    for (const gap of result.gaps.slice(0, 6)) lines.push(`- ${gap}`);
  }

  return lines.join('\n');
}

function formatConversationSearch(result: ContextQueryResult, language: 'ru' | 'en'): string {
  const ru = language === 'ru';
  const lines: string[] = [];
  const hits = result.hits.slice(0, 12);

  lines.push(
    ru
      ? `Нашёл ${hits.length} фрагментов в ${result.counts.conversations} диалогах${result.widenedFromProject ? ' (расширено за пределы проекта)' : ''}.`
      : `Found ${hits.length} fragments in ${result.counts.conversations} conversations${result.widenedFromProject ? ' (widened beyond the project)' : ''}.`
  );

  if (hits.length === 0) {
    lines.push(
      '',
      ru
        ? 'Совпадений не найдено. Я не буду подменять их общим ответом.'
        : 'No matches found. I will not substitute a generic answer.'
    );
  }

  for (const hit of hits) {
    lines.push(describeHit(hit, language));
  }

  if (result.documents.length > 0) {
    lines.push('', `### ${ru ? 'Документы' : 'Documents'}`);
    for (const document of result.documents.slice(0, 6)) {
      lines.push(`- **${document.title}** — ${document.headings.slice(0, 6).join('; ')}`);
    }
  }

  if (result.gaps.length > 0) {
    lines.push('', `### ${ru ? 'Ограничения' : 'Limitations'}`);
    for (const gap of result.gaps.slice(0, 6)) lines.push(`- ${gap}`);
  }

  return lines.join('\n');
}

function formatEntityDistinction(result: ContextQueryResult, language: 'ru' | 'en'): string {
  const ru = language === 'ru';
  const lines: string[] = [];

  if (result.ambiguities.length === 0) {
    lines.push(
      ru
        ? 'Однозначного совпадения по имени не найдено. Уточни, о какой сущности речь: проект, книга, серия, сайт или документ.'
        : 'No unambiguous name match was found. Specify the entity: project, book, series, website or document.'
    );
  }

  for (const ambiguity of result.ambiguities) {
    lines.push(
      ru
        ? `Имя «${ambiguity.name}» относится к нескольким сущностям. Я не буду выбирать одну без уточнения:`
        : `The name “${ambiguity.name}” refers to more than one entity. I will not choose one without clarification:`
    );
    for (const candidate of ambiguity.candidates) {
      const type = entityTypeLabel(candidate.entityType)[language];
      lines.push(
        `- **${type.toUpperCase()}** «${candidate.name}»${candidate.description ? ` — ${candidate.description}` : ''}`
      );
    }
    lines.push(
      '',
      ru
        ? 'Уточни: книга, проект, серия, сайт или другой тип? После этого я свяжу ответ с правильной сущностью.'
        : 'Specify: book, project, series, website or another type. I will then bind the answer to the correct entity.'
    );
  }

  if (result.gaps.length > 0) {
    lines.push('', `### ${ru ? 'Ограничения' : 'Limitations'}`);
    for (const gap of result.gaps.slice(0, 5)) lines.push(`- ${gap}`);
  }

  return lines.join('\n');
}

function formatDocumentSearch(result: ContextQueryResult, language: 'ru' | 'en'): string {
  const ru = language === 'ru';
  const lines: string[] = [];
  if (result.documents.length === 0) {
    lines.push(
      ru
        ? 'Документ в Brain не найден по названию или содержимому. Я не буду пересказывать его по заголовку.'
        : 'No Brain document matched by title or content. I will not summarise it from the title.'
    );
  } else {
    for (const document of result.documents.slice(0, 5)) {
      lines.push(`**${document.title}** · ${document.sectionCount} ${ru ? 'разделов' : 'sections'}`);
      if (document.headings.length > 0) {
        lines.push(
          `${ru ? 'Структура' : 'Structure'}: ${document.headings.slice(0, 12).join('; ')}${
            document.truncated ? '…' : ''
          }`
        );
      }
    }
    if (result.hits.length > 0) {
      lines.push('', `### ${ru ? 'Фрагменты' : 'Excerpts'}`);
      for (const hit of result.hits.slice(0, 8)) lines.push(describeHit(hit, language));
    }
  }

  if (result.gaps.length > 0) {
    lines.push('', `### ${ru ? 'Ограничения' : 'Limitations'}`);
    for (const gap of result.gaps.slice(0, 5)) lines.push(`- ${gap}`);
  }
  return lines.join('\n');
}

function formatAchievement(result: ContextQueryResult, language: 'ru' | 'en'): string {
  const ru = language === 'ru';
  const daily = result.daily;
  if (!daily) return formatDaily(result, language);
  const lines: string[] = [];
  const period = daily.period?.label || (ru ? 'весь доступный период' : 'all available');

  lines.push(
    ru
      ? `Подтверждённые результаты: ${period} (${daily.timezone}).`
      : `Confirmed achievements: ${period} (${daily.timezone}).`
  );

  lines.push('', `### ${ru ? 'Завершено' : 'Completed'}`);
  lines.push(
    daily.completed.length
      ? daily.completed
          .slice(0, 12)
          .map((event) => describeEvent(event, daily.timezone, language))
          .join('\n')
      : `- ${ru ? 'Подтверждённых завершений нет. Обсуждение задачи не считается выполнением.' : 'No confirmed completions. Discussing a task is not completion.'}`
  );

  lines.push('', `### ${ru ? 'Результаты и публикации' : 'Deliverables and publications'}`);
  lines.push(
    daily.deliverables.length
      ? daily.deliverables
          .slice(0, 10)
          .map((event) => describeEvent(event, daily.timezone, language))
          .join('\n')
      : `- ${ru ? 'Подтверждённых результатов не найдено.' : 'No confirmed deliverables found.'}`
  );

  if (daily.intentions.length > 0) {
    lines.push('', `### ${ru ? 'Ещё не завершено' : 'Not completed yet'}`);
    for (const event of daily.intentions.slice(0, 8)) {
      lines.push(describeEvent(event, daily.timezone, language, false));
    }
  }

  if (daily.gaps.length > 0) {
    lines.push('', `### ${ru ? 'Ограничения' : 'Limitations'}`);
    for (const gap of daily.gaps.slice(0, 5)) lines.push(`- ${gap}`);
  }

  return lines.join('\n');
}

function fallbackReport(result: ContextQueryResult, language: 'ru' | 'en'): string {
  const ru = language === 'ru';
  const lines: string[] = [];
  lines.push(
    ru
      ? `Контекст: ${result.hits.length} совпадений, ${result.counts.conversations} диалогов, ${result.counts.documents} документов.`
      : `Context: ${result.hits.length} matches, ${result.counts.conversations} conversations, ${result.counts.documents} documents.`
  );
  for (const hit of result.hits.slice(0, 10)) lines.push(describeHit(hit, language));
  if (result.gaps.length > 0) {
    lines.push('', `### ${ru ? 'Ограничения' : 'Limitations'}`);
    for (const gap of result.gaps.slice(0, 5)) lines.push(`- ${gap}`);
  }
  return lines.join('\n');
}

/**
 * A single report formatter for every context intent. It answers the requested
 * operation first, keeps evidence labels, and names gaps instead of filling
 * them with invented events.
 */
export function formatContextReport(
  result: ContextQueryResult,
  language: 'ru' | 'en' = 'ru'
): string {
  let report: string;

  switch (result.plan.intent) {
    case 'DAILY_SUMMARY':
      report = formatDaily(result, language);
      break;
    case 'ACHIEVEMENT_LOG':
      report = formatAchievement(result, language);
      break;
    case 'PROJECT_STATUS':
      report = result.projectState
        ? formatProjectStatus(result, language)
        : result.daily
          ? formatAchievement(result, language)
          : fallbackReport(result, language);
      break;
    case 'PROJECT_HISTORY':
      report = formatProjectHistory(result, language);
      break;
    case 'CONVERSATION_SEARCH':
      report = formatConversationSearch(result, language);
      break;
    case 'ENTITY_DISTINCTION':
      report = formatEntityDistinction(result, language);
      break;
    case 'DOCUMENT_SEARCH':
      report = formatDocumentSearch(result, language);
      break;
    default:
      report = fallbackReport(result, language);
  }

  if (!report.trim()) report = fallbackReport(result, language);
  return report.slice(0, 8_000);
}
