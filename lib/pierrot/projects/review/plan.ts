import type { PierrotProjectSnapshot } from '../types';
import type { ProposalDraft } from '@/lib/pierrot/grooming/rules';
import type { ProjectReviewAnalysis, ReviewCandidate, ReviewCompletionCandidate } from './analyze';

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function isRecent(value: string | null, days = 180): boolean {
  if (!value) return true;
  const created = Date.parse(value);
  if (!Number.isFinite(created)) return true;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}

function sourceRefs(project: PierrotProjectSnapshot, candidate: ReviewCandidate) {
  return [
    {
      type: 'conversation_message' as const,
      id: candidate.sourceMessageId,
      title: candidate.title,
      quote: candidate.content.slice(0, 600),
      createdAt: candidate.sourceCreatedAt,
      metadata: {
        projectId: project.id,
        projectSlug: project.slug,
        messageIndex: candidate.sourceMessageIndex,
        classification: candidate.tags,
      },
    },
  ];
}

function taskProposal(
  project: PierrotProjectSnapshot,
  candidate: ReviewCandidate,
  operation: 'create_task' | 'create_reminder'
): ProposalDraft {
  const label = operation === 'create_task' ? 'задачу' : 'напоминание';
  return {
    operation,
    entityType: 'task',
    entityId: null,
    projectId: project.id,
    projectName: project.name,
    title: `Создать ${label} «${truncate(candidate.title, 160)}»`,
    reason:
      'В каноническом диалоге проекта найдено конкретное поручение с проверяемым следующим действием.',
    expectedResult: `После подтверждения создаётся ${label}, исходное сообщение и проект сохраняются как provenance.`,
    sourceRefs: sourceRefs(project, candidate),
    params: {
      content: candidate.content,
      title: candidate.title,
      projectId: project.id,
      projectName: project.name,
      conversationId: project.conversationId,
      kind: operation === 'create_task' ? 'task' : 'reminder',
    },
    beforeState: {},
    confidence: operation === 'create_task' ? 0.86 : 0.8,
    risk: 'confirmation',
  };
}

function memoryProposal(
  project: PierrotProjectSnapshot,
  candidate: ReviewCandidate,
  kind: 'decision' | 'constraint' | 'saved'
): ProposalDraft {
  const kindLabel =
    kind === 'decision' ? 'решение' : kind === 'constraint' ? 'правило проекта' : 'идею';
  return {
    operation: 'create_memory',
    entityType: 'memory',
    entityId: null,
    projectId: project.id,
    projectName: project.name,
    title: `Сохранить ${kindLabel} «${truncate(candidate.title, 160)}»`,
    reason:
      kind === 'decision'
        ? 'Владелец явно зафиксировал решение; оно не должно потеряться среди сообщений.'
        : kind === 'constraint'
          ? 'Формулировка описывает правило или ограничение проекта, а не задачу на выполнение.'
          : 'Формулировка является идеей или гипотезой без конкретного следующего действия.',
    expectedResult:
      'Запись сохраняется в памяти проекта отдельно от активных задач; исходные сообщения не изменяются.',
    sourceRefs: sourceRefs(project, candidate),
    params: {
      kind,
      title: candidate.title,
      content: candidate.content,
      project: project.name,
      projectId: project.id,
      conversationId: project.conversationId,
      tags: Array.from(new Set([...candidate.tags, kind])),
    },
    beforeState: {},
    confidence: kind === 'decision' ? 0.88 : kind === 'constraint' ? 0.8 : 0.74,
    risk: 'confirmation',
  };
}

function materialProposal(
  project: PierrotProjectSnapshot,
  material: ProjectReviewAnalysis['materials'][number]
): ProposalDraft {
  return {
    operation: 'create_artifact',
    entityType: 'project',
    entityId: project.id,
    projectId: project.id,
    projectName: project.name,
    title: `Сохранить материал «${truncate(material.title, 160)}»`,
    reason: 'В диалоге проекта найдена ссылка на внешний материал; она ещё не сохранена в проекте.',
    expectedResult:
      'Материал добавляется в существующую таблицу артефактов проекта; оригинальный URL сохраняется.',
    sourceRefs: [
      {
        type: 'conversation_message',
        id: material.sourceMessageId,
        title: material.title,
        url: material.url,
        createdAt: material.sourceCreatedAt,
        metadata: {
          projectId: project.id,
          messageIndex: material.sourceMessageIndex,
          artifactType: material.artifactType,
        },
      },
    ],
    params: {
      projectId: project.id,
      title: material.title,
      url: material.url,
      artifactType: material.artifactType,
      conversationId: project.conversationId,
    },
    beforeState: {},
    confidence: 0.82,
    risk: 'reversible',
  };
}

function completionProposal(
  project: PierrotProjectSnapshot,
  completion: ReviewCompletionCandidate
): ProposalDraft {
  return {
    operation: 'complete_task',
    entityType: 'task',
    entityId: completion.taskId,
    projectId: project.id,
    projectName: project.name,
    title: `Отметить выполненной задачу «${truncate(completion.taskTitle, 160)}»`,
    reason: `В диалоге есть явное подтверждение: «${truncate(completion.evidence, 220)}».`,
    expectedResult: 'После подтверждения задача получает completed; запись и история сохраняются.',
    sourceRefs: [
      {
        type: 'conversation_message',
        id: completion.sourceMessageId,
        title: completion.taskTitle,
        quote: completion.evidence,
        metadata: { projectId: project.id },
      },
    ],
    params: { taskId: completion.taskId },
    beforeState: { id: completion.taskId, title: completion.taskTitle, status: 'current' },
    confidence: 0.82,
    risk: 'confirmation',
  };
}

export function buildProjectReviewProposals(input: {
  project: PierrotProjectSnapshot;
  analysis: ProjectReviewAnalysis;
}): {
  proposals: ProposalDraft[];
  warnings: string[];
  ambiguous: string[];
} {
  const { project, analysis } = input;
  const proposals: ProposalDraft[] = [];
  const warnings: string[] = [];
  const ambiguous: string[] = [];

  for (const task of analysis.tasks.slice(0, 20)) {
    if (!isRecent(task.sourceCreatedAt)) {
      ambiguous.push(
        `Старое указание «${truncate(task.content, 220)}» не превращается в новую задачу без отдельного подтверждения.`
      );
      continue;
    }
    proposals.push(taskProposal(project, task, 'create_task'));
  }
  for (const reminder of analysis.reminders.slice(0, 20)) {
    if (!isRecent(reminder.sourceCreatedAt)) {
      ambiguous.push(
        `Старое напоминание «${truncate(reminder.content, 220)}» не создаётся автоматически.`
      );
      continue;
    }
    proposals.push(taskProposal(project, reminder, 'create_reminder'));
  }
  for (const decision of analysis.decisions.slice(0, 20)) {
    proposals.push(memoryProposal(project, decision, 'decision'));
  }
  for (const rule of analysis.knowledge.slice(0, 20)) {
    proposals.push(memoryProposal(project, rule, 'constraint'));
  }
  for (const idea of analysis.ideas.slice(0, 20)) {
    proposals.push(memoryProposal(project, idea, 'saved'));
  }
  for (const material of analysis.materials.slice(0, 20)) {
    proposals.push(materialProposal(project, material));
  }
  for (const completion of analysis.completions.slice(0, 10)) {
    proposals.push(completionProposal(project, completion));
  }

  for (const question of analysis.openQuestions.slice(0, 10)) {
    ambiguous.push(`Открытый вопрос: «${truncate(question.content, 240)}»`);
  }
  for (const candidate of analysis.ambiguousTaskCandidates.slice(0, 10)) {
    ambiguous.push(
      `Неоднозначная формулировка «${truncate(candidate.content, 220)}» не превращается в задачу автоматически.`
    );
  }
  for (const contradiction of analysis.contradictions.slice(0, 8)) {
    ambiguous.push(
      `Противоречие: «${contradiction.leftTitle}» и «${contradiction.rightTitle}». ${contradiction.reason}`
    );
  }
  for (const ideaTask of analysis.ideaLikeTasks.slice(0, 8)) {
    ambiguous.push(`Задача «${ideaTask.title}» похожа на идею. ${ideaTask.reason}`);
  }
  for (const document of analysis.skippedDocuments.slice(0, 8)) {
    ambiguous.push(
      `Документ «${truncate(document, 180)}» не разобран на задачи автоматически: это вставленный текст или инструкция, а не список обязательств.`
    );
  }
  if (analysis.tasks.length > 20 || analysis.reminders.length > 20) {
    warnings.push('Часть найденных поручений не вошла в один план; повтори аудит после обработки.');
  }

  return { proposals, warnings, ambiguous };
}
