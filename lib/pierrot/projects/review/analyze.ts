import type { ProjectHistoryMessage } from '../history';
import { lexicalSimilarity, normalizeForComparison } from '@/lib/pierrot/memory/similarity';

export type ReviewExistingTask = {
  id: string;
  title: string;
  content: string;
  status: string;
  createdAt?: string | null;
};

export type ReviewExistingDecision = {
  id: string;
  title: string;
  content: string;
  status: string;
  kind: string;
};

export type ReviewExistingMaterial = {
  id: string;
  title: string;
  url: string | null;
};

export type ReviewCandidate = {
  title: string;
  content: string;
  sourceMessageId: string;
  sourceMessageIndex: number;
  sourceCreatedAt: string | null;
  tags: string[];
};

export type ReviewMaterialCandidate = ReviewCandidate & {
  url: string;
  artifactType: string;
};

export type ReviewCompletionCandidate = {
  taskId: string;
  taskTitle: string;
  sourceMessageId: string;
  evidence: string;
};

export type ReviewDuplicateGroup = {
  taskIds: string[];
  title: string;
  reason: string;
  /** Only exact duplicates are safe for automatic reversible merge. */
  exact: boolean;
};

export type ReviewContradiction = {
  leftId: string;
  leftTitle: string;
  rightId: string;
  rightTitle: string;
  reason: string;
};

export type ProjectReviewAnalysis = {
  tasks: ReviewCandidate[];
  ideas: ReviewCandidate[];
  decisions: ReviewCandidate[];
  materials: ReviewMaterialCandidate[];
  openQuestions: ReviewCandidate[];
  completions: ReviewCompletionCandidate[];
  duplicateGroups: ReviewDuplicateGroup[];
  contradictions: ReviewContradiction[];
  ambiguousTaskCandidates: ReviewCandidate[];
  ideaLikeTasks: Array<{ id: string; title: string; reason: string }>;
};

const TASK_VERB =
  /(?:^|[\s,;:])(?:сделай|сделать|добавь|добавить|исправь|исправить|проверь|проверить|напиши|написать|создай|создать|запусти|запустить|опубликуй|опубликовать|свяжись|связаться|обнови|обновить|перенеси|перенести|убери|убрать|настрой|настроить|собери|собрать|доделай|доделать|подготовь|подготовить|проведи|провести|(?:i|we)\s+(?:need to|should|must|have to)|please\s+(?:add|fix|check|write|create|update|publish|prepare))(?:\s|$)/iu;

const OBLIGATION =
  /(?:^|[\s,;:])(?:нужно|надо|необходимо|следует|обязательно|должны|должен|have to|need to|should|must)(?:\s|$)/iu;

const IDEA =
  /(?:^|[\s(])(?:идея|идею|идеи|мысль|предложени[ея]|а\s+что\s+если|можно\s+было\s+бы|хотелось\s+бы|стоит\s+попробовать|вариант|концепци[яю]|idea|what\s+if|maybe\s+we\s+could)(?:\s|[:.,(]|$)/iu;

const DECISION =
  /(?:^|[\s,;:])(?:решили|порешили|решение|договорились|выбираем|выбрали|утверждаю|утвердили|фиксирую|фиксируем|останавливаемся|идём\s+с|идем\s+с|берём|берем|будем\s+использовать|отменяем|отменить|отказались|не\s+будем|передумали|decided|we\s+will\s+use|we\s+chose|approved|let'?s\s+go\s+with|cancel)(?:\s|[:.,;]|$)/iu;

const HYPOTHESIS =
  /(?:может\s+быть|возможно|наверное|вероятно|предлагаю|предложение|что\s+если|хотелось\s+бы|стоит\s+подумать|maybe|perhaps|might|could|proposal|suggest)/iu;

const COMPLETION =
  /(?:^|[\s,;:])(?:готово|сделано|сделал|сделала|завершил|завершила|выполнено|закрыл|закрыла|done|completed|finished)(?:\s|[:.,;!?]|$)/iu;

const OPEN_QUESTION =
  /(?:^|[\s,;:])(?:вопрос|надо\s+решить|нужно\s+решить|требует\s+решения|осталось\s+решить|не\s+решено|открытый\s+вопрос)(?:\s|[:.,;]|$)/iu;

const META_COMMAND =
  /(?:наведи\s+(?:всё\s+|все\s+)?(?:в\s+)?порядок|разбери\s+проект|ревизи[яю]\s+проекта|аудит\s+проекта|tidy\s+up\s+(?:the\s+)?project|audit\s+(?:the\s+)?project)/iu;

const EXPLICIT_TASK_COMMAND =
  /^(?:задача|task)\s*[:—-]|(?:добавь|создай|поставь|заведи)\s+(?:новую\s+)?задачу/iu;

const NEGATION = /(?:^|[\s(])(?:не|нет|без|никогда|отмен\w*|отказ\w*|против|not|never|cancel\w*|reject\w*)(?:\s|$)/iu;

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/^[\s:—–,.-]+/, '').replace(/[\s,;:]+$/, '').trim();
}

function sentences(content: string): string[] {
  return content
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/u)
    .map(clean)
    .filter((value) => value.length >= 4);
}

function titleFrom(value: string): string {
  const cleanValue = clean(value);
  const first = cleanValue.split(/[.!?]\s/)[0] || cleanValue;
  return (first.length > 180 ? `${first.slice(0, 177).trimEnd()}…` : first).slice(0, 200);
}

function isQuestion(value: string): boolean {
  return /\?/u.test(value) || OPEN_QUESTION.test(value);
}

function tagsFor(value: string): string[] {
  const tags = ['project-review'];
  if (IDEA.test(value)) tags.push('idea');
  if (DECISION.test(value)) tags.push('decision');
  return tags;
}

function candidateFor(
  message: ProjectHistoryMessage,
  sentence: string,
  tags: string[]
): ReviewCandidate {
  return {
    title: titleFrom(sentence),
    content: clean(sentence).slice(0, 4_000),
    sourceMessageId: message.id,
    sourceMessageIndex: message.messageIndex,
    sourceCreatedAt: message.createdAt,
    tags,
  };
}

function sameCandidate(left: ReviewCandidate, right: ReviewCandidate): boolean {
  return (
    normalizeForComparison(left.title) === normalizeForComparison(right.title) ||
    normalizeForComparison(left.content) === normalizeForComparison(right.content)
  );
}

function pushUnique(list: ReviewCandidate[], candidate: ReviewCandidate): void {
  if (list.some((existing) => sameCandidate(existing, candidate))) return;
  list.push(candidate);
}

function extractUrls(value: string): string[] {
  return Array.from(
    new Set(
      (value.match(/https?:\/\/[^\s<>"')]+/giu) || []).map((url) =>
        url.replace(/[.,;:!?]+$/g, '')
      )
    )
  );
}

function artifactType(url: string): string {
  if (/\.(?:png|jpe?g|gif|webp|svg|avif)(?:\?|$)/i.test(url)) return 'image';
  if (/\.(?:mp4|mov|webm|avi)(?:\?|$)/i.test(url)) return 'video';
  if (/\.(?:pdf|docx?|xlsx?|pptx?)(?:\?|$)/i.test(url)) return 'document';
  if (/(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(url)) return 'video';
  return 'link';
}

function materialTitle(sentence: string, url: string): string {
  const withoutUrl = clean(sentence.replace(url, '')).replace(/[:—–-]+$/g, '').trim();
  if (withoutUrl.length >= 4) return titleFrom(withoutUrl);
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 180);
  }
}

function taskIsExisting(candidate: ReviewCandidate, existing: ReviewExistingTask[]): boolean {
  const normalized = normalizeForComparison(`${candidate.title} ${candidate.content}`);
  for (const task of existing) {
    const other = normalizeForComparison(`${task.title} ${task.content}`);
    if (normalized === other) return true;
    if (lexicalSimilarity(normalized, other) >= 0.9) return true;
  }
  return false;
}

function duplicateGroups(existing: ReviewExistingTask[]): ReviewDuplicateGroup[] {
  const groups: ReviewDuplicateGroup[] = [];
  const active = existing.filter((task) => task.status === 'current' || task.status === 'uncertain');

  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      const a = active[left];
      const b = active[right];
      const aTitle = normalizeForComparison(a.title);
      const bTitle = normalizeForComparison(b.title);
      const aFull = normalizeForComparison(`${a.title} ${a.content}`);
      const bFull = normalizeForComparison(`${b.title} ${b.content}`);
      const exact = aTitle === bTitle && normalizeForComparison(a.content) === normalizeForComparison(b.content);
      const score = lexicalSimilarity(aFull, bFull);
      if (!exact && !(aTitle === bTitle && score >= 0.92)) continue;

      groups.push({
        taskIds: [a.id, b.id],
        title: a.title,
        reason: exact
          ? 'Точное совпадение заголовка и содержания.'
          : 'Одинаковый заголовок и почти идентичное содержание.',
        exact,
      });
    }
  }

  return groups;
}

function contradictionPairs(
  decisions: ReviewExistingDecision[],
  candidates: ReviewCandidate[]
): ReviewContradiction[] {
  const all = [
    ...decisions
      .filter((decision) => decision.kind === 'decision' || decision.kind === 'position')
      .map((decision) => ({
        id: decision.id,
        title: decision.title,
        text: `${decision.title} ${decision.content}`,
      })),
    ...candidates.map((candidate) => ({
      id: `candidate:${candidate.sourceMessageId}:${candidate.title}`,
      title: candidate.title,
      text: `${candidate.title} ${candidate.content}`,
    })),
  ];

  const found: ReviewContradiction[] = [];
  for (let left = 0; left < all.length; left += 1) {
    for (let right = left + 1; right < all.length; right += 1) {
      const a = all[left];
      const b = all[right];
      const score = lexicalSimilarity(a.text, b.text);
      if (score < 0.42) continue;
      if (NEGATION.test(a.text) === NEGATION.test(b.text)) continue;
      found.push({
        leftId: a.id,
        leftTitle: a.title,
        rightId: b.id,
        rightTitle: b.title,
        reason: `Похожие формулировки с противоположным смыслом (сходство ${score.toFixed(2)}).`,
      });
    }
  }

  return found.slice(0, 12);
}

function completionCandidates(
  messages: ProjectHistoryMessage[],
  tasks: ReviewExistingTask[]
): ReviewCompletionCandidate[] {
  const result: ReviewCompletionCandidate[] = [];
  const current = tasks.filter((task) => task.status === 'current');

  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const sentence of sentences(message.content)) {
      if (!COMPLETION.test(sentence)) continue;

      const scored = current
        .filter((task) => {
          if (!task.createdAt || !message.createdAt) return true;
          const taskTime = Date.parse(task.createdAt);
          const messageTime = Date.parse(message.createdAt);
          if (!Number.isFinite(taskTime) || !Number.isFinite(messageTime)) return true;
          // A completion statement from before the task existed cannot close it.
          return messageTime >= taskTime;
        })
        .map((task) => {
          const title = normalizeForComparison(task.title);
          const text = normalizeForComparison(sentence);
          const contained = text.includes(title) && title.length >= 8;
          return {
            task,
            score: contained ? 1 : lexicalSimilarity(text, normalizeForComparison(`${task.title} ${task.content}`)),
          };
        })
        .sort((left, right) => right.score - left.score);

      if (scored.length === 0) continue;
      const best = scored[0];
      const second = scored[1];
      if (best.score < 0.82) continue;
      if (second && best.score - second.score < 0.1) continue;
      if (result.some((item) => item.taskId === best.task.id)) continue;

      result.push({
        taskId: best.task.id,
        taskTitle: best.task.title,
        sourceMessageId: message.id,
        evidence: sentence.slice(0, 500),
      });
    }
  }

  return result;
}

function ideaLikeTasks(existing: ReviewExistingTask[]): Array<{ id: string; title: string; reason: string }> {
  return existing
    .filter((task) => task.status === 'current')
    .filter(
      (task) =>
        IDEA.test(`${task.title} ${task.content}`) &&
        !TASK_VERB.test(`${task.title} ${task.content}`) &&
        !OBLIGATION.test(`${task.title} ${task.content}`)
    )
    .map((task) => ({
      id: task.id,
      title: task.title,
      reason: 'Похоже на идею без конкретного обязательства; не закрываю и не удаляю автоматически.',
    }))
    .slice(0, 20);
}

export function analyzeProjectReview(input: {
  messages: ProjectHistoryMessage[];
  existingTasks: ReviewExistingTask[];
  existingDecisions: ReviewExistingDecision[];
  existingMaterials: ReviewExistingMaterial[];
}): ProjectReviewAnalysis {
  const tasks: ReviewCandidate[] = [];
  const ideas: ReviewCandidate[] = [];
  const decisions: ReviewCandidate[] = [];
  const materials: ReviewMaterialCandidate[] = [];
  const openQuestions: ReviewCandidate[] = [];
  const ambiguousTaskCandidates: ReviewCandidate[] = [];
  const seenUrls = new Set(
    input.existingMaterials
      .map((material) => material.url)
      .filter((url): url is string => Boolean(url))
      .map((url) => url.toLocaleLowerCase())
  );

  for (const message of input.messages) {
    if (message.role !== 'user') continue;

    for (const url of extractUrls(message.content)) {
      const key = url.toLocaleLowerCase();
      if (seenUrls.has(key)) continue;
      seenUrls.add(key);
      materials.push({
        title: materialTitle(message.content, url),
        content: url,
        url,
        artifactType: artifactType(url),
        sourceMessageId: message.id,
        sourceMessageIndex: message.messageIndex,
        sourceCreatedAt: message.createdAt,
        tags: ['project-review', 'material', artifactType(url)],
      });
    }

    for (const sentence of sentences(message.content)) {
      if (META_COMMAND.test(sentence)) continue;

      if (isQuestion(sentence)) {
        pushUnique(openQuestions, candidateFor(message, sentence, ['project-review', 'open-question']));
        continue;
      }

      const decisionLike = DECISION.test(sentence);
      const ideaLike = IDEA.test(sentence);
      const explicitTask = TASK_VERB.test(sentence);
      const obligation = OBLIGATION.test(sentence);

      // A decision must be an owner statement, never a hypothesis, proposal or
      // a question. Assistant messages never reach this branch.
      if (decisionLike && !HYPOTHESIS.test(sentence) && !ideaLike) {
        pushUnique(decisions, candidateFor(message, sentence, tagsFor(sentence)));
        continue;
      }

      // Ideas stay ideas. They are stored as notes, never as tasks, even when
      // the wording contains "можно сделать" or "хотелось бы". Only an
      // explicit task command ("добавь задачу …", "задача: …") overrides this.
      if (ideaLike && !EXPLICIT_TASK_COMMAND.test(sentence)) {
        pushUnique(ideas, candidateFor(message, sentence, tagsFor(sentence)));
        continue;
      }

      if (explicitTask || obligation) {
        const candidate = candidateFor(message, sentence, tagsFor(sentence));
        if (taskIsExisting(candidate, input.existingTasks)) continue;

        // "Надо обсудить", "нужно решить" are open questions, not executable
        // tasks until the owner names a concrete next action.
        if (
          /(?:обсудить|обсуждать|подумать|решить|уточнить|выяснить|понять|discuss|think|clarify|decide)/iu.test(
            sentence
          ) &&
          !/(?:напиши|подготовь|проверь|создай|исправь|добавь|опубликуй|write|prepare|check|create|fix|add|publish)/iu.test(
            sentence
          )
        ) {
          pushUnique(ambiguousTaskCandidates, candidate);
          pushUnique(openQuestions, candidateFor(message, sentence, ['project-review', 'open-question']));
          continue;
        }

        pushUnique(tasks, candidate);
      }
    }
  }

  return {
    tasks,
    ideas,
    decisions,
    materials,
    openQuestions,
    completions: completionCandidates(input.messages, input.existingTasks),
    duplicateGroups: duplicateGroups(input.existingTasks),
    contradictions: contradictionPairs(input.existingDecisions, decisions),
    ambiguousTaskCandidates,
    ideaLikeTasks: ideaLikeTasks(input.existingTasks),
  };
}
