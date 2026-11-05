import { lexicalSimilarity, tokenize, trigramSimilarity } from '@/lib/pierrot/memory/similarity';
import type {
  SkillAnalysisEvidenceRef,
  SkillAnalysisProcedure,
  SkillAnalysisProblem,
  SkillAnalysisProposal,
  SkillAnalysisReport,
  SkillAnalysisReview,
  SkillDefinition,
  SkillRecord,
} from '../types';
import { skillGaps } from '../validation';
import type { AnalysisEvidenceBundle, AnalysisWorkItem } from './evidence';

const MIN_ITEM_CHARS = 34;
const MIN_CLUSTER_ITEMS = 3;
const CLUSTER_THRESHOLD = 0.42;
const MAX_PROCEDURES = 8;
const MAX_PROBLEMS = 10;
const MAX_PROPOSALS = 6;
const MAX_REVIEWS = 8;
const MAX_EVIDENCE = 6;

const ACTION_WORD =
  /(analy[sz]e|review|audit|research|compare|draft|write|create|build|fix|debug|update|migrate|deploy|test|verify|optimi[sz]e|prepare|collect|summari[sz]e|inspect|check|провер|проанализ|исслед|сравн|созда|напиш|собер|подготов|обнов|исправ|почини|разбери|найди|сделай|сверстай|запуш|задеплой|протест|оптимиз|аудит|изуч|пересмотр)/i;

const QUESTION_WORD = /(^|\s)(как|что|почему|зачем|где|когда|who|what|why|how|where|when)\b/i;

type Cluster = {
  id: string;
  items: AnalysisWorkItem[];
  anchor: string;
};

function text(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function safeDate(value: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function dayKey(value: string | null): string {
  return value ? value.slice(0, 10) : 'undated';
}

function evidenceFor(item: AnalysisWorkItem): SkillAnalysisEvidenceRef {
  return {
    source: item.source,
    id: item.id,
    label: text(item.text).slice(0, 140),
    date: item.date,
    conversationId: item.conversationId,
    href: item.href,
  };
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function sharedTokenCount(left: string, right: string): number {
  const rightTokens = new Set(tokenize(right));
  return unique(tokenize(left)).filter((token) => rightTokens.has(token)).length;
}

function relationScore(left: string, right: string): number {
  const lexical = lexicalSimilarity(left, right);
  const trigram = trigramSimilarity(left, right);
  return Math.max(lexical, trigram * 0.85);
}

function isActionable(value: string): boolean {
  return ACTION_WORD.test(value);
}

function actionPhrase(value: string, max = 90): string {
  const match = value.match(ACTION_WORD);
  if (!match || match.index === undefined) return '';

  const fromMatch = text(value.slice(match.index));
  const clause = fromMatch.split(/[.!?;:\n]/)[0] || fromMatch;
  return clause.slice(0, max).trim();
}

function representativeTitle(items: AnalysisWorkItem[]): string {
  const phrases = items.map((item) => actionPhrase(item.text, 72)).filter(Boolean);

  if (phrases.length === 0) return 'Повторяющаяся рабочая процедура';

  const frequency = new Map<string, number>();
  for (const phrase of phrases) {
    const key = phrase.toLowerCase();
    frequency.set(key, (frequency.get(key) || 0) + 1);
  }

  return (
    Array.from(frequency.entries()).sort(
      (left, right) => right[1] - left[1] || right[0].length - left[0].length
    )[0]?.[0] || phrases[0]
  );
}

function clusterWorkItems(items: AnalysisWorkItem[]): Cluster[] {
  const eligible = items
    .filter((item) => item.text.length >= MIN_ITEM_CHARS && isActionable(item.text))
    .sort((left, right) => safeDate(left.date) - safeDate(right.date));

  const clusters: Cluster[] = [];

  for (const item of eligible) {
    let best: { cluster: Cluster; score: number } | null = null;

    for (const cluster of clusters) {
      if (sharedTokenCount(cluster.anchor, item.text) < 2) continue;
      const score = relationScore(cluster.anchor, item.text);
      if (!best || score > best.score) best = { cluster, score };
    }

    if (best && best.score >= CLUSTER_THRESHOLD) {
      best.cluster.items.push(item);
      if (item.text.length > best.cluster.anchor.length) best.cluster.anchor = item.text;
    } else {
      clusters.push({
        id: `cluster-${clusters.length + 1}`,
        items: [item],
        anchor: item.text,
      });
    }
  }

  const confirmed = clusters
    .filter((cluster) => {
      const distinctSources = new Set(
        cluster.items.map((item) => `${item.source}:${item.conversationId || item.id}`)
      ).size;
      const distinctDays = new Set(cluster.items.map((item) => dayKey(item.date))).size;
      return cluster.items.length >= MIN_CLUSTER_ITEMS && distinctSources >= 2 && distinctDays >= 1;
    })
    .sort((left, right) => right.items.length - left.items.length);

  const accepted: Cluster[] = [];
  for (const cluster of confirmed) {
    const overlaps = accepted.some((existing) => {
      const score = relationScore(existing.anchor, cluster.anchor);
      return score >= 0.64;
    });

    if (!overlaps) accepted.push(cluster);
    if (accepted.length >= MAX_PROCEDURES) break;
  }

  return accepted;
}

function skillText(skill: SkillRecord): string {
  const definition = skill.currentVersion?.definition;
  if (!definition) return `${skill.name} ${skill.description}`;

  return [
    definition.name,
    definition.description,
    definition.purpose,
    ...definition.conditions,
    ...definition.inputs,
  ].join(' ');
}

function relatedSkills(cluster: Cluster, skills: SkillRecord[]): SkillRecord[] {
  return skills
    .filter((skill) => skill.status === 'active' || skill.status === 'testing')
    .map((skill) => ({ skill, score: relationScore(cluster.anchor, skillText(skill)) }))
    .filter((entry) => entry.score >= 0.42)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => entry.skill);
}

function clusterTools(cluster: Cluster, bundle: AnalysisEvidenceBundle): string[] {
  const conversationIds = new Set(
    cluster.items
      .map((item) => item.conversationId)
      .filter((value): value is string => Boolean(value))
  );

  const tools = [
    ...cluster.items.flatMap((item) => item.tools),
    ...bundle.toolEvents
      .filter((event) => event.conversationId && conversationIds.has(event.conversationId))
      .flatMap((event) => [event.tool, event.operation].filter(Boolean) as string[]),
  ];

  return unique(tools.map((tool) => tool.trim()).filter(Boolean)).slice(0, 10);
}

function clusterSequence(cluster: Cluster): string[] {
  const steps = unique(
    cluster.items.map((item) => actionPhrase(item.text, 150)).filter((step) => step.length >= 8)
  ).slice(0, 6);

  if (steps.length >= 2) return steps;

  return [...steps, '[ТРЕБУЕТ УТОЧНЕНИЯ] последовательность шагов не восстановлена по источникам'];
}

function repeatability(cluster: Cluster): 'высокая' | 'средняя' | 'низкая' {
  const distinctConversations = new Set(
    cluster.items.map((item) => `${item.source}:${item.conversationId || item.id}`)
  ).size;
  const distinctDays = new Set(cluster.items.map((item) => dayKey(item.date))).size;

  if (cluster.items.length >= 5 && distinctConversations >= 3 && distinctDays >= 3) {
    return 'высокая';
  }
  if (cluster.items.length >= 3 && distinctConversations >= 2 && distinctDays >= 2) {
    return 'средняя';
  }
  return 'низкая';
}

function toProcedure(cluster: Cluster, bundle: AnalysisEvidenceBundle): SkillAnalysisProcedure {
  const related = relatedSkills(cluster, bundle.skills);
  const title = representativeTitle(cluster.items);
  const sourceLabels = unique(
    cluster.items.map((item) =>
      item.source === 'owner_chat' ? 'диалог' : item.source === 'dev_task' ? 'Dev Mode' : 'память'
    )
  );

  return {
    id: cluster.id,
    name: title.slice(0, 120),
    description: `Повторяется в ${cluster.items.length} подтверждённых примерах (${sourceLabels.join(
      ', '
    )}).`,
    exampleCount: cluster.items.length,
    evidence: cluster.items.slice(0, MAX_EVIDENCE).map(evidenceFor),
    sequence: clusterSequence(cluster),
    tools: clusterTools(cluster, bundle),
    repeatability: repeatability(cluster),
    usefulness:
      related.length > 0
        ? `Пересекается с существующим навыком: ${related.map((skill) => skill.name).join(', ')}. Стоит уточнить условия или версию, а не создавать дубль.`
        : 'Процедура повторяется, но в Foundry нет активного навыка, который её описывает. Это кандидат на черновик.',
    relatedSkillIds: related.map((skill) => skill.id),
  };
}

function unresolved(value: string, fallback: string): string {
  return value.trim() || fallback;
}

function buildDraftDefinition(
  procedure: SkillAnalysisProcedure,
  cluster: Cluster
): { definition: SkillDefinition; gaps: string[] } {
  const title = procedure.name.replace(/^[a-zа-яё]/i, (letter) => letter.toUpperCase());
  const inputs = unique(
    cluster.items
      .flatMap((item) => item.labels)
      .map((label) => text(label))
      .filter(Boolean)
  ).slice(0, 5);
  const examples = cluster.items.slice(0, 4).map((item) => ({
    title: text(item.text).slice(0, 90),
    input: text(item.text).slice(0, 300),
    result:
      item.assistantText && item.assistantText.trim()
        ? text(item.assistantText).slice(0, 400)
        : '[результат не сохранён в доступных источниках]',
    ...(item.date ? { date: item.date.slice(0, 10) } : {}),
  }));

  const definition: SkillDefinition = {
    name: title.slice(0, 120),
    description: `Черновик процедуры, подтверждённой ${procedure.exampleCount} примерами. Собран из истории работы; требует проверки владельцем.`,
    purpose: `Воспроизвести подход, который уже применялся: ${procedure.name}.`,
    conditions: [
      `Когда запрос похож на подтверждённые примеры: ${cluster.items
        .slice(0, 3)
        .map((item) => text(item.text).slice(0, 90))
        .join(' · ')}`,
      ...(procedure.relatedSkillIds.length > 0
        ? ['Не дублировать существующий навык; сначала проверить его условия.']
        : []),
    ],
    inputs:
      inputs.length > 0
        ? inputs
        : ['[ТРЕБУЕТ УТОЧНЕНИЯ] входные данные не зафиксированы в источниках'],
    steps:
      procedure.sequence.length >= 2
        ? procedure.sequence
        : ['[ТРЕБУЕТ УТОЧНЕНИЯ] последовательность шагов не восстановлена'],
    tools:
      procedure.tools.length > 0
        ? procedure.tools
        : ['[ТРЕБУЕТ УТОЧНЕНИЯ] инструменты не зафиксированы в источниках'],
    constraints: [
      'Использовать только существующие права и инструменты; новых разрешений не появляется.',
      'Не изменять production без явного подтверждения владельца.',
      'Проверить применимость на исторических примерах перед утверждением.',
    ],
    expectedResult:
      examples[0]?.result && !examples[0].result.startsWith('[')
        ? `Результат, соответствующий подтверждённому примеру: ${examples[0].result}`
        : '[ТРЕБУЕТ УТОЧНЕНИЯ] ожидаемый результат не зафиксирован в источниках',
    tests: examples.slice(0, 2).map((example, index) => ({
      name: `historical applicability ${index + 1}`,
      input: example.input,
      expected: 'Условия навыка совпадают с примером; ожидаемый результат сверить с источником.',
    })),
    examples,
  };

  const gaps = skillGaps(definition);
  if (/\[ТРЕБУЕТ УТОЧНЕНИЯ\]/i.test(JSON.stringify(definition))) {
    gaps.push('unresolved_placeholders');
  }

  return { definition, gaps };
}

function toProposal(procedure: SkillAnalysisProcedure, cluster: Cluster): SkillAnalysisProposal {
  const { definition, gaps } = buildDraftDefinition(procedure, cluster);

  return {
    id: `proposal-${procedure.id}`,
    kind: 'new',
    name: definition.name,
    problem:
      procedure.relatedSkillIds.length > 0
        ? 'Есть похожий навык, но его условия не покрывают все подтверждённые примеры.'
        : 'Процедура повторяется, но не оформлена как навык.',
    evidence: procedure.evidence,
    howItWorks: `Навык распознаёт запросы, похожие на ${procedure.exampleCount} подтверждённых примера, и выполняет восстановленную последовательность: ${procedure.sequence.join(
      ' → '
    )}.`,
    difference:
      procedure.relatedSkillIds.length > 0
        ? 'Отличается от существующего навыка более узкими условиями, основанными на истории.'
        : 'Нового механизма не добавляет: это процедура поверх существующих прав и инструментов.',
    limitations: unique([
      ...gaps.map((gap) => `Требует уточнения: ${gap}.`),
      'Историческая применимость проверяется эвристически; реальное исполнение не запускается.',
      'Успешность примеров отдельно не проверялась: результат указан только там, где он сохранён в источниках.',
    ]),
    definition,
    changelog: `Draft assembled from ${procedure.exampleCount} confirmed work examples`,
    gaps,
  };
}

function toProblems(
  clusters: Cluster[],
  procedures: SkillAnalysisProcedure[],
  bundle: AnalysisEvidenceBundle
): SkillAnalysisProblem[] {
  const problems: SkillAnalysisProblem[] = [];

  for (const procedure of procedures) {
    const cluster = clusters.find((item) => item.id === procedure.id);
    if (!cluster) continue;

    const questionShare =
      cluster.items.filter((item) => QUESTION_WORD.test(item.text) || item.text.includes('?'))
        .length / cluster.items.length;

    if (procedure.relatedSkillIds.length === 0) {
      problems.push({
        id: `problem-${procedure.id}-repeated`,
        category: questionShare >= 0.5 ? 'repeated_explanation' : 'repeated_without_skill',
        description:
          questionShare >= 0.5
            ? `Один и тот же тип вопроса повторяется ${procedure.exampleCount} раз, но для него нет навыка.`
            : `Одна и та же рабочая процедура повторяется ${procedure.exampleCount} раз без оформленного навыка.`,
        evidence: procedure.evidence,
      });
    } else if (procedure.tools.length > 0) {
      const related = bundle.skills.filter((skill) => procedure.relatedSkillIds.includes(skill.id));
      const missingTools = related.filter(
        (skill) => (skill.currentVersion?.definition.tools.length || 0) === 0
      );

      if (missingTools.length > 0) {
        problems.push({
          id: `problem-${procedure.id}-unused-capability`,
          category: 'unused_capability',
          description: `В истории процедура использует инструменты (${procedure.tools.join(
            ', '
          )}), но связанный навык их не описывает.`,
          evidence: procedure.evidence,
        });
      }
    }
  }

  const failures = bundle.toolEvents.filter(
    (event) => event.ok === false || event.eventName === 'assistant_failed'
  );

  if (failures.length >= 2) {
    const byTool = new Map<string, typeof failures>();
    for (const failure of failures) {
      const key = failure.tool || failure.operation || failure.eventName;
      byTool.set(key, [...(byTool.get(key) || []), failure]);
    }

    for (const [key, items] of byTool) {
      if (items.length < 2) continue;
      problems.push({
        id: `problem-failure-${key}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80),
        category: 'repeated_failure',
        description: `Повторяющиеся сбои (${items.length}) вокруг «${key}». Стоит проверить процедуру или условия её применения.`,
        evidence: items.slice(0, MAX_EVIDENCE).map((event) => ({
          source: 'event' as const,
          id: event.id,
          label: `${event.eventName}${event.tool ? ` · ${event.tool}` : ''}`,
          date: event.date,
          conversationId: event.conversationId,
          href: event.conversationId ? `/admin/pierrot?conversation=${event.conversationId}` : null,
        })),
      });
    }
  }

  const activeSkills = bundle.skills.filter((skill) => skill.status === 'active');
  for (const skill of activeSkills) {
    const matching = procedures.filter((procedure) => procedure.relatedSkillIds.includes(skill.id));
    if (matching.length === 0) {
      problems.push({
        id: `problem-skill-unconfirmed-${skill.id}`,
        category: 'skill_incomplete',
        description: `Активный навык «${skill.name}» не подтверждён ни одной процедурой в выбранном периоде. Проверьте актуальность условий.`,
        evidence: [],
      });
    }
  }

  for (let left = 0; left < activeSkills.length; left += 1) {
    for (let right = left + 1; right < activeSkills.length; right += 1) {
      const first = activeSkills[left];
      const second = activeSkills[right];
      const score = relationScore(skillText(first), skillText(second));
      if (score >= 0.55) {
        problems.push({
          id: `problem-skill-overlap-${first.id}-${second.id}`.slice(0, 100),
          category: 'skill_overlap',
          description: `Навыки «${first.name}» и «${second.name}» пересекаются (${score.toFixed(
            2
          )}). Стоит развести условия или объединить процедуры.`,
          evidence: [],
        });
      }
    }
  }

  return problems.slice(0, MAX_PROBLEMS);
}

function toReviews(
  clusters: Cluster[],
  bundle: AnalysisEvidenceBundle
): { reviews: SkillAnalysisReview[]; proposals: SkillAnalysisProposal[] } {
  const reviews: SkillAnalysisReview[] = [];
  const proposals: SkillAnalysisProposal[] = [];
  const skills = bundle.skills
    .filter((skill) => skill.status === 'active' || skill.status === 'testing')
    .slice(0, MAX_REVIEWS);

  for (const skill of skills) {
    const definition = skill.currentVersion?.definition;
    if (!definition) continue;

    const matchingClusters = clusters
      .map((cluster) => ({ cluster, score: relationScore(cluster.anchor, skillText(skill)) }))
      .filter((entry) => entry.score >= 0.42)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    const issues: string[] = [];
    const evidence = matchingClusters
      .flatMap((entry) => entry.cluster.items.slice(0, 2).map(evidenceFor))
      .slice(0, MAX_EVIDENCE);

    if (matchingClusters.length === 0) {
      issues.push('Нет подтверждённых примеров применения в выбранном периоде.');
    }

    if (definition.conditions.length < 2) {
      issues.push('Условия применения неполные: меньше двух явных условий.');
    }

    const overlapping = bundle.skills.filter(
      (candidate) =>
        candidate.id !== skill.id &&
        candidate.status === 'active' &&
        relationScore(skillText(candidate), skillText(skill)) >= 0.55
    );

    if (overlapping.length > 0) {
      issues.push(
        `Пересекается с навыком: ${overlapping.map((candidate) => candidate.name).join(', ')}.`
      );
    }

    if (issues.length === 0 && matchingClusters.length > 0) continue;

    const proposed: SkillDefinition = {
      ...definition,
      conditions: unique([
        ...definition.conditions,
        ...(matchingClusters.length > 0
          ? [
              `Подтверждено историей: ${matchingClusters[0].cluster.items
                .slice(0, 2)
                .map((item) => text(item.text).slice(0, 90))
                .join(' · ')}`,
            ]
          : []),
      ]).slice(0, 12),
      examples: [
        ...definition.examples,
        ...matchingClusters.flatMap((entry) =>
          entry.cluster.items.slice(0, 2).map((item) => ({
            title: text(item.text).slice(0, 90),
            input: text(item.text).slice(0, 300),
            result:
              item.assistantText && item.assistantText.trim()
                ? text(item.assistantText).slice(0, 300)
                : '[результат не сохранён]',
            ...(item.date ? { date: item.date.slice(0, 10) } : {}),
          }))
        ),
      ].slice(0, 8),
    };

    reviews.push({
      skillId: skill.id,
      name: skill.name,
      status: skill.status,
      issues,
      recommendation:
        matchingClusters.length === 0
          ? 'Проверить актуальность и, если примеров нет, отключить или пересмотреть условия.'
          : 'Подготовить новую версию с уточнёнными условиями и историческими примерами.',
      evidence,
      proposedDefinition: proposed,
      changelog: 'Analysis revision based on historical evidence',
    });

    if (proposals.length < MAX_PROPOSALS) {
      proposals.push({
        id: `proposal-improve-${skill.id}`,
        kind: 'improve',
        name: `Уточнить навык: ${skill.name}`,
        problem: issues.join(' '),
        evidence,
        howItWorks:
          'Новая версия добавляет подтверждённые историей условия и примеры, не меняя существующие права и инструменты.',
        difference:
          'Не заменяет активную версию автоматически и требует отдельного теста и утверждения.',
        limitations: [
          'Улучшение основано на ограниченном периоде и эвристическом сходстве.',
          'Реальное исполнение не запускается.',
        ],
        definition: proposed,
        changelog: 'Analysis revision based on historical evidence',
        gaps: skillGaps(proposed),
        relatedSkillId: skill.id,
      });
    }
  }

  return { reviews, proposals };
}

export function analyzeEvidence(bundle: AnalysisEvidenceBundle): SkillAnalysisReport {
  const clusters = clusterWorkItems(bundle.workItems);
  const procedures = clusters.map((cluster) => toProcedure(cluster, bundle));
  const problems = toProblems(clusters, procedures, bundle);
  const improvement = toReviews(clusters, bundle);

  const newProposals = clusters
    .map((cluster, index) => ({ cluster, procedure: procedures[index] }))
    .filter(({ procedure }) => procedure && procedure.relatedSkillIds.length === 0)
    .slice(0, MAX_PROPOSALS)
    .map(({ cluster, procedure }) => toProposal(procedure, cluster));

  const proposals = [...newProposals, ...improvement.proposals].slice(0, MAX_PROPOSALS);

  const overviewParts = [
    `За период ${bundle.periodDays} дн. доступно ${bundle.counts.conversations} диалогов, ${bundle.counts.messages} сообщений, ${bundle.counts.devTasks} задач Dev Mode и ${bundle.counts.memoryRecords} записей памяти.`,
    `Найдено ${procedures.length} подтверждённых повторяемых процедур и ${problems.length} проблемных мест.`,
  ];

  if (procedures.length === 0) {
    overviewParts.push(
      'Подтверждённых процедур нет: одного сходства тем недостаточно, нужны минимум три примера с действием и разными источниками.'
    );
  } else {
    overviewParts.push(
      `Главные процедуры: ${procedures
        .slice(0, 3)
        .map((procedure) => procedure.name)
        .join('; ')}.`
    );
  }

  const toolCounts = new Map<string, number>();
  for (const event of bundle.toolEvents) {
    for (const tool of [event.tool, event.operation, ...event.sourceModes]) {
      if (!tool) continue;
      toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
    }
  }

  const topTools = Array.from(toolCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);

  if (topTools.length > 0) {
    overviewParts.push(
      `Чаще всего в истории встречаются: ${topTools
        .map(([tool, count]) => `${tool} (${count})`)
        .join(', ')}.`
    );
  }

  return {
    id: null,
    generatedAt: bundle.generatedAt,
    periodDays: bundle.periodDays,
    periodStart: bundle.periodStart,
    periodEnd: bundle.periodEnd,
    overview: overviewParts.join(' '),
    sources: bundle.sources,
    procedures,
    problems,
    proposals,
    skillReviews: improvement.reviews,
    stats: {
      conversations: bundle.counts.conversations,
      messages: bundle.counts.messages,
      devTasks: bundle.counts.devTasks,
      devRequests: bundle.counts.devRequests,
      memoryRecords: bundle.counts.memoryRecords,
      toolTraceEvents: bundle.counts.toolTraceEvents,
    },
  };
}

export const ANALYSIS_LIMITS = {
  minDays: 7,
  maxDays: 180,
  maxProcedures: MAX_PROCEDURES,
  maxProposals: MAX_PROPOSALS,
} as const;
