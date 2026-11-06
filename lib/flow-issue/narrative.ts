import { heuristicLanguage, keywordTokens } from './analysis';
import type { IssueAI, IssueEntry, IssueLang } from './types';

export type IssueNarrative = {
  /** Short phrase for the header metric card. Keep it under 70 characters. */
  summary: string;
  /** Two or three short paragraphs for Pierrot's author column. */
  paragraphs: string[];
};

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function entriesWord(count: number, lang: IssueLang): string {
  if (lang === 'en') return count === 1 ? 'entry' : 'entries';

  const last = count % 10;
  const lastTwo = count % 100;

  if (last === 1 && lastTwo !== 11) return 'запись';
  if (last >= 2 && last <= 4 && (lastTwo < 10 || lastTwo >= 20)) {
    return 'записи';
  }

  return 'записей';
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();

    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(value.replace(/\s+/g, ' ').trim());
  }

  return result;
}

function themeCandidates(items: IssueEntry[], analyses: Map<string, IssueAI>): string[] {
  const fromAnalysis: string[] = [];
  const fromTitles: string[] = [];

  for (const item of items) {
    const analysis = analyses.get(item.id);

    if (analysis) {
      for (const value of [analysis.topic, analysis.subtopic]) {
        const text = clean(value);
        if (!text || text.length > 48) continue;
        fromAnalysis.push(text);
      }
    }

    const title = clean(item.title);
    if (title) fromTitles.push(title);
  }

  return unique([...fromAnalysis, ...fromTitles]);
}

/** Keeps only themes that are written in the target language. */
function themesForLanguage(
  items: IssueEntry[],
  analyses: Map<string, IssueAI>,
  lang: IssueLang
): string[] {
  const candidates = themeCandidates(items, analyses);
  const matched = candidates.filter((value) => {
    const detected = heuristicLanguage(value);
    return detected === lang || detected === 'other';
  });

  if (matched.length > 0) return matched.slice(0, 3);

  // Translation may not have reached the analysis labels yet, so fall back
  // to the visible titles. Those are already language-correct in the payload.
  const keywords = items.flatMap((item) => keywordTokens(clean(item.title)));

  return unique(keywords)
    .filter((word) => word.length >= 3 && word.length <= 24)
    .slice(0, 3);
}

function shortSummary(themes: string[], lang: IssueLang): string {
  const fallback = lang === 'ru' ? 'Смыслы, которые остались' : 'The signals that remained';

  if (themes.length === 0) return fallback;

  const summary = themes.slice(0, 3).join(' · ');

  if (summary.length <= 70) return summary;

  return `${summary.slice(0, 67).trimEnd()}…`;
}

/**
 * Deterministic narrative used when the model is unavailable (or when the
 * material is not allowed to leave the server). It still derives its themes
 * from the per-item AI analyses, but never invents facts.
 */
export function buildFallbackNarrative(
  items: IssueEntry[],
  analyses: Map<string, IssueAI>,
  lang: IssueLang
): IssueNarrative {
  const count = items.length;
  const themes = themesForLanguage(items, analyses, lang);
  const lead = items[0] ?? null;
  const leadAnalysis = lead ? analyses.get(lead.id) : null;
  const rawThesis = clean(leadAnalysis?.thesis) || clean(leadAnalysis?.summary);
  const thesisLanguage = rawThesis ? heuristicLanguage(rawThesis) : 'other';
  const thesis = thesisLanguage === lang || thesisLanguage === 'other' ? rawThesis : '';
  const leadTitle = clean(lead?.title);
  const own = items.filter((item) => item.own).length;
  const external = Math.max(0, count - own);

  const summary = shortSummary(themes, lang);

  if (lang === 'ru') {
    const themeLine =
      themes.length > 0
        ? `Основные темы: ${themes.join(', ')}.`
        : 'Темы собраны из отдельных наблюдений периода.';

    return {
      summary,
      paragraphs: [
        `В выпуске — ${count} ${entriesWord(count, lang)}. ${themeLine}`,
        `${
          leadTitle
            ? `Главный материал: «${leadTitle}».`
            : 'Главный материал определён редакционным отбором.'
        }${thesis ? ` Его тезис: ${thesis}` : ''}${
          own + external > 0 ? ` В отборе: ${own} своих материалов, ${external} внешних.` : ''
        }`,
      ],
    };
  }

  const themeLine =
    themes.length > 0
      ? `Main threads: ${themes.join(', ')}.`
      : 'The threads are assembled from separate observations in the period.';

  return {
    summary,
    paragraphs: [
      `This issue holds ${count} ${entriesWord(count, lang)}. ${themeLine}`,
      `${
        leadTitle
          ? `Main material: “${leadTitle}”.`
          : 'The main material was chosen by the editorial selection.'
      }${thesis ? ` Its thesis: ${thesis}` : ''}${
        own + external > 0
          ? ` The selection contains ${own} own and ${external} external materials.`
          : ''
      }`,
    ],
  };
}

export function normalizeNarrative(value: unknown, lang: IssueLang): IssueNarrative | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const summary = clean(record.summary).slice(0, 70);
  const paragraphs = Array.isArray(record.paragraphs)
    ? record.paragraphs.map(clean).filter(Boolean).slice(0, 3)
    : [];

  if (!summary || paragraphs.length < 2) return null;

  return {
    summary,
    paragraphs: paragraphs.map((paragraph) => paragraph.slice(0, 700)),
  };
}

export function narrativeFromAnalysis(
  items: IssueEntry[],
  analyses: Map<string, IssueAI>,
  lang: IssueLang
): IssueNarrative {
  return buildFallbackNarrative(items, analyses, lang);
}
