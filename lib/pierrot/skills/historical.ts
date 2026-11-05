import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lexicalSimilarity, trigramSimilarity } from '@/lib/pierrot/memory/similarity';
import type { SkillCheck, SkillDefinition } from './types';
import { collectSkillAnalysisEvidence } from './analysis/collect';
import type { AnalysisToolEvent, AnalysisWorkItem } from './analysis/evidence';

assertServerOnly('lib/pierrot/skills/historical');

const MATCH_THRESHOLD = 0.3;
const MIN_EXAMPLES = 3;

function score(left: string, right: string): number {
  return Math.max(lexicalSimilarity(left, right), trigramSimilarity(left, right) * 0.85);
}

function skillText(definition: SkillDefinition): string {
  return [
    definition.name,
    definition.description,
    definition.purpose,
    ...definition.conditions,
    ...definition.inputs,
  ].join(' ');
}

function stepTokens(step: string): string[] {
  return step
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

export function evaluateHistoricalApplicability(input: {
  definition: SkillDefinition;
  examples: AnalysisWorkItem[];
  toolEvents: AnalysisToolEvent[];
}): SkillCheck[] {
  const { definition, examples, toolEvents } = input;
  const usable = examples.filter((example) => example.text.trim().length >= 34).slice(0, 300);

  const skill = skillText(definition);
  const scored = usable
    .map((example) => ({
      example,
      score: score(skill, example.text),
    }))
    .sort((left, right) => right.score - left.score);

  const matched = scored.filter((entry) => entry.score >= MATCH_THRESHOLD);
  const evidenceIds = matched.slice(0, 8).map((entry) => entry.example.id);
  const ratio = usable.length > 0 ? matched.length / usable.length : 0;

  const checks: SkillCheck[] = [
    {
      name: 'historical_examples_available',
      phase: 'historical',
      blocking: false,
      passed: usable.length >= MIN_EXAMPLES,
      detail:
        usable.length >= MIN_EXAMPLES
          ? `Доступно ${usable.length} исторических примеров.`
          : `Доступно только ${usable.length} примеров; для устойчивой проверки нужно минимум ${MIN_EXAMPLES}.`,
      evidence: usable.slice(0, 8).map((example) => example.id),
    },
    {
      name: 'conditions_match_history',
      phase: 'historical',
      blocking: false,
      passed: usable.length < MIN_EXAMPLES || matched.length >= 1,
      detail:
        usable.length < MIN_EXAMPLES
          ? 'Недостаточно истории, чтобы судить о применимости.'
          : matched.length >= 1
            ? `Условия совпали с ${matched.length} из ${usable.length} исторических примеров.`
            : 'Ни один исторический пример не совпал с условиями навыка. Условия могут быть слишком узкими.',
      evidence: evidenceIds,
    },
    {
      name: 'conditions_not_overbroad',
      phase: 'historical',
      blocking: false,
      passed: usable.length < MIN_EXAMPLES || ratio <= 0.8,
      detail:
        usable.length < MIN_EXAMPLES
          ? 'Недостаточно истории для проверки ширины условий.'
          : ratio <= 0.8
            ? `Совпадение ${(ratio * 100).toFixed(0)}% — условия не выглядят всеобъемлющими.`
            : `Совпадение ${(ratio * 100).toFixed(0)}% — условия могут быть слишком широкими.`,
      evidence: evidenceIds,
    },
  ];

  const withSavedResult = matched.filter((entry) => entry.example.assistantText?.trim());
  checks.push({
    name: 'historical_expected_results',
    phase: 'historical',
    blocking: false,
    passed: withSavedResult.length > 0,
    detail:
      withSavedResult.length > 0
        ? `Найдено ${withSavedResult.length} сохранённых результатов; пример: ${withSavedResult[0].example.assistantText?.slice(0, 220)}`
        : 'В совпавших примерах не сохранён результат; ожидаемый результат нужно уточнить у владельца.',
    evidence: withSavedResult.slice(0, 4).map((entry) => entry.example.id),
  });

  const steps = definition.steps.filter((step) => step.trim());
  const evidenceText = matched
    .slice(0, 30)
    .map((entry) => entry.example.text)
    .join(' ')
    .toLowerCase();
  const evidencedSteps = steps.filter((step) =>
    stepTokens(step).some((token) => evidenceText.includes(token))
  );
  const stepRatio = steps.length > 0 ? evidencedSteps.length / steps.length : 0;

  checks.push({
    name: 'steps_evidenced_by_history',
    phase: 'historical',
    blocking: false,
    passed: steps.length === 0 || stepRatio >= 0.5,
    detail:
      steps.length === 0
        ? 'Шаги не заданы.'
        : `${evidencedSteps.length} из ${steps.length} шагов имеют опору в исторических примерах (эвристика по словам).`,
    evidence: evidenceIds,
  });

  const declaredTools = definition.tools.map((tool) => tool.trim().toLowerCase()).filter(Boolean);
  const observedTools = new Set(
    toolEvents
      .flatMap((event) => [event.tool, event.operation])
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase())
  );
  const unsupportedTools = declaredTools.filter(
    (tool) => !Array.from(observedTools).some((observed) => observed.includes(tool))
  );

  checks.push({
    name: 'tools_supported_by_history',
    phase: 'historical',
    blocking: false,
    passed: declaredTools.length === 0 || observedTools.size === 0 || unsupportedTools.length === 0,
    detail:
      declaredTools.length === 0
        ? 'Инструменты не заявлены.'
        : observedTools.size === 0
          ? 'История инструментов недоступна; проверить соответствие нельзя.'
          : unsupportedTools.length === 0
            ? 'Все заявленные инструменты встречаются в истории.'
            : `Нет подтверждения инструментов: ${unsupportedTools.join(', ')}.`,
    evidence: evidenceIds,
  });

  const testInputs = definition.tests.map((test) => test.input?.trim() || '').filter(Boolean);
  const foundTests = testInputs.filter((input) =>
    usable.some((example) => score(input, example.text) >= MATCH_THRESHOLD)
  );

  checks.push({
    name: 'declared_test_inputs_found',
    phase: 'historical',
    blocking: false,
    passed: testInputs.length === 0 || foundTests.length > 0,
    detail:
      testInputs.length === 0
        ? 'В навыке нет конкретных тестовых входов.'
        : `${foundTests.length} из ${testInputs.length} тестовых входов найдены в истории.`,
    evidence: evidenceIds,
  });

  checks.push({
    name: 'actual_execution',
    phase: 'execution',
    blocking: false,
    passed: false,
    detail:
      'Реальное исполнение не запускалось. Проверены структура и историческая применимость; отдельного безопасного исполнителя навыков нет.',
    evidence: evidenceIds,
  });

  return checks;
}

export async function loadHistoricalSkillChecks(input: {
  store: SupabaseClient;
  userId: string;
  definition: SkillDefinition;
  days?: number;
}): Promise<SkillCheck[]> {
  try {
    const evidence = await collectSkillAnalysisEvidence({
      store: input.store,
      userId: input.userId,
      days: input.days ?? 90,
    });

    return evaluateHistoricalApplicability({
      definition: input.definition,
      examples: evidence.workItems,
      toolEvents: evidence.toolEvents,
    });
  } catch {
    return [
      {
        name: 'historical_examples_available',
        phase: 'historical',
        blocking: false,
        passed: false,
        detail: 'Историю не удалось загрузить; применимость на примерах не проверена.',
        evidence: [],
      },
      {
        name: 'actual_execution',
        phase: 'execution',
        blocking: false,
        passed: false,
        detail: 'Реальное исполнение не запускалось.',
        evidence: [],
      },
    ];
  }
}
