import {
  PIERROT_RESPONSE_VERSION,
  type PierrotChartBlock,
  type PierrotContentBlock,
  type PierrotDiagramBlock,
  type PierrotMetricItem,
  type PierrotResponse,
  type PierrotSourceItem,
  type PierrotTimelineEvent,
} from '@/lib/pierrot/response/types';
import type {
  ContextHit,
  ContextQueryResult,
  EvidenceClass,
  TimelineEvent,
} from './types';

/**
 * Turns the Context Engine result into an editorial composition.
 *
 * The Markdown report remains the fallback and the persisted transcript. This
 * builder only reorganises the very same retrieved records: it never invents
 * events, links or counts. A timeline is chosen for chronology, metrics for
 * period counts, and source lists for traceability.
 */

type Language = 'ru' | 'en';

const EVIDENCE_RU: Record<EvidenceClass, string> = {
  MEASURED: 'измерено',
  USER_CONFIRMED: 'подтверждено владельцем',
  DIRECTLY_OBSERVED: 'наблюдалось напрямую',
  DOCUMENTED: 'документировано',
  INFERRED: 'вывод',
  UNKNOWN: 'неизвестно',
};

const EVIDENCE_EN: Record<EvidenceClass, string> = {
  MEASURED: 'measured',
  USER_CONFIRMED: 'owner-confirmed',
  DIRECTLY_OBSERVED: 'directly observed',
  DOCUMENTED: 'documented',
  INFERRED: 'inferred',
  UNKNOWN: 'unknown',
};

function evidence(value: EvidenceClass, language: Language): string {
  return language === 'ru' ? EVIDENCE_RU[value] : EVIDENCE_EN[value];
}

function firstParagraph(markdown: string): string {
  const cleaned = markdown
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find((part) => part && !/^#{1,4}\s/.test(part) && !/^[-*]\s/.test(part));

  if (!cleaned) return markdown.trim().slice(0, 600);
  return cleaned.slice(0, 900);
}

function eventToTimeline(
  event: TimelineEvent,
  language: Language
): PierrotTimelineEvent {
  return {
    date: event.occurredAt,
    title: event.title || event.description.slice(0, 120) || (language === 'ru' ? 'Событие' : 'Event'),
    description: event.description.slice(0, 320),
    category: event.category,
    status: event.status || undefined,
    source: `${evidence(event.evidenceClass, language)}${
      event.completed ? (language === 'ru' ? ' · завершено' : ' · completed') : ''
    }`,
    url: event.href,
  };
}

function hitToSource(hit: ContextHit, language: Language): PierrotSourceItem {
  return {
    label: hit.title || hit.excerpt.slice(0, 120) || (language === 'ru' ? 'Фрагмент' : 'Fragment'),
    source: hit.projectName || hit.sourceType.replace(/_/g, ' '),
    url: hit.href,
    date: hit.eventAt,
    excerpt: hit.excerpt.slice(0, 320),
    confidence: hit.evidenceClass === 'INFERRED' ? 'estimated' : 'measured',
    method: hit.retrievalMethod.replace(/_/g, ' '),
  };
}

function metric(
  label: string,
  value: number | null,
  source: string,
  period: string | null,
  language: Language,
  interpretation?: string
): PierrotMetricItem | null {
  if (value === null) return null;
  return {
    label,
    value,
    unit: 'count',
    source,
    period,
    confidence: 'measured',
    interpretation:
      interpretation ||
      (language === 'ru'
        ? 'Количество записей, найденных в указанном периоде.'
        : 'Number of records found in the stated period.'),
  };
}

function dedupeEvents(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

function timelineBlock(
  events: TimelineEvent[],
  language: Language,
  title: string,
  description?: string
): PierrotContentBlock | null {
  const selected = dedupeEvents(events).slice(0, 24);
  if (selected.length === 0) return null;

  return {
    type: 'timeline',
    title,
    description,
    events: selected.map((event) => eventToTimeline(event, language)),
  };
}

function sourceBlock(
  hits: ContextHit[],
  language: Language,
  result: ContextQueryResult
): PierrotContentBlock | null {
  if (hits.length === 0) return null;

  return {
    type: 'source',
    title: language === 'ru' ? 'Источники' : 'Sources',
    sources: hits.slice(0, 16).map((hit) => hitToSource(hit, language)),
    coverage:
      language === 'ru'
        ? `Диалогов: ${result.counts.conversations} · сообщений: ${result.counts.messages} · документов: ${result.counts.documents}.${result.widenedFromProject ? ' Поиск расширен за пределы проекта.' : ''}`
        : `Conversations: ${result.counts.conversations} · messages: ${result.counts.messages} · documents: ${result.counts.documents}.${result.widenedFromProject ? ' Search was widened beyond the project.' : ''}`,
    limitations: result.gaps.slice(0, 3),
  };
}

function wantsChart(query: string): boolean {
  return /(график|chart|plot|динамик|trend|крив)/i.test(query);
}

function wantsDiagram(query: string): boolean {
  return /(диаграмм|diagram|схем|graph|graph\s*view|связ)/i.test(query);
}

function chartFromTimeline(
  events: TimelineEvent[],
  language: Language,
  period: string | null
): PierrotChartBlock | null {
  const byDay = new Map<string, number>();

  for (const event of events) {
    const day = event.occurredAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }

  const points = [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({ date, events: count }));

  if (points.length < 2) return null;

  return {
    type: 'chart',
    chart: 'bar',
    title: language === 'ru' ? 'Активность по дням' : 'Activity by day',
    description:
      language === 'ru'
        ? `События из сохранённых записей${period ? ` · ${period}` : ''}. Пустые дни не достраиваются нулями.`
        : `Events from saved records${period ? ` · ${period}` : ''}. Missing days are not filled with zeros.`,
    data: points,
    xKey: 'date',
    series: [
      {
        key: 'events',
        label: language === 'ru' ? 'События' : 'Events',
        color: '#A5764F',
      },
    ],
    unit: language === 'ru' ? 'события' : 'events',
  };
}

function diagramFromContext(
  result: ContextQueryResult,
  language: Language
): PierrotDiagramBlock | null {
  const nodes = new Map<string, { id: string; label: string; detail?: string; group?: string }>();

  for (const hit of result.hits) {
    if (hit.projectId && hit.projectName) {
      nodes.set(`project:${hit.projectId}`, {
        id: `project:${hit.projectId}`,
        label: hit.projectName,
        group: 'project',
      });
    }
    if (hit.entityId) {
      nodes.set(`entity:${hit.entityId}`, {
        id: `entity:${hit.entityId}`,
        label: hit.title.slice(0, 160),
        detail: hit.entityId,
        group: 'entity',
      });
    }
  }

  for (const event of result.timeline) {
    if (event.projectId) {
      nodes.set(`project:${event.projectId}`, {
        id: `project:${event.projectId}`,
        label:
          result.projectState?.projectId === event.projectId
            ? result.projectState.projectName
            : language === 'ru'
              ? 'Проект'
              : 'Project',
        group: 'project',
      });
    }
    if (event.entityId) {
      nodes.set(`entity:${event.entityId}`, {
        id: `entity:${event.entityId}`,
        label: event.title.slice(0, 160),
        group: 'entity',
      });
    }
  }

  const list = [...nodes.values()].slice(0, 24);
  if (list.length < 2) return null;

  const edges = list
    .filter((node) => node.group === 'entity')
    .map((node) => ({
      from: node.id,
      to: list.find((candidate) => candidate.group === 'project')?.id || list[0].id,
      kind: 'direct' as const,
      label: language === 'ru' ? 'упомянуто в' : 'mentioned in',
    }))
    .filter((edge) => edge.from !== edge.to)
    .slice(0, 40);

  if (edges.length === 0) return null;

  return {
    type: 'diagram',
    diagram: 'relationship',
    title: language === 'ru' ? 'Связи в найденном контексте' : 'Relationships in retrieved context',
    nodes: list,
    edges,
    caption:
      language === 'ru'
        ? 'Только подтверждённые связи из записей. Пунктирных inference-связей здесь нет.'
        : 'Only relationships present in stored records. No inferred links are drawn here.',
  };
}

function warning(
  level: 'info' | 'warning' | 'critical',
  text: string,
  title?: string
): PierrotContentBlock {
  return { type: 'warning', level, title, text };
}

export function buildContextResponse(
  result: ContextQueryResult,
  markdown: string,
  language: Language = 'ru'
): PierrotResponse | null {
  const period = result.plan.period?.label || null;
  const summary = firstParagraph(markdown);
  const blocks: Array<PierrotContentBlock | null> = [];

  if (summary) blocks.push({ type: 'text', markdown: summary });

  switch (result.plan.intent) {
    case 'DAILY_SUMMARY': {
      const daily = result.daily;
      blocks.push(
        {
          type: 'metric',
          title: language === 'ru' ? 'День в цифрах' : 'The day in numbers',
          metrics: [
            metric(
              language === 'ru' ? 'Сообщения' : 'Messages',
              result.counts.messages,
              'Conversation archive',
              period,
              language
            ),
            metric(
              language === 'ru' ? 'Диалоги' : 'Conversations',
              result.counts.conversations,
              'Conversation archive',
              period,
              language
            ),
            metric(
              language === 'ru' ? 'Подтверждено' : 'Confirmed completions',
              daily?.completed.length ?? 0,
              'Tasks & deliverables',
              period,
              language,
              language === 'ru'
                ? 'Только подтверждённые завершения, не обсуждения.'
                : 'Confirmed completions only, not discussions.'
            ),
            metric(
              language === 'ru' ? 'Решения' : 'Decisions',
              daily?.decisions.length ?? result.counts.decisions,
              'Project workspace',
              period,
              language
            ),
          ].filter((item): item is PierrotMetricItem => item !== null),
        },
        timelineBlock(
          [...(daily?.completed || []), ...(daily?.deliverables || []), ...(daily?.decisions || [])],
          language,
          language === 'ru' ? 'Что произошло' : 'What happened',
          language === 'ru'
            ? 'Завершённые результаты, решения и материалы. Намерения в эту секцию не входят.'
            : 'Completed results, decisions and materials. Intentions are excluded.'
        )
      );

      if ((daily?.completed.length ?? 0) === 0) {
        blocks.push(
          warning(
            'info',
            language === 'ru'
              ? 'Подтверждённых завершений за период нет. Обсуждение задачи не считается её выполнением.'
              : 'No confirmed completions were recorded for the period. Discussing a task is not completion.'
          )
        );
      }

      if (daily?.intentions.length) {
        blocks.push(
          timelineBlock(
            daily.intentions,
            language,
            language === 'ru' ? 'Открытые намерения' : 'Open intentions',
            language === 'ru'
              ? 'Это планы и обсуждения, а не выполненные задачи.'
              : 'These are plans and discussions, not completed work.'
          )
        );
      }
      break;
    }
    case 'ACHIEVEMENT_LOG': {
      const daily = result.daily;
      blocks.push(
        {
          type: 'metric',
          metrics: [
            metric(
              language === 'ru' ? 'Завершено' : 'Completed',
              daily?.completed.length ?? 0,
              'Tasks & deliverables',
              period,
              language
            ),
            metric(
              language === 'ru' ? 'Результаты' : 'Deliverables',
              daily?.deliverables.length ?? 0,
              'Project workspace',
              period,
              language
            ),
            metric(
              language === 'ru' ? 'Ещё не завершено' : 'Not completed',
              daily?.intentions.length ?? 0,
              'Tasks & intentions',
              period,
              language,
              language === 'ru'
                ? 'Намерения не входят в число завершённых результатов.'
                : 'Intentions are not counted as completed results.'
            ),
          ].filter((item): item is PierrotMetricItem => item !== null),
        },
        timelineBlock(
          [...(daily?.completed || []), ...(daily?.deliverables || [])],
          language,
          language === 'ru' ? 'Подтверждённые результаты' : 'Confirmed results'
        )
      );
      break;
    }
    case 'PROJECT_STATUS': {
      const state = result.projectState;
      if (state) {
        blocks.push({
          type: 'project_status',
          projectName: state.projectName,
          status: state.status,
          statusReason: state.statusReason,
          workstreams: state.workstreams.slice(0, 12).map((stream) => ({
            name: stream.name,
            entityType: stream.entityType,
            status: stream.status,
            openTasks: stream.openTasks,
            completedTasks: stream.completedTasks,
            deliverables: stream.deliverables,
            note: stream.notes.join(' · ') || null,
          })),
          completed: state.completed.length,
          remaining: state.remaining.length,
          decisions: state.decisions.length,
          period,
        });
      }

      blocks.push(
        timelineBlock(
          [...(state?.remaining || []), ...(state?.blocked || [])],
          language,
          language === 'ru' ? 'Осталось и заблокировано' : 'Remaining and blocked'
        )
      );
      break;
    }
    case 'PROJECT_HISTORY':
      blocks.push(
        timelineBlock(
          result.timeline,
          language,
          language === 'ru' ? 'Хронология' : 'Timeline',
          language === 'ru'
            ? 'События из сохранённых записей с датами и классами доказательств.'
            : 'Events from saved records with dates and evidence classes.'
        )
      );
      break;
    case 'CONVERSATION_SEARCH':
      blocks.push(sourceBlock(result.hits, language, result));
      break;
    case 'ENTITY_DISTINCTION': {
      const ambiguity = result.ambiguities[0];
      if (ambiguity) {
        blocks.push({
          type: 'comparison',
          title: language === 'ru' ? 'Разные сущности' : 'Different entities',
          description:
            language === 'ru'
              ? 'Имена совпадают, но типы разные. Выбор без уточнения был бы ошибкой.'
              : 'The names match but the types differ. Choosing without clarification would be wrong.',
          columns: ambiguity.candidates.slice(0, 3).map((candidate) => ({
            id: candidate.id,
            title: candidate.name,
            subtitle: candidate.entityType,
          })),
          rows: [
            {
              label: language === 'ru' ? 'Тип' : 'Type',
              values: Object.fromEntries(
                ambiguity.candidates.slice(0, 3).map((candidate) => [
                  candidate.id,
                  candidate.entityType,
                ])
              ),
            },
            {
              label: language === 'ru' ? 'Статус' : 'Status',
              values: Object.fromEntries(
                ambiguity.candidates.slice(0, 3).map((candidate) => [
                  candidate.id,
                  candidate.status || '—',
                ])
              ),
            },
          ],
        });
      }
      break;
    }
    case 'DOCUMENT_SEARCH':
      blocks.push(sourceBlock(result.hits, language, result));
      break;
    default:
      blocks.push(sourceBlock(result.hits, language, result));
  }

  if (wantsChart(result.plan.originalQuery)) {
    const chart = chartFromTimeline(result.timeline, language, period);
    if (chart) {
      blocks.push(chart);
    } else {
      blocks.push(
        warning(
          'info',
          language === 'ru'
            ? 'Для графика в найденных записях недостаточно датированных событий. Я не достраиваю отсутствующие дни нулями.'
            : 'The retrieved records do not contain enough dated events for a chart. Missing days are not filled with zeros.'
        )
      );
    }
  }

  if (wantsDiagram(result.plan.originalQuery)) {
    const diagram = diagramFromContext(result, language);
    if (diagram) {
      blocks.push(diagram);
    } else {
      blocks.push(
        warning(
          'info',
          language === 'ru'
            ? 'В найденном контексте недостаточно подтверждённых сущностей и связей для диаграммы. Я не рисую вымышленные связи.'
            : 'The retrieved context does not contain enough confirmed entities and relationships for a diagram. Invented links are not drawn.'
        )
      );
    }
  }

  if (result.gaps.length > 0 && result.plan.intent !== 'DAILY_SUMMARY') {
    blocks.push({
      type: 'insight',
      label: language === 'ru' ? 'Ограничения' : 'Limitations',
      text: result.gaps.slice(0, 3).join(' '),
    });
  }

  const compact = blocks.filter((block): block is PierrotContentBlock => Boolean(block));
  if (compact.length <= 1) return null;

  return {
    version: PIERROT_RESPONSE_VERSION,
    language,
    blocks: compact.slice(0, 24),
  };
}
