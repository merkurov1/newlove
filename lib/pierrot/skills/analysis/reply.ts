import type { SkillAnalysisReport } from '../types';

export type SkillAnalysisCommand = 'analyze' | 'learned' | 'skills' | 'procedures';

const COMMANDS: Array<{ command: SkillAnalysisCommand; patterns: RegExp[] }> = [
  {
    command: 'analyze',
    patterns: [/^проанализируй\s+(?:свою|мою)\s+работу[.!?]?$/i, /^analy[sz]e\s+my\s+work[.!?]?$/i],
  },
  {
    command: 'learned',
    patterns: [
      /^чему\s+ты\s+научил(?:ся|ась)\s+за\s+последнее\s+время[.!?]?$/i,
      /^what\s+have\s+you\s+learned\s+(?:recently|lately)[.!?]?$/i,
    ],
  },
  {
    command: 'skills',
    patterns: [
      /^какие\s+навыки\s+нам\s+стоит\s+создать[.!?]?$/i,
      /^проверь\s+существующие\s+навыки[.!?]?$/i,
      /^предложи\s+улучшения\s+навыков[.!?]?$/i,
      /^which\s+skills\s+should\s+we\s+create[.!?]?$/i,
      /^review\s+(?:the\s+)?existing\s+skills[.!?]?$/i,
      /^suggest\s+skill\s+improvements[.!?]?$/i,
    ],
  },
  {
    command: 'procedures',
    patterns: [
      /^покажи,?\s+какие\s+процедуры\s+ты\s+повторяешь[.!?]?$/i,
      /^show\s+(?:me\s+)?which\s+procedures\s+you\s+repeat[.!?]?$/i,
    ],
  },
];

/**
 * Explicit owner command detection. Ordinary questions that merely mention
 * skills or work do not start an analysis.
 */
export function parseSkillAnalysisCommand(value: string): SkillAnalysisCommand | null {
  const normalized = value.replace(/\s+/g, ' ').trim();

  for (const entry of COMMANDS) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) return entry.command;
  }

  return null;
}

export function formatSkillAnalysisChatReply(
  report: SkillAnalysisReport,
  command: SkillAnalysisCommand,
  persisted: boolean
): string {
  const lines: string[] = [];

  if (report.procedures.length === 0) {
    lines.push(
      report.stats.conversations + report.stats.devTasks + report.stats.memoryRecords === 0
        ? 'За выбранный период я не нашёл пригодной истории работы. Это не успешный анализ: источники пусты или недоступны.'
        : 'За выбранный период я не нашёл подтверждённых повторяемых процедур. Одного сходства тем недостаточно.'
    );
  } else {
    const top = report.procedures.slice(0, 3);
    lines.push(
      command === 'learned'
        ? `За выбранный период я нашёл ${report.procedures.length} подтверждённых процедур.`
        : `Проанализировал доступную историю: ${report.procedures.length} подтверждённых процедур.`
    );
    lines.push(
      ...top.map(
        (procedure, index) =>
          `${index + 1}. ${procedure.name} — ${procedure.exampleCount} примеров, повторяемость ${procedure.repeatability}.`
      )
    );
  }

  if (report.problems.length > 0) {
    lines.push(
      `Проблемных мест: ${report.problems.length}. Главное: ${report.problems[0]?.description || ''}`
    );
  }

  if (report.proposals.length > 0) {
    lines.push(
      command === 'skills'
        ? `Предложений для Foundry: ${report.proposals.length}. Черновики не созданы автоматически.`
        : `Кандидатов на черновики: ${report.proposals.length}.`
    );
  }

  lines.push(
    `Полный отчёт${persisted ? '' : ' (не сохранён: миграция анализа не применена)'}: [Skill Foundry](/admin/pierrot/skills).`
  );

  return lines.join('\n\n').slice(0, 3_500);
}
