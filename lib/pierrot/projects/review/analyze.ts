import type { ProjectHistoryMessage } from '../history';
import { lexicalSimilarity, normalizeForComparison } from '@/lib/pierrot/memory/similarity';
import { learnedClassification, type TaskExperienceExample } from '@/lib/pierrot/learning/types';

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

export type ReviewClassification =
  | 'task'
  | 'reminder'
  | 'decision'
  | 'knowledge'
  | 'idea'
  | 'instruction'
  | 'reference'
  | 'question'
  | 'completion'
  | 'ambiguous'
  | 'ignore';

export type ProjectReviewAnalysis = {
  tasks: ReviewCandidate[];
  reminders: ReviewCandidate[];
  ideas: ReviewCandidate[];
  decisions: ReviewCandidate[];
  knowledge: ReviewCandidate[];
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
  /(?:^|[\s(])(?:идея|идею|идеи|мысль|предложени[ея]|а\s+что\s+если|можно\s+было\s+бы|хотелось\s+бы|стоит\s+попробовать|вариант|концепци[яю]|давай\s+(?:как-нибудь|когда-нибудь|потом)|когда-нибудь\s+(?:подума|сдела|попробу)|idea|what\s+if|maybe\s+we\s+could)(?:\s|[:.,(]|$)/iu;

const DECISION =
  /(?:^|[\s,;:])(?:решили|порешили|решение|договорились|выбираем|выбрали|утверждаю|утвердили|фиксирую|фиксируем|останавливаемся|идём\s+с|идем\s+с|берём|берем|будем\s+использовать|отменяем|отменить|отказались|не\s+будем|передумали|decided|we\s+will\s+use|we\s+chose|approved|let'?s\s+go\s+with|cancel)(?:\s|[:.,;]|$)/iu;

const HYPOTHESIS =
  /(?:может\s+быть|возможно|наверное|вероятно|предлагаю|предложение|что\s+если|хотелось\s+бы|стоит\s+подумать|когда-нибудь|как-нибудь|maybe|perhaps|might|could|proposal|suggest)/iu;

const COMPLETION =
  /(?:^|[\s,;:])(?:готово|сделано|сделал|сделала|завершил|завершила|выполнено|закрыл|закрыла|исправил|исправила|исправлено|починил|починила|done|completed|finished|fixed)(?:\s|[:.,;!?]|$)/iu;

const OPEN_QUESTION =
  /(?:^|[\s,;:])(?:вопрос|надо\s+решить|нужно\s+решить|требует\s+решения|осталось\s+решить|не\s+решено|открытый\s+вопрос)(?:\s|[:.,;]|$)/iu;

const META_COMMAND =
  /(?:наведи\s+(?:всё\s+|все\s+)?(?:в\s+)?порядок|разбери\s+проект|ревизи[яю]\s+проекта|аудит\s+проекта|tidy\s+up\s+(?:the\s+)?project|audit\s+(?:the\s+)?project)/iu;

const EXPLICIT_TASK_COMMAND =
  /^(?:(?:пожалуйста[,\s]*)?(?:запомни|запомните|remember)\s+(?:новую\s+)?(?:задачу|task)|(?:задача|task)\s*[:—-]|(?:добавь|создай|поставь|заведи)\s+(?:новую\s+)?задачу)/iu;

const REMINDER_COMMAND =
  /^(?:пожалуйста[,\s]*)?(?:напомни|напомните|remind\s+me)\b|(?:^|[\s,;:])(?:напомни|напомните)\s+(?:мне\s+)?/iu;

const KNOWLEDGE =
  /(?:^|[\s,;:])(?:правило[:!]?|принцип|важно[:!]|не\s+должен|не\s+должна|не\s+должно|не\s+превраща|никогда\s+не|нельзя|запрещено|всегда\s+|по\s+умолчанию|имей\s+в\s+виду|запомни,\s+что|remember\s+that|must\s+not|should\s+not|never\s+)(?:\s|$)/iu;

const INSTRUCTION =
  /(?:^|[\s,;:])(?:напиши|скажи|покажи|ответь|объясни|переведи|сформулируй|дай|приведи)(?=$|[^a-zа-я0-9])[^.!?]{0,120}(?:в\s+чат|в\s+ответ|здесь|сейчас|мне|по-русски|по-английски)|(?:^|[^a-zа-я0-9])(?:в\s+этот\s+чат|в\s+чат\s+проекта|в\s+чат|здесь\s+же|прямо\s+сейчас)(?=$|[^a-zа-я0-9])/iu;

const INCOMPLETE_TASK_COMMAND =
  /^(?:просто\s+)?(?:добавь|добавить|запиши|записать|add)\s+(?:это|это\s+всё|это\s+все|всё\s+это|this|all\s+this)\s+(?:в\s+|to\s+)?(?:задачи|задачу|таски|tasks?)[.!]?$/iu;

const INFINITIVE_TASK =
  /^(?:пожалуйста[,\s]*)?(?:опустить|поднять|изменить|перенести|удалить|заменить|увеличить|уменьшить|поправить|настроить|проверить|добавить|исправить|обновить|переписать|сверстать|реализовать|сделать|подготовить|опубликовать|написать|создать|убрать|подключить|загрузить|выгрузить|починить|протестировать|оптимизировать)(?=$|[^a-zа-я0-9])/iu;

const CONVERSATIONAL_DISCUSSION =
  /(?:^|[\s,;:])(?:обсудить|обсуждать|подумать|решить|уточнить|выяснить|понять|discuss|think|clarify|decide)(?=$|[^a-zа-я0-9])/iu;

const CONCRETE_ACTION =
  /(?:напиши|подготовь|проверь|создай|исправь|добавь|опубликуй|опусти|подними|измени|перенеси|удали|замени|настрой|обнови|сверстай|реализуй|сделай|почини|write|prepare|check|create|fix|add|publish)/iu;

const NEGATION =
  /(?:^|[\s(])(?:не|нет|без|никогда|отмен\w*|отказ\w*|против|not|never|cancel\w*|reject\w*)(?:\s|$)/iu;

function clean(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[\s:—–,.-]+/, '')
    .replace(/[\s,;:]+$/, '')
    .trim();
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
  if (KNOWLEDGE.test(value)) tags.push('constraint');
  return tags;
}

function stripTaskCommand(value: string): string {
  const stripped = value
    .replace(
      /^(?:пожалуйста[,\s]*)?(?:запомни|запомните|remember)\s+(?:новую\s+)?(?:задачу|task)\s*[:—–-]?\s*/iu,
      ''
    )
    .replace(
      /^(?:пожалуйста[,\s]*)?(?:добавь|добавьте|создай|создайте|поставь|поставьте|заведи|заведите)\s+(?:новую\s+)?(?:задачу|task)\s*[:—–-]?\s*/iu,
      ''
    )
    .replace(/^(?:задача|task)\s*[:—–-]\s*/iu, '')
    .replace(/^(?:пожалуйста[,\s]*)?(?:напомни|напомните|remind\s+me)\s+(?:мне\s+)?/iu, '')
    .replace(/[.!?]+$/u, '')
    .trim();
  return stripped.length >= 3 ? stripped : value;
}

export function classifyReviewSentence(value: string, hasUrl = false): ReviewClassification {
  const sentence = clean(value);
  if (!sentence) return 'ignore';
  if (META_COMMAND.test(sentence)) return 'ignore';
  if (isQuestion(sentence)) return 'question';
  if (COMPLETION.test(sentence)) return 'completion';

  const explicitTask = EXPLICIT_TASK_COMMAND.test(sentence);

  if (REMINDER_COMMAND.test(sentence)) return 'reminder';
  if (INCOMPLETE_TASK_COMMAND.test(sentence) && !explicitTask) return 'ambiguous';

  const decisionLike = DECISION.test(sentence);
  const ideaLike = IDEA.test(sentence);

  if (decisionLike && !HYPOTHESIS.test(sentence) && !ideaLike) return 'decision';
  if (KNOWLEDGE.test(sentence) && !explicitTask) return 'knowledge';
  if (ideaLike && !explicitTask) return 'idea';
  if (INSTRUCTION.test(sentence) && !explicitTask) return 'instruction';
  if (hasUrl && !explicitTask && !TASK_VERB.test(sentence)) return 'reference';

  const actionable =
    explicitTask ||
    TASK_VERB.test(sentence) ||
    OBLIGATION.test(sentence) ||
    INFINITIVE_TASK.test(sentence);

  if (!actionable) return 'ignore';

  if (!explicitTask && HYPOTHESIS.test(sentence) && !CONCRETE_ACTION.test(sentence)) {
    return 'idea';
  }

  if (
    CONVERSATIONAL_DISCUSSION.test(sentence) &&
    !CONCRETE_ACTION.test(sentence) &&
    !explicitTask
  ) {
    return 'ambiguous';
  }

  if (!explicitTask && NEGATION.test(sentence)) return 'ignore';

  return 'task';
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

function taskCandidateFor(message: ProjectHistoryMessage, sentence: string): ReviewCandidate {
  return candidateFor(message, stripTaskCommand(sentence), tagsFor(sentence));
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
      (value.match(/https?:\/\/[^\s<>"')]+/giu) || []).map((url) => url.replace(/[.,;:!?]+$/g, ''))
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
  const withoutUrl = clean(sentence.replace(url, ''))
    .replace(/[:—–-]+$/g, '')
    .trim();
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
  const active = existing.filter(
    (task) => task.status === 'current' || task.status === 'uncertain'
  );

  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      const a = active[left];
      const b = active[right];
      const aTitle = normalizeForComparison(a.title);
      const bTitle = normalizeForComparison(b.title);
      const aFull = normalizeForComparison(`${a.title} ${a.content}`);
      const bFull = normalizeForComparison(`${b.title} ${b.content}`);
      const exact =
        aTitle === bTitle &&
        normalizeForComparison(a.content) === normalizeForComparison(b.content);
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
            score: contained
              ? 1
              : lexicalSimilarity(text, normalizeForComparison(`${task.title} ${task.content}`)),
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

function ideaLikeTasks(
  existing: ReviewExistingTask[]
): Array<{ id: string; title: string; reason: string }> {
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
      reason:
        'Похоже на идею без конкретного обязательства; не закрываю и не удаляю автоматически.',
    }))
    .slice(0, 20);
}

export function analyzeProjectReview(input: {
  messages: ProjectHistoryMessage[];
  existingTasks: ReviewExistingTask[];
  existingDecisions: ReviewExistingDecision[];
  existingMaterials: ReviewExistingMaterial[];
  learningExamples?: TaskExperienceExample[];
}): ProjectReviewAnalysis {
  const tasks: ReviewCandidate[] = [];
  const reminders: ReviewCandidate[] = [];
  const ideas: ReviewCandidate[] = [];
  const decisions: ReviewCandidate[] = [];
  const knowledge: ReviewCandidate[] = [];
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

    const hasUrl = extractUrls(message.content).length > 0;

    for (const sentence of sentences(message.content)) {
      let classification = classifyReviewSentence(sentence, hasUrl);
      const learned = input.learningExamples?.length
        ? learnedClassification(sentence, input.learningExamples)
        : null;

      if (learned?.outcome === 'false_task') continue;
      if (learned?.outcome === 'confirmed' && learned.confirmedKind === 'task') {
        classification = 'task';
      }
      if (learned?.outcome === 'confirmed' && learned.confirmedKind === 'reminder') {
        classification = 'reminder';
      }
      if (learned?.outcome === 'wrong_kind' && learned.confirmedKind) {
        const confirmedKind = learned.confirmedKind;
        if (confirmedKind === 'constraint' || confirmedKind === 'knowledge') {
          classification = 'knowledge';
        } else if (confirmedKind === 'saved' || confirmedKind === 'idea') {
          classification = 'idea';
        } else if (confirmedKind === 'decision') {
          classification = 'decision';
        } else if (confirmedKind === 'reminder') {
          classification = 'reminder';
        } else if (confirmedKind === 'task') {
          classification = 'task';
        }
      }

      if (classification === 'question') {
        pushUnique(
          openQuestions,
          candidateFor(message, sentence, ['project-review', 'open-question'])
        );
        continue;
      }

      if (classification === 'decision') {
        pushUnique(decisions, candidateFor(message, sentence, tagsFor(sentence)));
        continue;
      }

      if (classification === 'knowledge') {
        pushUnique(knowledge, candidateFor(message, sentence, tagsFor(sentence)));
        continue;
      }

      if (classification === 'idea') {
        pushUnique(ideas, candidateFor(message, sentence, tagsFor(sentence)));
        continue;
      }

      if (classification === 'reminder') {
        const candidate = taskCandidateFor(message, sentence);
        if (!taskIsExisting(candidate, input.existingTasks)) pushUnique(reminders, candidate);
        continue;
      }

      if (classification === 'ambiguous') {
        const candidate = taskCandidateFor(message, sentence);
        pushUnique(ambiguousTaskCandidates, candidate);
        pushUnique(
          openQuestions,
          candidateFor(message, sentence, ['project-review', 'open-question'])
        );
        continue;
      }

      if (classification !== 'task') continue;

      const candidate = taskCandidateFor(message, sentence);
      if (taskIsExisting(candidate, input.existingTasks)) continue;
      pushUnique(tasks, candidate);
    }
  }

  return {
    tasks,
    reminders,
    ideas,
    decisions,
    knowledge,
    materials,
    openQuestions,
    completions: completionCandidates(input.messages, input.existingTasks),
    duplicateGroups: duplicateGroups(input.existingTasks),
    contradictions: contradictionPairs(input.existingDecisions, decisions),
    ambiguousTaskCandidates,
    ideaLikeTasks: ideaLikeTasks(input.existingTasks),
  };
}
