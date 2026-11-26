import type { YouTubeVideoDetails } from './api';

/**
 * Deterministic metadata analysis.
 *
 * The analysis only reads metadata that YouTube already returned. It never
 * infers what a video is about, never invents facts and never writes to
 * YouTube. When the existing description is too thin to ground an improvement,
 * it says so and asks for a transcript/summary instead of generating copy.
 */

export type MetadataEditableField = 'title' | 'description' | 'tags';

export type MetadataEditableValues = {
  title: string;
  description: string;
  tags: string[];
};

export type MetadataIssue = {
  code: string;
  field: 'title' | 'description' | 'tags' | 'language' | 'context';
  severity: 'high' | 'medium' | 'low';
  message: string;
};

export type MetadataDiffRow = {
  field: MetadataEditableField;
  before: string | string[];
  after: string | string[];
  changed: boolean;
};

export type MetadataAnalysis = {
  projectSlug: string;
  issues: MetadataIssue[];
  suggestions: Partial<MetadataEditableValues>;
  proposedChanges: Partial<MetadataEditableValues>;
  diff: MetadataDiffRow[];
  confidence: 'high' | 'medium' | 'low';
  needsContext: boolean;
  contextRequest: string | null;
  summary: string;
  limitations: string[];
};

const PROJECT_TONE: Record<string, string> = {
  'art-engine': 'Art Engine: точный, исследовательский, без рекламных обещаний.',
  unframed: 'UNFRAMED: кинематографичный, сдержанный, без спойлеров.',
  pierrot: 'Pierrot: редакционный, наблюдательный, с ясной мыслью.',
  'heart-and-angel': 'Heart & Angel: тёплый, человеческий, без сентиментального шума.',
};

const GENERIC_TAGS = new Set([
  'video',
  'videos',
  'youtube',
  'new',
  'shorts',
  'short',
  'subscribe',
  'trending',
  'vlog',
]);

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'your',
  'you',
  'are',
  'was',
  'were',
  'how',
  'what',
  'why',
  'when',
  'into',
  'about',
  'over',
  'under',
  'как',
  'что',
  'это',
  'для',
  'или',
  'при',
  'над',
  'под',
  'без',
  'про',
  'его',
  'она',
  'они',
  'мы',
  'вы',
  'все',
  'ещё',
  'еще',
  'уже',
  'чем',
  'где',
  'когда',
  'почему',
  'который',
  'которая',
]);

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeTitle(value: string): string {
  const compact = normalizeWhitespace(value).replace(/\s*\|\s*/g, ' | ');

  if (compact.length > 10 && compact === compact.toUpperCase() && /[A-ZА-ЯЁ]/.test(compact)) {
    const lower = compact.toLocaleLowerCase();
    return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
  }

  return compact;
}

function scriptOf(value: string): 'cyrillic' | 'latin' | 'mixed' | 'none' {
  const cyrillic = (value.match(/[А-Яа-яЁё]/g) ?? []).length;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;

  if (cyrillic === 0 && latin === 0) return 'none';
  if (cyrillic > 0 && latin === 0) return 'cyrillic';
  if (latin > 0 && cyrillic === 0) return 'latin';
  if (cyrillic >= latin * 3) return 'cyrillic';
  if (latin >= cyrillic * 3) return 'latin';
  return 'mixed';
}

function sentences(value: string): string[] {
  return normalizeWhitespace(value)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 10);
}

function duplicateSentences(value: string): number {
  const seen = new Set<string>();
  let duplicates = 0;

  for (const sentence of sentences(value)) {
    const key = sentence.toLocaleLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }

  return duplicates;
}

function normalizeDescription(value: string): string {
  const lines = normalizeWhitespace(value).split('\n');
  const seenLines = new Set<string>();
  const seenSentences = new Set<string>();
  const kept: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const key = line.toLocaleLowerCase().replace(/\s+/g, ' ');

    if (!line) {
      if (kept.length > 0 && kept[kept.length - 1] !== '') kept.push('');
      continue;
    }

    // Timestamps can legitimately repeat across chapter blocks.
    if (/\d{1,2}:\d{2}/.test(line)) {
      kept.push(line);
      continue;
    }

    // Drop exact repeated lines, then repeated sentences inside a paragraph.
    if (seenLines.has(key)) continue;
    seenLines.add(key);

    const parts = line.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [line];
    const deduped = parts
      .filter((part) => {
        const sentence = part.trim();
        if (!sentence) return false;
        const sentenceKey = sentence.toLocaleLowerCase().replace(/\s+/g, ' ');
        if (seenSentences.has(sentenceKey)) return false;
        seenSentences.add(sentenceKey);
        return true;
      })
      .map((part) => part.trim())
      .join(' ')
      .trim();

    if (deduped) kept.push(deduped);
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeTags(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result.slice(0, 50);
}

function titleKeywords(title: string): string[] {
  return title
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter(
      (word) =>
        word.length >= 4 &&
        !STOPWORDS.has(word) &&
        !/^\d+$/.test(word) &&
        !GENERIC_TAGS.has(word)
    )
    .slice(0, 8);
}

const PROJECT_TAG: Record<string, string> = {
  'art-engine': 'art engine',
  unframed: 'unframed',
  pierrot: 'pierrot',
  'heart-and-angel': 'heart and angel',
};

function hasChapters(value: string): boolean {
  const stamps = value.match(/(?:^|\n)\s*\d{1,2}:\d{2}(?::\d{2})?/g);
  return Boolean(stamps && stamps.length >= 2);
}

function hasLinks(value: string): boolean {
  return /https?:\/\/\S+/i.test(value);
}

export function buildMetadataDiff(
  before: MetadataEditableValues,
  after: Partial<MetadataEditableValues>
): MetadataDiffRow[] {
  return (['title', 'description', 'tags'] as const).map((field) => {
    const previous = field === 'tags' ? before.tags : before[field];
    const next = after[field] !== undefined ? after[field]! : previous;
    const changed =
      field === 'tags'
        ? (previous as string[]).join('\n') !== (next as string[]).join('\n')
        : previous !== next;

    return { field, before: previous, after: next, changed };
  });
}

/**
 * Accepts only the three fields the current scope allows. Unknown keys are
 * dropped instead of being forwarded to YouTube.
 */
export function sanitizeMetadataChanges(value: unknown): Partial<MetadataEditableValues> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const input = value as Record<string, unknown>;
  const changes: Partial<MetadataEditableValues> = {};

  if (typeof input.title === 'string') changes.title = input.title.slice(0, 200);
  if (typeof input.description === 'string') {
    changes.description = input.description.slice(0, 5_200);
  }
  if (Array.isArray(input.tags)) {
    changes.tags = normalizeTags(
      input.tags.filter((tag): tag is string => typeof tag === 'string')
    );
  }

  return changes;
}

export function analyzeVideoMetadata(input: {
  video: YouTubeVideoDetails;
  projectSlug: string;
}): MetadataAnalysis {
  const { video, projectSlug } = input;
  const issues: MetadataIssue[] = [];
  const title = normalizeTitle(video.title);
  const description = normalizeDescription(video.description);
  const tags = normalizeTags(video.tags);
  const titleScript = scriptOf(video.title);
  const descriptionScript = scriptOf(video.description);
  const tagScript = scriptOf(video.tags.join(' '));

  if (!video.title.trim()) {
    issues.push({
      code: 'empty_title',
      field: 'title',
      severity: 'high',
      message: 'Заголовок пуст.',
    });
  } else if (video.title.trim().length < 18) {
    issues.push({
      code: 'short_title',
      field: 'title',
      severity: 'medium',
      message: 'Заголовок короткий: зрителю может не хватать контекста.',
    });
  } else if (video.title.trim().length > 90) {
    issues.push({
      code: 'long_title',
      field: 'title',
      severity: 'low',
      message: 'Заголовок близок к лимиту YouTube и может обрезаться.',
    });
  }

  if (video.title === video.title.toUpperCase() && video.title.length > 12) {
    issues.push({
      code: 'all_caps_title',
      field: 'title',
      severity: 'low',
      message: 'Заголовок набран заглавными и хуже читается.',
    });
  }

  if (!video.description.trim()) {
    issues.push({
      code: 'empty_description',
      field: 'description',
      severity: 'high',
      message: 'Описание пустое.',
    });
  } else if (video.description.trim().length < 120) {
    issues.push({
      code: 'short_description',
      field: 'description',
      severity: 'medium',
      message: 'Описание слишком короткое для поиска и контекста.',
    });
  }

  if (duplicateSentences(video.description) > 0) {
    issues.push({
      code: 'repeated_description',
      field: 'description',
      severity: 'medium',
      message: 'В описании есть повторяющиеся предложения.',
    });
  }

  if ((video.durationSeconds ?? 0) >= 300 && !hasChapters(video.description)) {
    issues.push({
      code: 'missing_chapters',
      field: 'description',
      severity: 'medium',
      message: 'Для длинного видео не найдены главы с таймкодами.',
    });
  }

  if (!hasLinks(video.description)) {
    issues.push({
      code: 'missing_links',
      field: 'description',
      severity: 'low',
      message: 'В описании нет ссылок на релевантные материалы проекта.',
    });
  }

  if (tags.length === 0) {
    issues.push({
      code: 'missing_tags',
      field: 'tags',
      severity: 'high',
      message: 'Теги отсутствуют.',
    });
  } else if (tags.length < 4) {
    issues.push({
      code: 'few_tags',
      field: 'tags',
      severity: 'medium',
      message: 'Слишком мало тегов.',
    });
  }

  const generic = tags.filter((tag) => GENERIC_TAGS.has(tag.toLocaleLowerCase()));
  if (generic.length > 0) {
    issues.push({
      code: 'generic_tags',
      field: 'tags',
      severity: 'low',
      message: `Слишком общие теги: ${generic.slice(0, 4).join(', ')}.`,
    });
  }

  if (video.tags.length !== tags.length) {
    issues.push({
      code: 'duplicate_tags',
      field: 'tags',
      severity: 'low',
      message: 'В тегах есть повторы без учёта регистра.',
    });
  }

  if (
    titleScript !== 'none' &&
    descriptionScript !== 'none' &&
    titleScript !== 'mixed' &&
    descriptionScript !== 'mixed' &&
    titleScript !== descriptionScript
  ) {
    issues.push({
      code: 'language_mismatch',
      field: 'language',
      severity: 'medium',
      message: 'Язык заголовка и описания не совпадает.',
    });
  }

  if (
    descriptionScript !== 'none' &&
    tagScript !== 'none' &&
    descriptionScript !== 'mixed' &&
    tagScript !== 'mixed' &&
    descriptionScript !== tagScript
  ) {
    issues.push({
      code: 'tag_language_mismatch',
      field: 'language',
      severity: 'low',
      message: 'Теги написаны на другом языке, чем описание.',
    });
  }

  const needsContext = video.description.trim().length < 80;
  const projectTag = PROJECT_TAG[projectSlug];
  const suggestedTags = normalizeTags([
    ...tags.filter((tag) => !GENERIC_TAGS.has(tag.toLocaleLowerCase())),
    ...titleKeywords(video.title),
    ...(projectTag ? [projectTag] : []),
  ]);

  const suggestions: Partial<MetadataEditableValues> = {};

  if (title !== video.title && title) suggestions.title = title.slice(0, 100);
  if (description !== video.description && description) {
    suggestions.description = description.slice(0, 5_000);
  }
  if (suggestedTags.join('\n') !== tags.join('\n')) suggestions.tags = suggestedTags;

  const diff = buildMetadataDiff(
    { title: video.title, description: video.description, tags: video.tags },
    suggestions
  );
  const proposedChanges: Partial<MetadataEditableValues> = {};

  for (const row of diff) {
    if (!row.changed) continue;
    if (row.field === 'title' && typeof row.after === 'string') {
      proposedChanges.title = row.after;
    }
    if (row.field === 'description' && typeof row.after === 'string') {
      proposedChanges.description = row.after;
    }
    if (row.field === 'tags' && Array.isArray(row.after)) {
      proposedChanges.tags = row.after;
    }
  }

  const high = issues.filter((issue) => issue.severity === 'high').length;
  const medium = issues.filter((issue) => issue.severity === 'medium').length;
  const confidence = needsContext || high > 0 ? 'low' : medium > 0 ? 'medium' : 'high';

  return {
    projectSlug,
    issues,
    suggestions,
    proposedChanges,
    diff,
    confidence,
    needsContext,
    contextRequest: needsContext
      ? 'Описание слишком короткое, чтобы предлагать содержательный текст без домыслов. Пришлите транскрипт, краткое содержание или тезисы ролика.'
      : null,
    summary:
      issues.length === 0
        ? 'Критичных проблем в метаданных не найдено. Предложений без изменения фактов нет.'
        : `Найдено проблем: ${issues.length} (высоких: ${high}, средних: ${medium}). Предложения используют только текущие метаданные.`,
    limitations: [
      'Анализ не смотрит само видео и не проверяет, соответствует ли описание содержанию.',
      'Предложения не добавляют факты, ссылки или обещания, которых нет в текущих метаданных.',
      PROJECT_TONE[projectSlug]
        ? `Редакционная тональность: ${PROJECT_TONE[projectSlug]}`
        : 'Редакционная тональность проекта не задана.',
      'Ничего не записывается на YouTube до отдельного подтверждения владельца.',
    ],
  };
}
