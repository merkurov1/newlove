import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import type {
  PierrotEntity,
  PierrotEntityRelation,
} from '@/lib/pierrot/entities/types';
import {
  classifyActivityCategory,
  detectCompletionSignal,
  sortTimeline,
  dedupeTimeline,
} from './timeline';
import type {
  EvidenceClass,
  ProjectState,
  ProjectWorkstream,
  TimelineEvent,
} from './types';

export type ProjectArtifactInput = {
  id: string;
  title: string;
  artifactType: string;
  updatedAt: string;
  content?: string;
  metadata?: Record<string, unknown>;
};

export type ProjectEventInput = {
  id: string;
  projectId: string | null;
  eventType: string;
  title: string;
  description: string;
  occurredAt: string;
  recordedAt: string;
  evidenceClass: string;
  sourceType: string | null;
  sourceId: string | null;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  confidence: number;
  metadata: Record<string, unknown>;
};

export type MessageTimelineInput = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  ingestedAt?: string | null;
  conversationTitle?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectSlug?: string | null;
  historyId?: string | null;
  sessionId?: string | null;
};

function compact(value: string, max = 240): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function isEvidenceClass(value: string): value is EvidenceClass {
  return ['MEASURED', 'USER_CONFIRMED', 'DIRECTLY_OBSERVED', 'DOCUMENTED', 'INFERRED', 'UNKNOWN'].includes(
    value
  );
}

function projectHref(projectSlug: string | null | undefined): string | null {
  return projectSlug ? `/admin/pierrot?project=${encodeURIComponent(projectSlug)}` : null;
}

export function messageToTimeline(
  input: MessageTimelineInput,
  project?: Pick<PierrotProject, 'id' | 'name' | 'slug'> | null
): TimelineEvent {
  const signal = detectCompletionSignal(input.content);
  const completed = signal.completed && input.role === 'user';
  const intention = signal.intention && !completed;
  const projectSlug =
    project?.slug || (input.projectSlug ? input.projectSlug : null);
  const href =
    projectHref(projectSlug) ||
    (input.historyId
      ? `/admin/pierrot?history=${encodeURIComponent(input.historyId)}${
          input.sessionId ? `&session=${encodeURIComponent(input.sessionId)}` : ''
        }`
      : `/admin/pierrot?conversation=${encodeURIComponent(input.conversationId)}`);

  return {
    id: input.id,
    type: 'message',
    title:
      input.role === 'user'
        ? `Сообщение владельца${input.conversationTitle ? ` · ${input.conversationTitle}` : ''}`
        : `Ответ Pierrot${input.conversationTitle ? ` · ${input.conversationTitle}` : ''}`,
    description: compact(input.content, 420),
    occurredAt: input.createdAt,
    recordedAt: input.ingestedAt || input.createdAt,
    evidenceClass: completed ? 'USER_CONFIRMED' : 'DIRECTLY_OBSERVED',
    projectId: project?.id || input.projectId || null,
    entityId: typeof input.projectId === 'string' ? input.projectId : null,
    conversationId: input.conversationId,
    messageId: input.id,
    category: classifyActivityCategory(input.content),
    status: completed ? 'completed' : intention ? 'intention' : 'observed',
    intention,
    completed,
    href,
    metadata: {
      role: input.role,
      conversationTitle: input.conversationTitle || null,
      projectName: project?.name || input.projectName || null,
      completionClaim: completed,
      intention,
    },
  };
}

export function memoryToTimeline(
  record: PierrotMemoryRecord,
  project?: Pick<PierrotProject, 'id' | 'name' | 'slug'> | null
): TimelineEvent {
  const isTask = record.kind === 'task' || record.kind === 'reminder';
  const isDecision =
    record.kind === 'decision' ||
    record.kind === 'position' ||
    record.kind === 'constraint' ||
    record.kind === 'preference';
  const isDeliverable = record.kind === 'saved' && /deliver|публикац|publication/i.test(`${record.title} ${record.content}`);
  const completed = record.status === 'completed';
  const occurredAt = record.decidedAt || record.updatedAt || record.createdAt;

  return {
    id: `memory:${record.id}`,
    type: isDeliverable ? 'deliverable' : isDecision ? 'decision' : 'task',
    title: record.title,
    description: compact(record.content, 360),
    occurredAt,
    recordedAt: record.createdAt || occurredAt,
    evidenceClass: record.confidence >= 0.6 ? 'USER_CONFIRMED' : 'INFERRED',
    projectId: project?.id || null,
    entityId: null,
    conversationId: record.conversationId,
    messageId: record.messageId,
    category: classifyActivityCategory(`${record.title} ${record.content}`),
    status: record.status,
    intention:
      isTask &&
      !completed &&
      (record.status === 'current' || record.status === 'uncertain'),
    completed,
    href: projectHref(project?.slug),
    metadata: {
      kind: record.kind,
      importance: record.importance,
      confidence: record.confidence,
      projectName: project?.name || record.project || null,
    },
  };
}

export function artifactToTimeline(
  artifact: ProjectArtifactInput,
  project?: Pick<PierrotProject, 'id' | 'name' | 'slug'> | null
): TimelineEvent {
  const metadata = artifact.metadata || {};
  const status = typeof metadata.status === 'string' ? metadata.status : '';
  const completed = /^(?:completed|published|released|done|shipped)$/i.test(status);

  return {
    id: `artifact:${artifact.id}`,
    type: 'artifact',
    title: artifact.title,
    description: compact(artifact.content || artifact.artifactType, 320),
    occurredAt: artifact.updatedAt || new Date(0).toISOString(),
    recordedAt: artifact.updatedAt || new Date(0).toISOString(),
    evidenceClass: completed ? 'USER_CONFIRMED' : 'DOCUMENTED',
    projectId: project?.id || null,
    entityId: null,
    conversationId: null,
    messageId: null,
    category: classifyActivityCategory(`${artifact.title} ${artifact.artifactType}`),
    status: status || artifact.artifactType,
    intention: false,
    completed,
    href: projectHref(project?.slug),
    metadata: { artifactType: artifact.artifactType, ...metadata },
  };
}

export function projectEventToTimeline(
  event: ProjectEventInput,
  project?: Pick<PierrotProject, 'id' | 'name' | 'slug'> | null
): TimelineEvent {
  const evidenceClass = isEvidenceClass(event.evidenceClass)
    ? event.evidenceClass
    : 'UNKNOWN';
  const type =
    event.eventType === 'decision'
      ? 'decision'
      : event.eventType === 'task'
        ? 'task'
        : event.eventType === 'deliverable'
          ? 'deliverable'
          : event.eventType === 'status_change'
            ? 'status_change'
            : 'project_event';
  const status =
    typeof event.metadata.status === 'string' ? event.metadata.status : null;
  const completed =
    event.metadata.completed === true ||
    (status ? /^(?:completed|done|published|released)$/i.test(status) : false);

  return {
    id: `project_event:${event.id}`,
    type,
    title: event.title,
    description: compact(event.description, 400),
    occurredAt: event.occurredAt,
    recordedAt: event.recordedAt,
    evidenceClass,
    projectId: event.projectId || project?.id || null,
    entityId: typeof event.metadata.entity_id === 'string' ? event.metadata.entity_id : null,
    conversationId: event.sourceConversationId,
    messageId: event.sourceMessageId,
    category: classifyActivityCategory(`${event.title} ${event.description}`),
    status,
    intention: event.metadata.intention === true,
    completed,
    href: projectHref(project?.slug),
    metadata: {
      eventType: event.eventType,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      confidence: event.confidence,
      ...event.metadata,
    },
  };
}

function lifecycle(value: string | null | undefined): ProjectWorkstream['status'] {
  const normalized = (value || '').toUpperCase();
  if (
    normalized === 'PROPOSED' ||
    normalized === 'IN_PROGRESS' ||
    normalized === 'BLOCKED' ||
    normalized === 'COMPLETED' ||
    normalized === 'CANCELLED' ||
    normalized === 'ARCHIVED'
  ) {
    return normalized;
  }
  if (normalized === 'ACTIVE') return 'IN_PROGRESS';
  if (normalized === 'PAUSED') return 'BLOCKED';
  return 'PROPOSED';
}

/**
 * Derives the project and workstream state from records that already exist.
 * Completion is never inferred from discussion: only a completed task, a
 * confirmed deliverable or an explicit project event can complete a stream.
 */
export function deriveProjectState(input: {
  project: Pick<PierrotProject, 'id' | 'name' | 'slug' | 'status' | 'description' | 'objective'>;
  events: TimelineEvent[];
  entities?: PierrotEntity[];
  relations?: PierrotEntityRelation[];
  gaps?: string[];
}): ProjectState {
  const events = dedupeTimeline(sortTimeline(input.events));
  const completed = events.filter(
    (event) =>
      event.completed &&
      (event.evidenceClass === 'USER_CONFIRMED' ||
        event.evidenceClass === 'DIRECTLY_OBSERVED' ||
        event.evidenceClass === 'MEASURED')
  );
  const decisions = events.filter(
    (event) =>
      event.type === 'decision' &&
      (event.evidenceClass === 'USER_CONFIRMED' || event.evidenceClass === 'DOCUMENTED')
  );
  const deliverables = events.filter(
    (event) => event.type === 'deliverable' || event.type === 'artifact' || event.type === 'document'
  );
  const inactiveStatuses = new Set([
    'archived',
    'superseded',
    'rejected',
    'cancelled',
    'completed',
  ]);
  const remaining = events.filter(
    (event) =>
      !completed.some((done) => done.id === event.id) &&
      !inactiveStatuses.has((event.status || '').toLowerCase()) &&
      (event.type === 'task' || event.intention || event.type === 'deliverable')
  );
  const blocked = events.filter(
    (event) =>
      /blocked|cancelled|отмен|заблок/i.test(event.status || '') ||
      (event.type === 'status_change' && /blocked/i.test(event.title))
  );

  const childEntities = (input.entities || []).filter(
    (entity) => entity.entityType !== 'PROJECT' && entity.projectId === input.project.id
  );
  const projectEntityIds = new Set(
    (input.entities || [])
      .filter(
        (entity) =>
          entity.entityType === 'PROJECT' &&
          (entity.projectId === input.project.id || entity.id === input.project.id)
      )
      .map((entity) => entity.id)
  );
  const relationByChild = new Map<string, string>();
  for (const relation of input.relations || []) {
    if (projectEntityIds.has(relation.fromEntityId) || relation.fromEntityId.startsWith('project:')) {
      relationByChild.set(relation.toEntityId, relation.relationType);
    }
  }

  const workstreams: ProjectWorkstream[] = childEntities.map((entity) => {
    const related = events.filter(
      (event) =>
        event.entityId === entity.id ||
        (event.projectId === entity.projectId &&
          event.description.toLowerCase().includes(entity.name.toLowerCase()))
    );
    const openTasks = related.filter((event) => event.type === 'task' && !event.completed).length;
    const completedTasks = related.filter((event) => event.type === 'task' && event.completed).length;
    const streamDeliverables = related.filter(
      (event) => event.type === 'deliverable' || event.type === 'artifact'
    ).length;
    const metadataStatus =
      typeof entity.metadata.lifecycle_status === 'string'
        ? entity.metadata.lifecycle_status
        : entity.status;
    const streamCompleted =
      metadataStatus.toLowerCase() === 'completed' ||
      (completedTasks > 0 && openTasks === 0 && streamDeliverables > 0);
    const status: ProjectWorkstream['status'] = streamCompleted
      ? 'COMPLETED'
      : openTasks > 0
        ? 'IN_PROGRESS'
        : lifecycle(metadataStatus);

    return {
      id: entity.id,
      entityType: entity.entityType,
      name: entity.name,
      status,
      openTasks,
      completedTasks,
      deliverables: streamDeliverables,
      notes: [
        relationByChild.get(entity.id) ? `Связь: ${relationByChild.get(entity.id)}` : '',
        entity.description,
      ].filter(Boolean),
      evidenceIds: related.map((event) => event.id),
    };
  });

  if (workstreams.length === 0) {
    workstreams.push({
      id: `project:${input.project.id}`,
      entityType: 'PROJECT',
      name: input.project.name,
      status: lifecycle(input.project.status),
      openTasks: remaining.filter((event) => event.type === 'task').length,
      completedTasks: completed.filter((event) => event.type === 'task').length,
      deliverables: deliverables.length,
      notes: [],
      evidenceIds: events.map((event) => event.id),
    });
  }

  let status: ProjectState['status'];
  let statusReason: string;

  if (input.project.status === 'archived') {
    status = 'ARCHIVED';
    statusReason = 'Проект находится в архиве.';
  } else if (blocked.length > 0) {
    status = 'BLOCKED';
    statusReason = 'Есть явно заблокированное событие или направление.';
  } else if (
    completed.length > 0 &&
    remaining.filter((event) => event.type === 'task' || event.intention).length === 0
  ) {
    status = 'COMPLETED';
    statusReason = 'Все зафиксированные задачи завершены; завершение подтверждено.';
  } else if (
    events.some(
      (event) =>
        event.projectId === input.project.id ||
        event.conversationId ||
        event.type === 'decision' ||
        event.type === 'task'
    )
  ) {
    status = 'IN_PROGRESS';
    statusReason = 'Есть зафиксированные задачи, решения или материалы проекта.';
  } else if (input.project.description || input.project.objective) {
    status = 'PROPOSED';
    statusReason = 'Есть описание, но пока нет подтверждённых задач или результатов.';
  } else {
    status = 'PROPOSED';
    statusReason = 'Недостаточно данных для более точного состояния.';
  }

  const gaps = [...(input.gaps || [])];
  if (childEntities.length === 0) {
    gaps.push('Типизированные направления проекта ещё не заведены; состояние показано на уровне проекта.');
  }
  if (deliverables.length === 0) {
    gaps.push('Подтверждённых результатов (deliverables) не найдено.');
  }

  return {
    projectId: input.project.id,
    projectName: input.project.name,
    status,
    statusReason,
    workstreams,
    completed: completed.slice(0, 20),
    remaining: remaining.slice(0, 20),
    blocked: blocked.slice(0, 10),
    decisions: decisions.slice(0, 20),
    deliverables: deliverables.slice(0, 20),
    gaps,
  };
}
