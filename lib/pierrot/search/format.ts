import type { UnifiedSearchHit, UnifiedSearchResult } from './types';

const SOURCE_LABEL: Record<UnifiedSearchHit['source'], string> = {
  conversation: 'Разговоры',
  task: 'Задачи',
  decision: 'Решения',
  memory: 'Память',
  document: 'Документы',
  artifact: 'Материалы',
  issue: 'GitHub Issues',
};

export function formatUnifiedSearchReport(
  result: UnifiedSearchResult,
  language: 'ru' | 'en' = 'ru'
): string {
  const ru = language === 'ru';
  const lines: string[] = [];
  const projectLabel = result.project
    ? ru
      ? ` по проекту «${result.project.name}»`
      : ` in “${result.project.name}”`
    : '';

  if (result.hits.length === 0) {
    return [
      ru
        ? `Ничего не нашёл${projectLabel} по запросу «${result.query}».`
        : `I found nothing${projectLabel} for “${result.query}”.`,
      ...result.notes,
    ].join('\n');
  }

  lines.push(
    ru
      ? `Нашёл ${result.hits.length} фрагментов${projectLabel}. Показываю источник и короткую выдержку, без копирования целых диалогов.`
      : `Found ${result.hits.length} items${projectLabel}. Source and a short excerpt only; full conversations are not copied.`
  );

  const groups = new Map<UnifiedSearchHit['source'], UnifiedSearchHit[]>();
  for (const hit of result.hits) {
    const list = groups.get(hit.source) || [];
    list.push(hit);
    groups.set(hit.source, list);
  }

  for (const [source, items] of groups) {
    lines.push('', `### ${SOURCE_LABEL[source]}`);
    for (const hit of items.slice(0, 8)) {
      const project = hit.projectName ? ` · ${hit.projectName}` : '';
      const status = hit.status ? ` · ${hit.status}` : '';
      const date = hit.updatedAt ? ` · ${hit.updatedAt.slice(0, 10)}` : '';
      lines.push(`- **${hit.title}**${project}${status}${date}`);
      if (hit.snippet) lines.push(`  ${hit.snippet}`);
      if (hit.href) lines.push(`  [Открыть](${hit.href})`);
    }
  }

  for (const note of result.notes) lines.push('', note);
  return lines.join('\n').slice(0, 8_000);
}
