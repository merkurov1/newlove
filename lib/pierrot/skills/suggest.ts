import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMemoryRecords } from '@/lib/pierrot/memory/store';
import { lexicalSimilarity } from '@/lib/pierrot/memory/similarity';
import type { PierrotMemoryRecord } from '@/lib/pierrot/memory/types';
import type {
  SkillDefinition,
  SkillExample,
  SkillSuggestion,
  SkillSuggestionResult,
} from './types';
import { skillGaps } from './validation';

assertServerOnly('lib/pierrot/skills/suggest');

const ELIGIBLE_KINDS = new Set(['task', 'reminder', 'decision', 'memory', 'saved']);
const MIN_REPETITIONS = 3;

function buildDefinition(cluster: PierrotMemoryRecord[]): SkillDefinition {
  const projects = Array.from(
    new Set(
      cluster.map((record) => record.project).filter((value): value is string => Boolean(value))
    )
  );
  const titles = cluster.map((record) => record.title).filter(Boolean);
  const topic = projects[0] || titles[0] || 'повторяемая процедура';

  const steps = cluster
    .map((record) => record.content.replace(/\s+/g, ' ').trim().slice(0, 220))
    .filter(Boolean)
    .slice(0, 6)
    .map((content) => `Повторить шаг из записи: ${content}`);

  const examples: SkillExample[] = cluster.slice(0, 4).map((record) => ({
    title: record.title,
    result: record.content.slice(0, 300),
    date: (record.validFrom || record.updatedAt).slice(0, 10),
  }));

  return {
    name: `Повторяемая процедура: ${topic}`.slice(0, 120),
    description: `Черновик по ${cluster.length} похожим записям памяти. Требует проверки владельцем.`,
    purpose: `Стандартизировать повторяющуюся процедуру, которая уже встречалась в записях (${topic}).`,
    conditions: [
      `Когда запрос похож на одну из записей: ${titles.slice(0, 3).join('; ')}`,
      ...(projects.length > 0 ? [`Проект: ${projects.join(', ')}`] : []),
    ],
    inputs: titles.slice(0, 6),
    steps: steps.length >= 2 ? steps : [...steps, 'Проверить результат и зафиксировать его'],
    tools: ['memory.search'],
    constraints: [
      'Черновик только читает память; владелец должен утвердить процедуру.',
      'Существующая авторизация и права инструментов не расширяются.',
      'Никаких изменений production без явного подтверждения.',
    ],
    expectedResult: 'Повторяемый результат, соответствующий исходным записям.',
    tests: [
      {
        name: 'repetition check',
        input: titles[0],
        expected: 'Процедура применима и не требует данных, которых нет в памяти.',
      },
    ],
    examples,
  };
}

/**
 * Deterministic detection of a repeated procedure from memory. It prepares a
 * draft only; it never creates a skill and never approves one.
 */
export async function suggestSkillDraft(
  store: SupabaseClient,
  userId: string
): Promise<SkillSuggestionResult> {
  let records: PierrotMemoryRecord[];

  try {
    records = await listMemoryRecords(store, {
      userId,
      statuses: ['current', 'completed', 'archived'],
      limit: 120,
    });
  } catch {
    return { available: false, suggestion: null, reason: 'memory_unavailable' };
  }

  const eligible = records.filter(
    (record) => ELIGIBLE_KINDS.has(record.kind) && record.content.trim().length > 20
  );

  const clusters: PierrotMemoryRecord[][] = [];

  for (const record of eligible) {
    const target = clusters.find((cluster) => {
      const anchor = cluster[0];
      if (!anchor) return false;
      return (
        lexicalSimilarity(
          `${anchor.title} ${anchor.content}`,
          `${record.title} ${record.content}`
        ) >= 0.42
      );
    });

    if (target) target.push(record);
    else clusters.push([record]);
  }

  const best = clusters
    .filter((cluster) => cluster.length >= MIN_REPETITIONS)
    .sort((left, right) => right.length - left.length)[0];

  if (!best) {
    return {
      available: false,
      suggestion: null,
      reason: 'not_enough_repetition',
    };
  }

  const definition = buildDefinition(best);

  const suggestion: SkillSuggestion = {
    definition,
    changelog: `Draft detected from ${best.length} similar memory records`,
    basedOn: best.slice(0, 8).map((record) => `${record.kind}: ${record.title}`),
    gaps: skillGaps(definition),
  };

  return { available: true, suggestion };
}
