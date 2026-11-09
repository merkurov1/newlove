import type {
  GroomingExecutionReport,
  GroomingOperation,
  GroomingProposal,
  WorkspaceHealth,
} from './types';
import type { ProposalDraft } from './rules';

const OPERATION_LABELS: Record<GroomingOperation, string> = {
  create_task: 'создать задачу',
  create_reminder: 'создать напоминание',
  create_artifact: 'сохранить материал',
  complete_task: 'выполнить задачу',
  merge_tasks: 'объединить задачи',
  reopen_task: 'переоткрыть задачу',
  archive_task: 'архивировать задачу',
  move_task: 'перенести задачу',
  reclassify_task: 'переклассифицировать задачу',
  update_task: 'обновить задачу',
  link_github_issue: 'связать задачу с Issue',
  create_memory: 'создать запись памяти',
  update_memory: 'обновить память',
  merge_memory: 'объединить память',
  archive_memory: 'архивировать память',
  reclassify_memory: 'переклассифицировать память',
  link_project: 'связать с проектом',
  update_project_context: 'обновить контекст проекта',
  update_project_summary: 'обновить резюме проекта',
  create_issue: 'создать GitHub Issue',
  update_issue: 'обновить GitHub Issue',
  link_pull_request: 'связать Pull Request',
  sync_remote_status: 'синхронизировать статус GitHub',
  create_context_summary: 'создать резюме диалога',
  update_context_summary: 'обновить резюме диалога',
  archive_context_reference: 'архивировать ссылку контекста',
};

const GROUP_ORDER: Array<{ key: string; title: string; operations: GroomingOperation[] }> = [
  {
    key: 'tasks',
    title: 'Задачи',
    operations: [
      'create_task',
      'create_reminder',
      'create_artifact',
      'complete_task',
      'merge_tasks',
      'reopen_task',
      'archive_task',
      'move_task',
      'reclassify_task',
      'update_task',
      'link_github_issue',
    ],
  },
  {
    key: 'memory',
    title: 'Память и Brain',
    operations: [
      'create_memory',
      'update_memory',
      'merge_memory',
      'archive_memory',
      'reclassify_memory',
    ],
  },
  {
    key: 'projects',
    title: 'Проекты',
    operations: ['link_project', 'update_project_context', 'update_project_summary'],
  },
  {
    key: 'github',
    title: 'GitHub',
    operations: ['create_issue', 'update_issue', 'link_pull_request', 'sync_remote_status'],
  },
  {
    key: 'context',
    title: 'Контекст диалогов',
    operations: ['create_context_summary', 'update_context_summary', 'archive_context_reference'],
  },
];

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function riskMark(risk: GroomingProposal['risk']): string {
  if (risk === 'safe') return 'safe';
  if (risk === 'reversible') return 'reversible';
  return 'confirm';
}

export function formatGroomingPlan(input: {
  auditId: string;
  proposals: Array<GroomingProposal | ProposalDraft>;
  summary: {
    taskCount: number;
    memoryCount: number;
    projectCount: number;
    messageCount: number;
    githubLinkCount: number;
    githubErrorCount: number;
    staleSummaryCount: number;
    sourceMessageCount?: number;
    conversationCount?: number;
    openTaskCount?: number;
    questionableTaskCount?: number;
    decisionCount?: number;
    materialCount?: number;
    contradictionCount?: number;
    cleanedTaskCount?: number;
  };
  warnings: string[];
  ambiguous: string[];
  language?: 'ru' | 'en';
}): string {
  const ru = input.language !== 'en';
  const lines: string[] = [];
  lines.push(
    ru
      ? '**Аудит рабочей среды завершён. Ничего не изменено.**'
      : '**Workspace audit complete. Nothing changed.**'
  );
  lines.push('');
  const sourceMessages = input.summary.sourceMessageCount ?? input.summary.messageCount;
  const conversations = input.summary.conversationCount;
  const openTasks = input.summary.openTaskCount ?? input.summary.taskCount;
  lines.push(
    ru
      ? `Проверено: ${input.summary.projectCount} проектов${conversations ? `, ${conversations} диалогов` : ''}, ${sourceMessages} сообщений, ${openTasks} открытых задач, ${input.summary.decisionCount ?? 0} решений, ${input.summary.materialCount ?? 0} материалов, ${input.summary.memoryCount} записей памяти, ${input.summary.githubLinkCount} GitHub-связей.`
      : `Checked: ${input.summary.projectCount} projects${conversations ? `, ${conversations} conversations` : ''}, ${sourceMessages} messages, ${openTasks} open tasks, ${input.summary.decisionCount ?? 0} decisions, ${input.summary.materialCount ?? 0} materials, ${input.summary.memoryCount} memory records, ${input.summary.githubLinkCount} GitHub links.`
  );
  lines.push(
    ru
      ? `Предложений: ${input.proposals.length}. Сомнительных записей: ${input.summary.questionableTaskCount ?? 0}. Очищено формулировок: ${input.summary.cleanedTaskCount ?? 0}. Неоднозначных случаев: ${input.ambiguous.length}. GitHub-ошибок: ${input.summary.githubErrorCount}. Устаревших резюме: ${input.summary.staleSummaryCount}.`
      : `Proposals: ${input.proposals.length}. Questionable records: ${input.summary.questionableTaskCount ?? 0}. Cleaned titles: ${input.summary.cleanedTaskCount ?? 0}. Ambiguous cases: ${input.ambiguous.length}. GitHub errors: ${input.summary.githubErrorCount}. Stale summaries: ${input.summary.staleSummaryCount}.`
  );
  if ((input.summary.contradictionCount ?? 0) > 0) {
    lines.push(
      ru
        ? `Противоречий в решениях: ${input.summary.contradictionCount}.`
        : `Decision contradictions: ${input.summary.contradictionCount}.`
    );
  }

  const numbered = input.proposals.map((proposal, index) => ({
    ...proposal,
    ordinal: 'ordinal' in proposal ? proposal.ordinal : index + 1,
  }));

  for (const group of GROUP_ORDER) {
    const items = numbered.filter((proposal) => group.operations.includes(proposal.operation));
    if (items.length === 0) continue;
    lines.push('', `**${group.title}**`);
    for (const proposal of items) {
      const project =
        'projectName' in proposal && proposal.projectName ? ` · ${proposal.projectName}` : '';
      lines.push(`${proposal.ordinal}. \`${riskMark(proposal.risk)}\` ${proposal.title}${project}`);
      if (proposal.reason) lines.push(`   — ${truncate(proposal.reason, 260)}`);
      if (proposal.expectedResult) {
        lines.push(`   → ${truncate(proposal.expectedResult, 220)}`);
      }
    }
  }

  if (input.ambiguous.length > 0) {
    lines.push(
      '',
      ru
        ? '**Неоднозначное — не будет изменено автоматически**'
        : '**Ambiguous — will not change automatically**'
    );
    for (const item of input.ambiguous.slice(0, 10)) {
      lines.push(`- ${truncate(item, 280)}`);
    }
  }

  if (input.warnings.length > 0) {
    lines.push('', ru ? '**Предупреждения**' : '**Warnings**');
    for (const item of input.warnings.slice(0, 6)) lines.push(`- ${truncate(item, 260)}`);
  }

  lines.push('');
  lines.push(
    ru
      ? 'Чтобы выполнить: «подтверди всё безопасное», «подтверди 1,3,5», «подтверди всё» или «отклони всё».'
      : 'To execute: “approve safe”, “approve 1,3,5”, “approve all” or “reject all”.'
  );
  lines.push(`audit: ${input.auditId.slice(0, 8)}`);

  return lines.join('\n').slice(0, 9_500);
}

export function formatGroomingExecution(input: {
  report: GroomingExecutionReport;
  language?: 'ru' | 'en';
}): string {
  const ru = input.language !== 'en';
  const { report } = input;
  const lines = [
    report.failed === 0 && report.stale === 0
      ? ru
        ? '**Порядок наведён по подтверждённому плану.**'
        : '**Workspace grooming completed.**'
      : ru
        ? '**План выполнен частично.**'
        : '**Plan partially completed.**',
    '',
    ru
      ? `Выполнено: ${report.executed}. Пропущено: ${report.skipped}. Ошибок: ${report.failed}. Устаревших: ${report.stale}.`
      : `Executed: ${report.executed}. Skipped: ${report.skipped}. Failed: ${report.failed}. Stale: ${report.stale}.`,
    '',
  ];

  for (const result of report.results.slice(0, 20)) {
    const mark =
      result.result === 'executed'
        ? '✓'
        : result.result === 'skipped'
          ? '↷'
          : result.result === 'stale'
            ? '!'
            : '×';
    lines.push(`${mark} ${result.title}`);
    if (result.detail) lines.push(`  ${truncate(result.detail, 260)}`);
    if (result.link) lines.push(`  ${result.link}`);
  }

  if (report.results.length > 20) {
    lines.push(
      ru
        ? `… и ещё ${report.results.length - 20} операций в журнале.`
        : `… and ${report.results.length - 20} more operations in the journal.`
    );
  }

  return lines.join('\n').slice(0, 9_500);
}

export function formatWorkspaceHealth(
  health: WorkspaceHealth,
  language: 'ru' | 'en' = 'ru'
): string {
  const ru = language !== 'en';
  const lines = [
    ru ? '**Состояние рабочей среды**' : '**Workspace health**',
    '',
    ru
      ? `Проектов: ${health.totalProjects}. Требуют внимания: ${health.attentionProjects}. Заблокировано: ${health.blockedProjects}.`
      : `Projects: ${health.totalProjects}. Attention: ${health.attentionProjects}. Blocked: ${health.blockedProjects}.`,
    ru
      ? `Устаревших задач: ${health.staleTasks}. Без проекта: ${health.unlinkedTasks}. Дублей: ${health.duplicateCandidates}. GitHub-ошибок: ${health.githubErrors}. Устаревших резюме: ${health.staleSummaries}.`
      : `Stale tasks: ${health.staleTasks}. Unlinked: ${health.unlinkedTasks}. Duplicates: ${health.duplicateCandidates}. GitHub errors: ${health.githubErrors}. Stale summaries: ${health.staleSummaries}.`,
  ];
  for (const project of health.projects) {
    lines.push(
      '',
      `- ${project.projectName}: ${project.state}${project.reasons.length ? ` — ${project.reasons.join('; ')}` : ''}`
    );
  }
  return lines.join('\n').slice(0, 6_000);
}
