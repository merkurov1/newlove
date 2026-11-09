import { assertServerOnly } from '@/lib/serverOnly';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';
import type { PierrotProject } from '@/lib/pierrot/projects/types';
import { matchUniqueProjectMention } from '@/lib/pierrot/projects/matching';
import { lexicalSimilarity, normalizeForComparison } from '@/lib/pierrot/memory/similarity';
import { learnedClassification } from '@/lib/pierrot/learning/types';
import type { WorkspaceSnapshotData } from './collect';
import { extractGithubLink, resolveTaskProjectContext } from './github';
import { extractTaskPayload, isCommandArtifact, isQuestionLike, prepareTaskText } from './signals';
import type {
  GroomingAuditSummary,
  GroomingEntityType,
  GroomingOperation,
  GroomingProposal,
  GroomingRisk,
  GroomingSourceRef,
} from './types';

assertServerOnly('lib/pierrot/grooming/rules');

export type ProposalDraft = Omit<GroomingProposal, 'id' | 'status' | 'selected' | 'ordinal'>;

export type GroomingRuleResult = {
  proposals: ProposalDraft[];
  warnings: string[];
  ambiguous: string[];
  summary: GroomingAuditSummary;
};

const CONSTRAINT_PATTERN =
  /(?:^|[\s,;:])(?:важно[:!]|правило[:!]|принцип|не\s+должен|не\s+должна|не\s+должно|не\s+означает|никогда\s+не|всегда\s+|обязательно\s+не)(?:\s|$)/iu;
const IDEA_PATTERN =
  /(?:^|[\s(])(?:идея|идею|мысль|а\s+что\s+если|можно\s+было\s+бы|хотелось\s+бы|стоит\s+попробовать)(?:\s|[:.,(]|$)/iu;
const DECISION_PATTERN =
  /(?:^|[\s,;:])(?:решили|порешили|решение|договорились|утвердили|фиксируем|останавливаемся|будем\s+использовать)(?:\s|[:.,;]|$)/iu;
const TEMPORARY_PATTERN =
  /(?:^|[\s,;:])(?:сегодня|вчера|сейчас|пока|временно|на\s+этой\s+неделе|на\s+этот\s+раз|в\s+этом\s+месяце|до\s+конца\s+дня)(?:\s|[:.,;]|$)/iu;
const CONCRETE_ENGINEERING_PATTERN =
  /(?:github|issue|pull request|коммит|commit|код|api|route|маршрут|component|компонент|страниц|интерфейс|pwa|expo|миграц|migration|тест|test|деплой|deploy|баг|bug|ошибк|error|кнопк|button|форм|form)/iu;
const NEGATION =
  /(?:^|[\s(])(?:не|нет|без|никогда|отмен\w*|отказ\w*|против|not|never|cancel\w*|reject\w*)(?:\s|$)/iu;

function sourceRefs(record: PierrotMemoryRecord): GroomingSourceRef[] {
  const refs: GroomingSourceRef[] = [
    {
      type: 'memory_record',
      id: record.id,
      title: record.title,
      createdAt: record.createdAt,
    },
  ];
  for (const raw of record.sourceRefs) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.messageId === 'string') {
      refs.push({
        type: 'conversation_message',
        id: item.messageId,
        metadata: item,
      });
    }
  }
  return refs.slice(0, 5);
}

function beforeState(record: PierrotMemoryRecord): Record<string, unknown> {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    content: record.content,
    status: record.status,
    project: record.project,
    tags: record.tags,
    updatedAt: record.updatedAt,
  };
}

function projectForTask(
  record: PierrotMemoryRecord,
  projects: PierrotProject[],
  linkedProjectIds: Map<string, string[]>
): PierrotProject | null {
  const linked = linkedProjectIds.get(record.id) || [];
  if (linked.length === 1) {
    return projects.find((project) => project.id === linked[0]) || null;
  }
  if (record.project) {
    const byName = projects.find(
      (project) =>
        project.name.toLowerCase() === record.project?.toLowerCase() ||
        project.slug.toLowerCase() === record.project?.toLowerCase()
    );
    if (byName) return byName;
  }
  return null;
}

function draft(input: {
  operation: GroomingOperation;
  entityType: GroomingEntityType;
  entityId?: string | null;
  project?: PierrotProject | null;
  title: string;
  reason: string;
  expectedResult: string;
  sourceRefs?: GroomingSourceRef[];
  params?: Record<string, unknown>;
  beforeState?: Record<string, unknown>;
  confidence: number;
  risk: GroomingRisk;
}): ProposalDraft {
  return {
    operation: input.operation,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    projectId: input.project?.id || null,
    projectName: input.project?.name || null,
    title: input.title,
    reason: input.reason,
    expectedResult: input.expectedResult,
    sourceRefs: input.sourceRefs || [],
    params: input.params || {},
    beforeState: input.beforeState || {},
    confidence: input.confidence,
    risk: input.risk,
  };
}

function isJunkTask(record: PierrotMemoryRecord): boolean {
  const title = record.title.replace(/\s+/g, ' ').trim();
  const content = record.content.replace(/\s+/g, ' ').trim();
  // A wrapper like "Добавь в задачи — ..." is handled by the cleanup pass
  // first. If the title itself is a question/command/metadata, it is junk.
  return isCommandArtifact(title) || (isQuestionLike(title) && !extractTaskPayload(content));
}

function wasRejectedAsFalseTask(
  record: PierrotMemoryRecord,
  examples: WorkspaceSnapshotData['learningExamples']
): boolean {
  if (!examples || examples.length === 0) return false;
  return (
    learnedClassification(record.title, examples)?.outcome === 'false_task' ||
    learnedClassification(record.content, examples)?.outcome === 'false_task'
  );
}

function looksEngineering(record: PierrotMemoryRecord): boolean {
  const text = `${record.title} ${record.content} ${(record.tags || []).join(' ')}`;
  if (!CONCRETE_ENGINEERING_PATTERN.test(text)) return false;
  if (IDEA_PATTERN.test(text) || CONSTRAINT_PATTERN.test(text) || DECISION_PATTERN.test(text)) {
    return false;
  }
  return true;
}

function generatedProjectBrief(
  project: PierrotProject,
  tasks: PierrotMemoryRecord[],
  decisions: PierrotMemoryRecord[]
): string {
  const active = tasks.filter((task) => task.status === 'current').slice(0, 5);
  const recent = decisions.filter((record) => record.status === 'current').slice(0, 4);
  return [
    project.description || project.objective || `Рабочий проект «${project.name}».`,
    active.length
      ? `Текущие задачи: ${active.map((task) => task.title).join('; ')}.`
      : 'Активных задач нет.',
    recent.length ? `Актуальные решения: ${recent.map((record) => record.title).join('; ')}.` : '',
    'Бриф требует подтверждения владельцем и не является автоматически выведенным фактом.',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 20_000);
}

export function generateGroomingProposals(input: {
  snapshot: WorkspaceSnapshotData;
  scope: import('./types').GroomingScope;
  projectId: string | null;
}): GroomingRuleResult {
  const { snapshot } = input;
  const warnings = [...snapshot.warnings];
  const ambiguous: string[] = [];
  const proposals: ProposalDraft[] = [];
  const seen = new Set<string>();
  const maxProposals = 80;

  const add = (proposal: ProposalDraft) => {
    if (proposals.length >= maxProposals) return;
    const key = `${proposal.operation}:${proposal.entityId || ''}:${JSON.stringify(
      proposal.params
    ).slice(0, 180)}`;
    if (seen.has(key)) return;
    seen.add(key);
    proposals.push(proposal);
  };

  const projects = input.projectId
    ? snapshot.projects.filter((project) => project.id === input.projectId)
    : snapshot.projects;
  const projectIds = new Set(projects.map((project) => project.id));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const taskList = snapshot.tasks.filter((task) => {
    const project = projectForTask(task, snapshot.projects, snapshot.linkedProjectIds);
    return !input.projectId || (project && projectIds.has(project.id));
  });
  const activeTasks = taskList.filter(
    (task) => task.status === 'current' || task.status === 'uncertain'
  );
  const memoryList = snapshot.memories.filter((record) => {
    if (record.status !== 'current') return false;
    if (!input.projectId) return true;
    return projectForTask(record, projects, snapshot.linkedProjectIds)?.id === input.projectId;
  });
  const scopedDecisions = snapshot.decisions.filter((record) => {
    if (record.status !== 'current') return false;
    if (!input.projectId) return true;
    return projectForTask(record, projects, snapshot.linkedProjectIds)?.id === input.projectId;
  });
  const learningExamples = snapshot.learningExamples;

  // --- Command wrappers and obvious non-task records ----------------------
  let cleanedTaskCount = 0;
  let questionableTaskCount = 0;
  if (
    input.scope === 'all' ||
    input.scope === 'tasks' ||
    input.scope === 'conversations' ||
    input.scope === 'projects'
  ) {
    for (const task of activeTasks
      .filter((task) => !wasRejectedAsFalseTask(task, learningExamples))
      .slice(0, 80)) {
      const project = projectForTask(task, projects, snapshot.linkedProjectIds);
      const payload = extractTaskPayload(task.title) || extractTaskPayload(task.content);
      if (payload) {
        const cleanedTitle = prepareTaskText(payload, project?.name || task.project).slice(0, 200);
        const cleanedContent = prepareTaskText(payload, project?.name || task.project).slice(
          0,
          4_000
        );
        if (
          cleanedTitle.length >= 4 &&
          (cleanedTitle !== task.title || cleanedContent !== task.content)
        ) {
          cleanedTaskCount += 1;
          add(
            draft({
              operation: 'update_task',
              entityType: 'task',
              entityId: task.id,
              project,
              title: `Очистить формулировку задачи «${task.title}»`,
              reason:
                'Заголовок содержит служебную команду вместо самого обязательства. Смысл задачи сохраняется, оболочка команды убирается.',
              expectedResult: `Задача остаётся активной с формулировкой «${cleanedTitle}»; исходный текст и источник сохраняются в истории.`,
              sourceRefs: sourceRefs(task),
              params: {
                taskId: task.id,
                patch: { title: cleanedTitle, content: cleanedContent },
                reason: 'command_wrapper',
              },
              beforeState: beforeState(task),
              confidence: 0.88,
              risk: 'reversible',
            })
          );
          continue;
        }
      }

      if (isJunkTask(task)) {
        questionableTaskCount += 1;
        add(
          draft({
            operation: 'archive_task',
            entityType: 'task',
            entityId: task.id,
            project,
            title: `Убрать из задач служебную запись «${task.title}»`,
            reason:
              'Запись является вопросом, командой Пьеро, автоматическим ответом или мета-репликой, а не конкретным незавершённым обязательством.',
            expectedResult: 'Задача архивируется с сохранением исходной записи и источника.',
            sourceRefs: sourceRefs(task),
            params: { taskId: task.id, reason: 'command_artifact' },
            beforeState: beforeState(task),
            confidence: 0.9,
            risk: 'confirmation',
          })
        );
      }
    }
  }

  // --- Task duplicates -----------------------------------------------------
  if (input.scope === 'all' || input.scope === 'tasks' || input.scope === 'projects') {
    for (let left = 0; left < activeTasks.length; left += 1) {
      for (let right = left + 1; right < activeTasks.length; right += 1) {
        const a = activeTasks[left];
        const b = activeTasks[right];
        if (a.id === b.id) continue;
        const aProject = projectForTask(a, projects, snapshot.linkedProjectIds);
        const bProject = projectForTask(b, projects, snapshot.linkedProjectIds);
        if (aProject?.id !== bProject?.id) continue;
        const aTitle = normalizeForComparison(a.title);
        const bTitle = normalizeForComparison(b.title);
        const aFull = normalizeForComparison(`${a.title} ${a.content}`);
        const bFull = normalizeForComparison(`${b.title} ${b.content}`);
        const exact =
          aTitle === bTitle &&
          normalizeForComparison(a.content) === normalizeForComparison(b.content);
        const score = lexicalSimilarity(aFull, bFull);
        if (!exact && !(aTitle === bTitle && score >= 0.92)) continue;

        const [keeper, duplicate] =
          Date.parse(a.createdAt) <= Date.parse(b.createdAt) ? [a, b] : [b, a];
        add(
          draft({
            operation: 'merge_tasks',
            entityType: 'task',
            entityId: keeper.id,
            project: aProject,
            title: `Объединить дубли задач «${keeper.title}»`,
            reason: exact
              ? 'Две активные задачи имеют одинаковый заголовок и содержание.'
              : 'Задачи имеют одинаковый заголовок и почти идентичное содержание.',
            expectedResult:
              'Одна задача остаётся активной; вторая помечается superseded со ссылкой на основную.',
            sourceRefs: [...sourceRefs(keeper), ...sourceRefs(duplicate)].slice(0, 8),
            params: { keeperId: keeper.id, duplicateIds: [duplicate.id] },
            beforeState: {
              keeper: beforeState(keeper),
              duplicates: [beforeState(duplicate)],
            },
            confidence: exact ? 0.97 : 0.88,
            risk: 'reversible',
          })
        );
      }
    }
  }

  // --- Tasks without a canonical project ----------------------------------
  if (input.scope === 'all' || input.scope === 'tasks' || input.scope === 'projects') {
    for (const task of activeTasks.slice(0, 80)) {
      const linked = snapshot.linkedProjectIds.get(task.id) || [];
      if (linked.length > 1) {
        const chosen =
          projectForTask(task, projects, snapshot.linkedProjectIds) ||
          projects.find((project) => linked.includes(project.id)) ||
          null;
        if (chosen) {
          add(
            draft({
              operation: 'move_task',
              entityType: 'task',
              entityId: task.id,
              project: chosen,
              title: `Оставить задачу «${task.title}» в одном проекте «${chosen.name}»`,
              reason: `Задача одновременно связана с ${linked.length} проектами. Канонический проект должен быть один.`,
              expectedResult: 'Остаётся одна проектная связь, история сохраняется.',
              sourceRefs: sourceRefs(task),
              params: { taskId: task.id, projectId: chosen.id },
              beforeState: beforeState(task),
              confidence: 0.75,
              risk: 'confirmation',
            })
          );
        } else {
          ambiguous.push(
            `Задача «${task.title}» связана с несколькими проектами; канонический проект не определён.`
          );
        }
        continue;
      }

      if (linked.length === 1) {
        if (!task.project) {
          const project = projectById.get(linked[0]) || null;
          if (project) {
            add(
              draft({
                operation: 'update_task',
                entityType: 'task',
                entityId: task.id,
                project,
                title: `Заполнить проект у задачи «${task.title}»`,
                reason:
                  'Задача имеет каноническую связь с проектом, но её отображаемое поле project пустое.',
                expectedResult: 'Метаданные приведены в соответствие с канонической связью.',
                sourceRefs: sourceRefs(task),
                params: { taskId: task.id, patch: { project: project.name } },
                beforeState: beforeState(task),
                confidence: 0.9,
                risk: 'safe',
              })
            );
          }
        }
        continue;
      }

      const mirrorProject = task.project
        ? projects.find(
            (project) =>
              project.name.toLowerCase() === task.project?.toLowerCase() ||
              project.slug.toLowerCase() === task.project?.toLowerCase()
          ) || null
        : null;
      const mentioned =
        mirrorProject || matchUniqueProjectMention(projects, `${task.title} ${task.content}`);
      if (mentioned) {
        add(
          draft({
            operation: 'link_project',
            entityType: 'task',
            entityId: task.id,
            project: mentioned,
            title: `Связать задачу «${task.title}» с проектом «${mentioned.name}»`,
            reason: mirrorProject
              ? 'Поле project уже содержит название существующего проекта, но каноническая связь отсутствует.'
              : 'В тексте задачи однозначно упомянут существующий проект, но каноническая связь отсутствует.',
            expectedResult: 'Задача появляется в проекте без создания дубликата.',
            sourceRefs: sourceRefs(task),
            params: { taskId: task.id, projectId: mentioned.id },
            beforeState: beforeState(task),
            confidence: mirrorProject ? 0.9 : 0.82,
            risk: 'reversible',
          })
        );
      } else if (!isJunkTask(task)) {
        ambiguous.push(
          task.project
            ? `Задача «${task.title}» указывает проект «${task.project}», которого нет среди существующих проектов.`
            : `Задача «${task.title}» не связана с проектом; проект не определяется однозначно.`
        );
      }
    }
  }

  // --- Misclassified tasks ------------------------------------------------
  if (
    input.scope === 'all' ||
    input.scope === 'tasks' ||
    input.scope === 'memory' ||
    input.scope === 'projects'
  ) {
    for (const task of activeTasks.slice(0, 80)) {
      const text = `${task.title} ${task.content}`;
      if (isJunkTask(task)) continue;
      if (wasRejectedAsFalseTask(task, learningExamples)) continue;
      const project = projectForTask(task, projects, snapshot.linkedProjectIds);
      if (CONSTRAINT_PATTERN.test(text)) {
        add(
          draft({
            operation: 'reclassify_task',
            entityType: 'task',
            entityId: task.id,
            project,
            title: `Перенести «${task.title}» из задач в правила проекта`,
            reason:
              'Формулировка описывает ограничение или правило, а не конкретное поручение на выполнение.',
            expectedResult:
              'Запись остаётся в памяти как constraint; исходный текст и источники сохраняются.',
            sourceRefs: sourceRefs(task),
            params: { taskId: task.id, kind: 'constraint' },
            beforeState: beforeState(task),
            confidence: 0.78,
            risk: 'confirmation',
          })
        );
      } else if (IDEA_PATTERN.test(text) && !CONCRETE_ENGINEERING_PATTERN.test(text)) {
        add(
          draft({
            operation: 'reclassify_task',
            entityType: 'task',
            entityId: task.id,
            project,
            title: `Оставить «${task.title}» как идею, а не активную задачу`,
            reason:
              'Формулировка является идеей или гипотезой без конкретного следующего действия.',
            expectedResult:
              'Идея сохраняется как saved/idea и больше не выглядит активной задачей.',
            sourceRefs: sourceRefs(task),
            params: { taskId: task.id, kind: 'saved', tags: ['idea'] },
            beforeState: beforeState(task),
            confidence: 0.75,
            risk: 'confirmation',
          })
        );
      }
    }
  }

  // --- Stale tasks ---------------------------------------------------------
  if (input.scope === 'all' || input.scope === 'tasks' || input.scope === 'projects') {
    const now = Date.now();
    for (const task of activeTasks) {
      const updated = Date.parse(task.updatedAt);
      const due = task.reviewAt ? Date.parse(task.reviewAt) : Number.NaN;
      const overdue = Number.isFinite(due) && due < now;
      const stale = Number.isFinite(updated) && now - updated > 180 * 24 * 60 * 60 * 1000;
      if (!overdue && !stale) continue;
      const project = projectForTask(task, projects, snapshot.linkedProjectIds);
      add(
        draft({
          operation: 'archive_task',
          entityType: 'task',
          entityId: task.id,
          project,
          title: `Проверить устаревшую задачу «${task.title}»`,
          reason: overdue
            ? `Срок задачи прошёл: ${task.reviewAt?.slice(0, 10)}.`
            : 'Задача не обновлялась более 180 дней.',
          expectedResult:
            'После подтверждения задача уходит в архив; при необходимости её можно восстановить.',
          sourceRefs: sourceRefs(task),
          params: { taskId: task.id, reason: overdue ? 'overdue' : 'stale' },
          beforeState: beforeState(task),
          confidence: 0.65,
          risk: 'confirmation',
        })
      );
    }
  }

  // --- GitHub reconciliation ----------------------------------------------
  const githubTaskById = new Map(snapshot.tasks.map((task) => [task.id, task]));
  if (
    input.scope === 'all' ||
    input.scope === 'github' ||
    input.scope === 'tasks' ||
    input.scope === 'projects'
  ) {
    for (const result of snapshot.githubResults) {
      const task = githubTaskById.get(result.taskId);
      if (!task) continue;
      const project = projectForTask(task, projects, snapshot.linkedProjectIds);
      const issueRef: GroomingSourceRef = {
        type: 'github_issue',
        id: `${result.repository}#${result.issueNumber}`,
        title: `Issue #${result.issueNumber}`,
        url: result.issueUrl,
        metadata: {
          state: result.issueState,
          result: result.result,
          pullRequests: result.pullRequests,
        },
      };

      if (result.result === 'confirmed_done' && task.status === 'current') {
        add(
          draft({
            operation: 'complete_task',
            entityType: 'task',
            entityId: task.id,
            project,
            title: `Отметить задачу «${task.title}» выполненной по GitHub`,
            reason: `${result.reason} ${result.repositoryFullName}#${result.issueNumber}.`,
            expectedResult:
              'Задача получает статус completed; ссылка на Issue и merged PR сохраняется в журнале.',
            sourceRefs: [issueRef, ...sourceRefs(task)].slice(0, 6),
            params: {
              taskId: task.id,
              evidence: 'github_confirmed_done',
              repository: result.repository,
              issueNumber: result.issueNumber,
              issueUrl: result.issueUrl,
              pullRequests: result.pullRequests,
            },
            beforeState: beforeState(task),
            confidence: 0.92,
            risk: 'reversible',
          })
        );
      } else if (
        result.result === 'partially_implemented' ||
        result.result === 'needs_verification'
      ) {
        ambiguous.push(
          `GitHub: «${task.title}» — ${result.reason} (${result.repositoryFullName}#${result.issueNumber}).`
        );
      } else if (result.result === 'not_found') {
        if (result.alternativeIssue) {
          add(
            draft({
              operation: 'link_github_issue',
              entityType: 'task',
              entityId: task.id,
              project,
              title: `Исправить GitHub-связь задачи «${task.title}»`,
              reason: `Сохранённая Issue #${result.issueNumber} не найдена. Найдено вероятное совпадение #${result.alternativeIssue.number}.`,
              expectedResult:
                'Локальная задача связывается с проверенной Issue после подтверждения.',
              sourceRefs: [
                issueRef,
                {
                  type: 'github_issue',
                  id: `${result.repository}#${result.alternativeIssue.number}`,
                  title: result.alternativeIssue.title,
                  url: result.alternativeIssue.url,
                  metadata: { score: result.alternativeIssue.score, alternative: true },
                },
              ],
              params: {
                taskId: task.id,
                repository: result.repository,
                issueNumber: result.alternativeIssue.number,
                issueUrl: result.alternativeIssue.url,
              },
              beforeState: beforeState(task),
              confidence: 0.7,
              risk: 'confirmation',
            })
          );
        } else {
          ambiguous.push(
            `GitHub: Issue #${result.issueNumber} для «${task.title}» не найдена. Архивация без проверки не предлагается.`
          );
        }
      } else if (result.result === 'sync_error') {
        ambiguous.push(`GitHub: не удалось проверить «${task.title}»; задача не изменена.`);
      }
    }

    // Create issues only for concrete engineering tasks with a real repository.
    const linkedTaskIds = new Set(snapshot.githubResults.map((result) => result.taskId));
    for (const task of activeTasks.slice(0, 60)) {
      if (linkedTaskIds.has(task.id)) continue;
      if (extractGithubLink(task)) continue;
      if (!looksEngineering(task)) continue;
      const context = resolveTaskProjectContext(task, projects);
      if (!context) continue;
      const project = projectForTask(task, projects, snapshot.linkedProjectIds);
      const title = task.title.replace(/\s+/g, ' ').trim().slice(0, 120);
      if (title.length < 8) continue;
      add(
        draft({
          operation: 'create_issue',
          entityType: 'task',
          entityId: task.id,
          project,
          title: `Создать GitHub Issue для задачи «${task.title}»`,
          reason: `Задача является конкретной инженерной работой и относится к ${context.label}; Issue ещё не связано.`,
          expectedResult:
            'В подключённом репозитории создаётся Issue, локальная задача получает связь и URL.',
          sourceRefs: sourceRefs(task),
          params: {
            taskId: task.id,
            repository: context.repository,
            title,
            body: [
              task.content || task.title,
              '',
              `Локальная задача: ${task.id}`,
              project ? `Проект: ${project.name}` : null,
              '',
              'Acceptance criteria:',
              `- [ ] ${task.title}`,
              '- [ ] Проверка результата описана в PR или комментарии.',
            ]
              .filter(Boolean)
              .join('\n')
              .slice(0, 20_000),
            labels: ['pierrot-grooming', context.key],
          },
          beforeState: beforeState(task),
          confidence: 0.68,
          risk: 'confirmation',
        })
      );
    }
  }

  // --- Materials -----------------------------------------------------------
  if (
    input.scope === 'all' ||
    input.scope === 'projects' ||
    input.scope === 'conversations' ||
    input.scope === 'context'
  ) {
    for (const material of snapshot.materialCandidates.slice(0, 20)) {
      const project = projectById.get(material.projectId) || null;
      add(
        draft({
          operation: 'create_artifact',
          entityType: 'project',
          entityId: material.projectId,
          project,
          title: `Сохранить материал «${material.title}»`,
          reason: 'В истории проекта найдена ссылка, которая ещё не связана с материалами проекта.',
          expectedResult: 'Ссылка сохраняется как материал проекта с исходным URL и источником.',
          sourceRefs: [
            {
              type: 'conversation_message',
              id: material.sourceMessageId,
              title: material.title,
              url: material.url,
              createdAt: material.createdAt,
            },
            {
              type: 'project',
              id: material.projectId,
              title: material.projectName,
            },
          ],
          params: {
            projectId: material.projectId,
            url: material.url,
            title: material.title,
            artifactType: material.artifactType,
            conversationId: material.conversationId,
          },
          beforeState: {},
          confidence: 0.84,
          risk: 'reversible',
        })
      );
    }
  }

  // --- Memory duplicates and classification --------------------------------
  const memoryByKind = new Map<string, PierrotMemoryRecord[]>();
  for (const record of [...memoryList, ...scopedDecisions]) {
    const list = memoryByKind.get(record.kind) || [];
    list.push(record);
    memoryByKind.set(record.kind, list);
  }

  if (input.scope === 'all' || input.scope === 'memory') {
    for (const records of memoryByKind.values()) {
      for (let left = 0; left < records.length; left += 1) {
        for (let right = left + 1; right < records.length; right += 1) {
          const a = records[left];
          const b = records[right];
          const aTitle = normalizeForComparison(a.title);
          const bTitle = normalizeForComparison(b.title);
          const aFull = normalizeForComparison(`${a.title} ${a.content}`);
          const bFull = normalizeForComparison(`${b.title} ${b.content}`);
          const exact =
            aTitle === bTitle &&
            normalizeForComparison(a.content) === normalizeForComparison(b.content);
          const score = lexicalSimilarity(aFull, bFull);
          if (exact || score >= 0.94) {
            const [keeper, duplicate] =
              Date.parse(a.createdAt) <= Date.parse(b.createdAt) ? [a, b] : [b, a];
            add(
              draft({
                operation: 'merge_memory',
                entityType: 'memory',
                entityId: keeper.id,
                project: projectForTask(keeper, projects, snapshot.linkedProjectIds),
                title: `Объединить дубли памяти «${keeper.title}»`,
                reason: exact
                  ? 'Две активные записи памяти полностью совпадают.'
                  : 'Записи памяти почти совпадают по смыслу и типу.',
                expectedResult:
                  'Остаётся одна активная запись; дубликат помечается superseded со ссылкой.',
                sourceRefs: [...sourceRefs(keeper), ...sourceRefs(duplicate)].slice(0, 8),
                params: { keeperId: keeper.id, duplicateIds: [duplicate.id] },
                beforeState: {
                  keeper: beforeState(keeper),
                  duplicates: [beforeState(duplicate)],
                },
                confidence: exact ? 0.96 : 0.82,
                risk: 'reversible',
              })
            );
            continue;
          }
          if (score >= 0.5 && NEGATION.test(aFull) !== NEGATION.test(bFull)) {
            add(
              draft({
                operation: 'update_memory',
                entityType: 'memory',
                entityId: a.id,
                project: projectForTask(a, projects, snapshot.linkedProjectIds),
                title: `Пометить противоречие между «${a.title}» и «${b.title}»`,
                reason:
                  'Записи похожи по теме, но содержат противоположный смысл. Автоматически выбирать победителя нельзя.',
                expectedResult:
                  'Запись помечается uncertain; обе версии сохраняются для решения владельца.',
                sourceRefs: [...sourceRefs(a), ...sourceRefs(b)].slice(0, 8),
                params: { memoryId: a.id, patch: { status: 'uncertain' } },
                beforeState: beforeState(a),
                confidence: 0.7,
                risk: 'confirmation',
              })
            );
          }
        }
      }
    }

    for (const record of memoryList) {
      if (
        record.kind !== 'memory' &&
        record.kind !== 'preference' &&
        record.kind !== 'constraint' &&
        record.kind !== 'decision'
      ) {
        continue;
      }
      if (!TEMPORARY_PATTERN.test(`${record.title} ${record.content}`)) continue;
      add(
        draft({
          operation: 'reclassify_memory',
          entityType: 'memory',
          entityId: record.id,
          project: projectForTask(record, projects, snapshot.linkedProjectIds),
          title: `Перевести «${record.title}» из постоянной памяти во временную заметку`,
          reason:
            'Формулировка содержит временное обстоятельство, но запись хранится как постоянный факт или правило.',
          expectedResult: 'Запись сохраняется как saved; исходные источники и текст не удаляются.',
          sourceRefs: sourceRefs(record),
          params: { memoryId: record.id, kind: 'saved' },
          beforeState: beforeState(record),
          confidence: 0.74,
          risk: 'confirmation',
        })
      );
    }

    const now = Date.now();
    for (const record of memoryList.filter((item) => item.kind === 'preference')) {
      const updated = Date.parse(record.updatedAt);
      if (!Number.isFinite(updated) || now - updated < 180 * 24 * 60 * 60 * 1000) continue;
      add(
        draft({
          operation: 'archive_memory',
          entityType: 'memory',
          entityId: record.id,
          project: projectForTask(record, projects, snapshot.linkedProjectIds),
          title: `Проверить устаревшее предпочтение «${record.title}»`,
          reason: 'Предпочтение не обновлялось более 180 дней и может быть устаревшим.',
          expectedResult:
            'После подтверждения запись уходит в архив с возможностью восстановления.',
          sourceRefs: sourceRefs(record),
          params: { memoryId: record.id, reason: 'stale_preference' },
          beforeState: beforeState(record),
          confidence: 0.6,
          risk: 'confirmation',
        })
      );
    }

    // Decisions accidentally stored as tasks are already covered by
    // reclassify_task above. Facts that belong to specialist systems are only
    // reported, never silently moved into another table.
    for (const record of memoryList) {
      if (
        /(?:съел|выпил|кофе|еда|напит|калори|food|drink|intake)/iu.test(
          `${record.title} ${record.content}`
        )
      ) {
        ambiguous.push(
          `Запись памяти «${record.title}» похожа на данные Food Tracker; автоматический перенос в intake_logs не выполняется.`
        );
      }
    }
  }

  // --- Project context / summary ------------------------------------------
  if (input.scope === 'all' || input.scope === 'projects' || input.scope === 'context') {
    for (const project of projects.slice(0, 50)) {
      const projectTasks = activeTasks.filter(
        (task) => projectForTask(task, projects, snapshot.linkedProjectIds)?.id === project.id
      );
      const projectDecisions = scopedDecisions.filter(
        (record) => projectForTask(record, projects, snapshot.linkedProjectIds)?.id === project.id
      );
      if (
        !project.projectBrief.trim() &&
        (projectTasks.length > 0 || projectDecisions.length > 0)
      ) {
        add(
          draft({
            operation: 'update_project_context',
            entityType: 'project',
            entityId: project.id,
            project,
            title: `Заполнить бриф проекта «${project.name}»`,
            reason:
              'У проекта есть задачи или решения, но проверенный бриф пуст. Без него модель теряет контекст.',
            expectedResult: 'Бриф получает новую ревизию; предыдущие данные и история сохраняются.',
            sourceRefs: [
              { type: 'project' as const, id: project.id, title: project.name },
              ...projectTasks.slice(0, 3).flatMap(sourceRefs),
              ...projectDecisions.slice(0, 3).flatMap(sourceRefs),
            ].slice(0, 8),
            params: {
              projectId: project.id,
              projectBrief: generatedProjectBrief(project, projectTasks, projectDecisions),
              changeNote: 'Prepared by workspace grooming audit',
            },
            beforeState: {
              id: project.id,
              projectBrief: project.projectBrief,
              briefRevision: project.briefRevision,
              updatedAt: project.updatedAt,
            },
            confidence: 0.68,
            risk: 'confirmation',
          })
        );
      }
      if (!project.conversationId) {
        ambiguous.push(
          `Проект «${project.name}» не имеет канонического чата. Grooming не создаёт новый чат автоматически.`
        );
      }
    }
  }

  // --- Context summaries ---------------------------------------------------
  if (
    input.scope === 'all' ||
    input.scope === 'context' ||
    input.scope === 'conversations' ||
    input.scope === 'projects'
  ) {
    const projectConversationIds = new Set(
      projects.map((project) => project.conversationId).filter(Boolean)
    );
    const candidates = input.projectId
      ? snapshot.summaryCandidates.filter((candidate) =>
          projectConversationIds.has(candidate.conversationId)
        )
      : snapshot.summaryCandidates;
    for (const candidate of candidates.slice(0, 12)) {
      const existing = candidate.summary;
      const project =
        projects.find((item) => item.conversationId === candidate.conversationId) || null;
      add(
        draft({
          operation: existing ? 'update_context_summary' : 'create_context_summary',
          entityType: 'conversation',
          entityId: candidate.conversationId,
          project,
          title: `${existing ? 'Обновить' : 'Создать'} резюме диалога «${candidate.title}»`,
          reason: existing
            ? `Резюме устарело; объём диалога ${candidate.messageCount} сообщений / ${candidate.charCount} символов.`
            : `У диалога нет резюме; объём ${candidate.messageCount} сообщений / ${candidate.charCount} символов.`,
          expectedResult:
            'Создаётся новая версия резюме; оригинальные сообщения и предыдущие версии сохраняются.',
          sourceRefs: [
            {
              type: 'context_summary',
              id: existing ? candidate.summaryGeneratedAt : null,
              title: candidate.title,
              metadata: {
                conversationId: candidate.conversationId,
                messageCount: candidate.messageCount,
                charCount: candidate.charCount,
              },
            },
          ],
          params: { conversationId: candidate.conversationId },
          beforeState: {
            conversationId: candidate.conversationId,
            summaryGeneratedAt: candidate.summaryGeneratedAt,
            messageCount: candidate.messageCount,
          },
          confidence: 0.85,
          risk: 'safe',
        })
      );
    }
  }

  if (snapshot.githubErrors.length > 0) {
    warnings.push(`GitHub errors: ${snapshot.githubErrors.length}.`);
  }

  const scopedConversations = input.projectId
    ? snapshot.conversations.filter((conversation) => conversation.projectId === input.projectId)
    : snapshot.conversations;
  const contradictionCount = ambiguous.filter((item) => /^Противоречие/iu.test(item)).length;

  const summary: GroomingAuditSummary = {
    messageCount: scopedConversations.reduce(
      (sum, conversation) => sum + (conversation.messageCount || 0),
      0
    ),
    taskCount: taskList.length,
    memoryCount: memoryList.length + scopedDecisions.length,
    projectCount: projects.length,
    githubLinkCount: snapshot.githubResults.length,
    githubErrorCount: snapshot.githubErrors.length,
    staleSummaryCount: snapshot.summaryCandidates.length,
    duplicateCandidates: proposals.filter(
      (proposal) => proposal.operation === 'merge_tasks' || proposal.operation === 'merge_memory'
    ).length,
    ambiguousCount: ambiguous.length,
    sourceMessageCount: scopedConversations.reduce(
      (sum, conversation) => sum + (conversation.messageCount || 0),
      0
    ),
    conversationCount: scopedConversations.length,
    openTaskCount: activeTasks.length,
    questionableTaskCount,
    decisionCount: scopedDecisions.length,
    materialCount: snapshot.materialCandidates.length,
    contradictionCount,
    cleanedTaskCount,
  };

  return { proposals, warnings, ambiguous, summary };
}
