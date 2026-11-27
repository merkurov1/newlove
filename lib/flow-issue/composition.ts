import { hasTextContent } from '@/lib/flow/text';
import {
  MIN_LEAD_SCORE,
  MIN_SELECTION_SCORE,
  areNearDuplicates,
  isHeuristicAnalysis,
  selectionScore,
  type IssueCandidate,
} from './editorial';
import type {
  EditorialComposition,
  EditorialDiagnostics,
  EditorialLedgerEntry,
  EditorialMaterialRole,
  EditorialPart,
  EditorialPartKind,
  FlowItem,
  IssueAI,
  IssueEntry,
  IssueLang,
  IssuePayload,
} from './types';

/**
 * Editorial composition of a whole Flow period.
 *
 * The composition is deliberately separate from the legacy section arrays:
 *
 * 1. `ledger` is the completeness contract. Every published public record of
 *    the period appears exactly once, whatever its type, length, transcript
 *    or AI score.
 * 2. `parts` is the meaning: a sequence of an optional central line,
 *    thematic lines, context, standalone episodes, a visual pause, sources
 *    and a full archive. There are no fixed quotas and no empty rubrics.
 * 3. Everything that was not chosen for the main line lands in `archive`.
 *    It is still visible to the reader instead of silently disappearing.
 */

export const EDITORIAL_COMPOSITION_VERSION = 1;

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function languageMatches(value: string, lang: IssueLang): boolean {
  if (!value) return false;

  let cyrillic = 0;
  let latin = 0;

  for (const char of value.slice(0, 600)) {
    if (/[А-Яа-яЁё]/.test(char)) cyrillic++;
    else if (/[A-Za-z]/.test(char)) latin++;
  }

  if (lang === 'ru') return cyrillic >= latin;
  return latin >= cyrillic;
}

function localizedText(value: string, lang: IssueLang): string {
  const text = clean(value);
  return text && languageMatches(text, lang) ? text : '';
}

function publishedTime(entry: IssueEntry | undefined): number {
  if (!entry) return 0;
  const date = new Date(entry.publishedAt);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function candidateTime(candidate: IssueCandidate | undefined): number {
  return publishedTime(candidate?.entry);
}

function compareCandidates(first: IssueCandidate, second: IssueCandidate): number {
  return (
    selectionScore(second) - selectionScore(first) ||
    candidateTime(second) - candidateTime(first) ||
    first.entry.id.localeCompare(second.entry.id)
  );
}

/** Whether the material carries anything the reader can actually receive. */
export function entryHasMaterial(entry: IssueEntry | undefined): boolean {
  if (!entry) return false;

  const metadata = entry.metadata || {};

  if (entry.type === 'photo') {
    return Boolean(
      clean(metadata.public_url) ||
        clean(metadata.alt) ||
        clean(metadata.caption) ||
        clean(entry.image) ||
        clean(entry.title) ||
        clean(entry.body) ||
        hasTextContent(entry)
    );
  }

  if (entry.type === 'video') {
    return Boolean(
      clean(metadata.youtube?.video_id) ||
        clean(metadata.youtube?.title) ||
        clean(entry.title) ||
        clean(entry.url) ||
        hasTextContent(entry)
    );
  }

  return Boolean(
    clean(entry.title) ||
      clean(entry.body) ||
      clean(entry.description) ||
      clean(entry.url) ||
      // Imported or future item types may keep all prose in metadata.
      hasTextContent(entry)
  );
}

function roleReason(
  role: EditorialMaterialRole,
  lang: IssueLang,
  subject: string
): string {
  const suffix = subject ? ` «${subject.slice(0, 80)}»` : '';

  if (lang === 'ru') {
    switch (role) {
      case 'centerpiece':
        return `Открывает выпуск и задаёт его главную мысль${suffix}.`;
      case 'thread':
        return `Продолжает тематическую линию${suffix}.`;
      case 'context':
        return `Даёт контекст, без которого главная линия читается хуже${suffix}.`;
      case 'episode':
        return `Самостоятельный сюжет недели, не требующий общей рамки${suffix}.`;
      case 'visual':
        return `Визуальная пауза: кадр как самостоятельный материал${suffix}.`;
      case 'source':
        return `Источник и дополнительное чтение${suffix}.`;
      case 'archive':
        return `Сохранён в полном обзоре выпуска; не вошёл в главную линию${suffix}.`;
      case 'unavailable':
        return `Недостаточно данных для содержательного анализа; показан в полном обзоре с нейтральной подписью${suffix}.`;
      case 'other_edition':
        return `Материал опубликован в другом языковом выпуске этой недели${suffix}.`;
    }
  }

  switch (role) {
    case 'centerpiece':
      return `Opens the issue and sets its main idea${suffix}.`;
    case 'thread':
      return `Continues a thematic line${suffix}.`;
    case 'context':
      return `Supplies context the main line needs${suffix}.`;
    case 'episode':
      return `A standalone story of the week${suffix}.`;
    case 'visual':
      return `A visual pause: the frame as a material in its own right${suffix}.`;
    case 'source':
      return `A source and further reading${suffix}.`;
    case 'archive':
      return `Kept in the issue's full overview; outside the main line${suffix}.`;
    case 'unavailable':
      return `Not enough data for a substantive analysis; shown in the full overview with a neutral caption${suffix}.`;
    case 'other_edition':
      return `Published in this week's other language edition${suffix}.`;
  }
}

function partKindRole(kind: EditorialPartKind): EditorialMaterialRole {
  switch (kind) {
    case 'central':
      return 'centerpiece';
    case 'thread':
      return 'thread';
    case 'context':
      return 'context';
    case 'episode':
      return 'episode';
    case 'visual':
      return 'visual';
    case 'sources':
      return 'source';
    case 'archive':
      return 'archive';
  }
}

function partId(kind: EditorialPartKind, index: number): string {
  return kind === 'central' ? 'central' : `${kind}-${index}`;
}

function entryTitle(entry: IssueEntry | undefined, ledgerTitle: string): string {
  return clean(entry?.title) || clean(ledgerTitle);
}

function makePart(
  kind: EditorialPartKind,
  index: number,
  lang: IssueLang,
  title: string,
  annotation: string,
  entryIds: string[]
): EditorialPart {
  return {
    id: partId(kind, index),
    kind,
    title,
    annotation,
    entryIds,
  };
}

function threadTitle(topic: string): string {
  return clean(topic) || '';
}

function genericConcept(lang: IssueLang): { title: string; headline: string; thesis: string } {
  return lang === 'ru'
    ? {
        title: 'Несколько линий недели',
        headline: 'Несколько линий недели',
        thesis:
          'У этой недели нет одного центрального сюжета: несколько самостоятельных линий идут параллельно и пересекаются в отдельных точках.',
      }
    : {
        title: 'Several lines of the week',
        headline: 'Several lines of the week',
        thesis:
          'This week has no single central story: several independent lines run in parallel and meet at a few points.',
      };
}

function buildFallbackColumn(
  lang: IssueLang,
  concept: { title: string; thesis: string },
  parts: EditorialPart[],
  ledger: EditorialLedgerEntry[],
  sourceCount: number
): string[] {
  const modelAnalyses = ledger.filter((entry) => entry.analysis === 'model').length;
  const ownCount = ledger.filter((entry) => entry.own && entry.role !== 'other_edition').length;
  const externalCount = ledger.filter((entry) => !entry.own && entry.role !== 'other_edition').length;
  const media = ledger.filter((entry) => entry.type === 'photo' || entry.type === 'video').length;
  const secondary = ledger.filter(
    (entry) =>
      entry.role !== 'other_edition' &&
      entry.role !== 'centerpiece' &&
      entry.role !== 'thread' &&
      entry.role !== 'context'
  ).length;
  const threadParts = parts.filter(
    (part) => part.kind === 'thread' || part.kind === 'episode'
  ).length;

  if (lang === 'ru') {
    const first = concept.thesis
      ? `${concept.thesis} Эта мысль не навязана неделе: она собрана из того, как материалы отвечают друг другу.`
      : 'Выпуск собирается не по рубрикам, а по движению мысли: соседство материалов важнее их формата.';

    const second =
      threadParts > 1
        ? `Рядом с главной линией идут ${threadParts} самостоятельных хода. Они не выстраиваются в одну иерархию: где-то повторяется мотив, где-то возникает контраст, а где-то материал остаётся отдельным эпизодом.`
        : 'Главная линия не закрывает выпуск: часть материалов продолжает её, часть спорит с ней, часть существует отдельно.';

    const third = `В полном обзоре сохранены все ${sourceCount} ${sourceCount === 1 ? 'материал' : 'материалов'} периода, включая ${media} фото и видео и ${secondary} ${secondary === 1 ? 'запись' : 'записей'} вне главной линии. Там же — записи без текста, транскрипта или высокой оценки: они не исчезают, но и не получают выдуманного содержания.`;

    const coverage = `Из них ${ownCount} ${ownCount === 1 ? 'свой материал' : 'своих материалов'} и ${externalCount} внешних; ${modelAnalyses} ${modelAnalyses === 1 ? 'разобран' : 'разобраны'} модельным анализом, остальные опираются на видимые данные и локальную эвристику.`;

    return [first, `${second} ${coverage}`, third];
  }

  const first = concept.thesis
    ? `${concept.thesis} The idea is not imposed on the week: it comes from the way the materials answer one another.`
    : 'The issue is assembled not by sections but by the movement of thought: what sits next to what matters more than the format.';

  const second =
    threadParts > 1
      ? `Alongside the main line there are ${threadParts} independent turns. They are not ranked into a single hierarchy: a motif repeats in one place, a contrast appears in another, and some material remains a standalone episode.`
      : 'The main line does not close the issue: some materials continue it, some argue with it, and some stand on their own.';

  const third = `The full overview keeps all ${sourceCount} materials of the period, including ${media} photos and videos and ${secondary} entries outside the main line. It also keeps records without text, a transcript or a high score: they do not disappear, and no content is invented for them.`;

  const coverage = `Of these, ${ownCount} are own materials and ${externalCount} are external; ${modelAnalyses} were read with a model analysis, while the rest rely on visible data and the local heuristic.`;

  return [first, `${second}${coverage}`, third];
}

export type ComposeIssueInput = {
  lang: IssueLang;
  period: { start: string; end: string };
  /** Every published public record in the period, before edition filtering. */
  records: FlowItem[];
  /** IDs that belong to this language edition (photos may belong to one). */
  editionIds: Set<string>;
  /** Presentation entries for every record, keyed by ID. */
  entries: Map<string, IssueEntry>;
  analyses: Map<string, IssueAI>;
  /** Editorial candidates for this edition, keyed by ID. */
  candidates: Map<string, IssueCandidate>;
  /** Legacy lead chosen by the existing selector, reused as the centrepiece. */
  leadId?: string | null;
  windowEnd: Date;
};

function modelAnalysis(entry: EditorialLedgerEntry): boolean {
  return entry.analysis === 'model';
}

/**
 * Build the editorial composition for one edition. The result is reconciled
 * before it is returned, so a caller cannot receive a payload with silently
 * missing IDs.
 */
export function buildEditorialComposition(input: ComposeIssueInput): EditorialComposition {
  const { lang, records, editionIds, entries, analyses, candidates, leadId } = input;

  const uniqueRecords = new Map<string, FlowItem>();

  for (const record of records) {
    const id = clean(record.id);
    if (!id || uniqueRecords.has(id)) continue;
    uniqueRecords.set(id, record);
  }

  const ledger = new Map<string, EditorialLedgerEntry>();

  for (const record of uniqueRecords.values()) {
    const entry = entries.get(record.id);
    const analysis = analyses.get(record.id);
    const analysisSource = !analysis
      ? 'none'
      : isHeuristicAnalysis(analysis)
        ? 'heuristic'
        : 'model';
    const title = entryTitle(entry, clean(record.title));
    const inEdition = editionIds.has(record.id);
    const hasMaterial = entryHasMaterial(entry);
    const role: EditorialMaterialRole = inEdition
      ? hasMaterial
        ? 'archive'
        : 'unavailable'
      : 'other_edition';

    ledger.set(record.id, {
      id: record.id,
      type: String(record.type || entry?.type || 'note'),
      role,
      reason: roleReason(role, lang, title),
      partIndex: null,
      aiAllowed: record.ai_allowed === true,
      own: entry?.own === true,
      analysis: analysisSource,
      title,
    });
  }

  const usable = (id: string): boolean => {
    if (!editionIds.has(id)) return false;
    return entryHasMaterial(entries.get(id));
  };

  const scored = [...candidates.values()]
    .filter((candidate) => usable(candidate.entry.id))
    .sort(compareCandidates);

  const used = new Set<string>();
  const parts: EditorialPart[] = [];

  const pushPart = (
    kind: EditorialPartKind,
    title: string,
    annotation: string,
    ids: string[]
  ) => {
    const entryIds = unique(ids).filter((id) => {
      if (used.has(id) || !editionIds.has(id) || !usable(id)) return false;
      used.add(id);
      return true;
    });

    if (!entryIds.length) return;

    const index = parts.filter((part) => part.kind === kind).length + 1;
    const part = makePart(kind, index, lang, title, annotation, entryIds);
    const role = partKindRole(kind);
    const partIndex = parts.length;

    parts.push(part);

    for (const id of entryIds) {
      const current = ledger.get(id);
      if (!current) continue;

      ledger.set(id, {
        ...current,
        role,
        partIndex,
        reason: roleReason(role, lang, current.title),
      });
    }
  };

  const leadCandidate =
    (leadId ? candidates.get(leadId) : undefined) ||
    scored.find(
      (candidate) =>
        candidate.entry.type !== 'photo' &&
        !isHeuristicAnalysis(candidate.analysis) &&
        selectionScore(candidate) >= MIN_LEAD_SCORE
    ) ||
    null;

  if (leadCandidate && selectionScore(leadCandidate) >= MIN_SELECTION_SCORE) {
    const leadEntry = entries.get(leadCandidate.entry.id);
    const leadAnalysis = analyses.get(leadCandidate.entry.id);
    const topic = localizedText(clean(leadAnalysis?.topic), lang);
    const title =
      topic ||
      (lang === 'ru' ? 'Главная линия недели' : 'The week’s main line');
    const thesis =
      localizedText(clean(leadAnalysis?.thesis), lang) ||
      localizedText(clean(leadAnalysis?.summary), lang) ||
      localizedText(clean(leadEntry?.body).split(/(?<=[.!?…])\s+/)[0] || '', lang);

    pushPart('central', title, thesis, [leadCandidate.entry.id]);
  }

  // Thematic lines: topics represented by at least two usable materials.
  const topicGroups = new Map<string, IssueCandidate[]>();

  for (const candidate of scored) {
    if (used.has(candidate.entry.id)) continue;

    const topic = clean(candidate.analysis.topic).toLowerCase();
    if (!topic || topic === 'unclassified') continue;

    const group = topicGroups.get(topic) || [];
    group.push(candidate);
    topicGroups.set(topic, group);
  }

  const threadGroups = [...topicGroups.values()]
    .filter((group) => group.length >= 2)
    .map((group) => {
      const kept: IssueCandidate[] = [];

      for (const candidate of group) {
        if (selectionScore(candidate) < MIN_SELECTION_SCORE) continue;
        if (kept.some((existing) => areNearDuplicates(candidate, existing))) continue;
        kept.push(candidate);
      }

      return { group: kept, score: kept.length ? selectionScore(kept[0]) : 0 };
    })
    .filter((entry) => entry.group.length >= 2)
    .sort(
      (first, second) =>
        second.score - first.score ||
        candidateTime(second.group[0]) - candidateTime(first.group[0]) ||
        first.group[0].entry.id.localeCompare(second.group[0].entry.id)
    );

  for (const { group } of threadGroups) {
    const topic = threadTitle(clean(group[0].analysis.topic));
    const title =
      localizedText(topic, lang) ||
      (lang === 'ru' ? 'Тематическая линия' : 'Thematic line');
    const annotation =
      lang === 'ru'
        ? 'Материалы этой линии не повторяют друг друга: они развивают один мотив с разных сторон.'
        : 'The materials in this line do not repeat one another: they develop one motif from different sides.';

    pushPart(
      'thread',
      title,
      annotation,
      group.map((candidate) => candidate.entry.id)
    );
  }

  const remaining = scored.filter((candidate) => !used.has(candidate.entry.id));

  // Context: anything whose own analysis says that outside knowledge is needed.
  pushPart(
    'context',
    lang === 'ru' ? 'Контекст' : 'Context',
    lang === 'ru'
      ? 'Эти материалы объясняют, откуда взялась главная линия и что делает её возможной.'
      : 'These materials explain where the main line comes from and what makes it possible.',
    remaining
      .filter((candidate) => {
        const context = clean(candidate.analysis.contextRequired);
        return (
          context.length > 0 &&
          selectionScore(candidate) >= MIN_SELECTION_SCORE
        );
      })
      .map((candidate) => candidate.entry.id)
  );

  // Standalone episodes: separate stories that do not need a shared frame.
  pushPart(
    'episode',
    lang === 'ru' ? 'Отдельные сюжеты' : 'Standalone stories',
    lang === 'ru'
      ? 'Не всё в неделе обязано сходиться в одну тему. Здесь — самостоятельные наблюдения, у которых своя логика.'
      : 'Not everything in a week has to converge on one theme. Here are independent observations with their own logic.',
    scored
      .filter(
        (candidate) =>
          !used.has(candidate.entry.id) &&
          candidate.entry.type !== 'photo' &&
          candidate.entry.type !== 'link' &&
          selectionScore(candidate) >= MIN_SELECTION_SCORE
      )
      .map((candidate) => candidate.entry.id)
  );

  // Photos are materials, not decoration: a visual pause is part of the story.
  pushPart(
    'visual',
    lang === 'ru' ? 'Визуальная пауза' : 'Visual pause',
    lang === 'ru'
      ? 'Кадры недели. Они не иллюстрируют текст, а держат собственный ритм выпуска.'
      : 'The frames of the week. They do not illustrate the text; they keep their own rhythm.',
    scored
      .filter(
        (candidate) =>
          !used.has(candidate.entry.id) &&
          candidate.entry.type === 'photo'
      )
      .map((candidate) => candidate.entry.id)
  );

  // Links that are not part of a line stay available as further reading.
  pushPart(
    'sources',
    lang === 'ru' ? 'Источники и дополнительное чтение' : 'Sources and further reading',
    lang === 'ru'
      ? 'Внешние материалы недели. Мы показываем только их реальные заголовки и метаданные и не приписываем им непрочитанное содержание.'
      : 'External materials of the week. We show only their real titles and metadata and never attribute unread content to them.',
    scored
      .filter(
        (candidate) =>
          !used.has(candidate.entry.id) &&
          candidate.entry.type === 'link'
      )
      .map((candidate) => candidate.entry.id)
  );

  // Everything else remains in the issue through the full overview.
  pushPart(
    'archive',
    lang === 'ru' ? 'Полный обзор выпуска' : 'Full overview of the issue',
    lang === 'ru'
      ? 'Все материалы периода, не вошедшие в главную линию, сохраняются здесь с рабочими ссылками и доступными метаданными.'
      : 'Every material of the period that is not part of the main line stays here with working links and available metadata.',
    scored.map((candidate) => candidate.entry.id)
  );

  // Entries that are not usable enough for ranking still belong to the ledger.
  const stillUnassigned = [...ledger.values()].filter(
    (entry) => entry.role !== 'other_edition' && entry.partIndex === null
  );

  if (stillUnassigned.length) {
    const archiveIndex = parts.findIndex((part) => part.kind === 'archive');

    if (archiveIndex >= 0) {
      const archive = parts[archiveIndex];
      const ids = unique([...archive.entryIds, ...stillUnassigned.map((entry) => entry.id)]);

      parts[archiveIndex] = { ...archive, entryIds: ids };

      for (const entry of stillUnassigned) {
        ledger.set(entry.id, {
          ...entry,
          role: entry.role,
          partIndex: archiveIndex,
        });
      }
    } else if (stillUnassigned.length) {
      const index = parts.length;
      parts.push(
        makePart(
          'archive',
          1,
          lang,
          lang === 'ru' ? 'Полный обзор выпуска' : 'Full overview of the issue',
          lang === 'ru'
            ? 'Материалы без достаточного анализа сохраняются с нейтральной подписью.'
            : 'Materials without enough analysis are kept with a neutral caption.',
          stillUnassigned.map((entry) => entry.id)
        )
      );

      for (const entry of stillUnassigned) {
        ledger.set(entry.id, { ...entry, partIndex: index });
      }
    }
  }

  // Make sure every edition entry has a part even when it was not a candidate.
  const assignedIds = new Set(parts.flatMap((part) => part.entryIds));
  const orphaned = [...ledger.values()].filter(
    (entry) =>
      entry.role !== 'other_edition' && !assignedIds.has(entry.id)
  );

  if (orphaned.length) {
    const archiveIndex = parts.findIndex((part) => part.kind === 'archive');

    if (archiveIndex >= 0) {
      parts[archiveIndex] = {
        ...parts[archiveIndex],
        entryIds: unique([...parts[archiveIndex].entryIds, ...orphaned.map((entry) => entry.id)]),
      };

      for (const entry of orphaned) {
        ledger.set(entry.id, { ...entry, partIndex: archiveIndex });
      }
    }
  }

  const ledgerEntries = [...ledger.values()];
  const concept = buildConcept(lang, parts, ledgerEntries, entries, analyses, leadCandidate);
  const column = buildFallbackColumn(lang, concept, parts, ledgerEntries, records.length);

  const composition: EditorialComposition = {
    version: EDITORIAL_COMPOSITION_VERSION,
    concept,
    parts,
    ledger: ledgerEntries,
    column,
    columnSource: 'fallback',
    summary: shortSummary(concept.title, lang),
    generatedBy: ledgerEntries.some(modelAnalysis) ? 'hybrid' : 'heuristic',
    diagnostics: emptyDiagnostics(lang),
  };

  return reconcileEditorialComposition(composition, records, entries);
}

function buildConcept(
  lang: IssueLang,
  parts: EditorialPart[],
  ledger: EditorialLedgerEntry[],
  entries: Map<string, IssueEntry>,
  analyses: Map<string, IssueAI>,
  leadCandidate: IssueCandidate | null
): { title: string; headline: string; thesis: string } {
  if (leadCandidate) {
    const analysis = analyses.get(leadCandidate.entry.id);
    const entry = entries.get(leadCandidate.entry.id);
    const topic = localizedText(clean(analysis?.topic), lang);
    const title =
      topic || (lang === 'ru' ? 'Главная линия недели' : 'The week’s main line');
    const thesis =
      localizedText(clean(analysis?.thesis), lang) ||
      localizedText(clean(analysis?.summary), lang) ||
      (lang === 'ru'
        ? 'Выпуск держится на одном материале, который задаёт остальным масштаб и точку зрения.'
        : 'The issue rests on one material that sets the scale and point of view for the rest.');

    return {
      title,
      headline: clean(entry?.title) || title,
      thesis: thesis || clean(entry?.body).slice(0, 220),
    };
  }

  const base = genericConcept(lang);
  const threadTopics = parts
    .filter((part) => part.kind === 'thread')
    .map((part) => part.title)
    .filter(Boolean)
    .slice(0, 3);

  if (!threadTopics.length) return base;

  return {
    title: threadTopics.join(' · '),
    headline: threadTopics.join(' · '),
    thesis: base.thesis,
  };
}

function shortSummary(title: string, lang: IssueLang): string {
  const fallback = lang === 'ru' ? 'Смыслы недели' : 'The week in signals';
  const value = clean(title) || fallback;

  if (value.length <= 70) return value;
  return `${value.slice(0, 67).trimEnd()}…`;
}

function emptyDiagnostics(lang: IssueLang): EditorialDiagnostics {
  return {
    source_count: 0,
    assigned_count: 0,
    unassigned_count: 0,
    duplicate_count: 0,
    other_edition_count: 0,
    per_type: {},
    by_role: {},
    own_count: 0,
    external_count: 0,
    ai_allowed_count: 0,
    model_analysis_count: 0,
    heuristic_analysis_count: 0,
    column_source: 'fallback',
    fallback_reasons: [],
    complete: false,
    issues: [lang === 'ru' ? 'Композиция ещё не сверена с источниками.' : 'Composition is not reconciled yet.'],
  };
}

/**
 * Reconcile the composition with the canonical source records.
 *
 * This is the safety net required by the task: every source ID must appear
 * exactly once in the ledger and exactly once in `parts` (or explicitly in
 * the other language edition). Missing and duplicate IDs are repaired and
 * reported; they are never hidden.
 */
export function reconcileEditorialComposition(
  composition: EditorialComposition,
  records: FlowItem[],
  entries: Map<string, IssueEntry> = new Map()
): EditorialComposition {
  const uniqueSource = new Map<string, FlowItem>();
  let recordsWithoutId = 0;

  for (const record of records) {
    const id = clean(record.id);
    if (!id) {
      recordsWithoutId++;
      continue;
    }
    if (!uniqueSource.has(id)) uniqueSource.set(id, record);
  }

  const duplicateSourceIds =
    records.filter((record) => clean(record.id)).length - uniqueSource.size;

  const existing = new Map<string, EditorialLedgerEntry>();
  let duplicateLedgerEntries = 0;

  for (const entry of Array.isArray(composition.ledger) ? composition.ledger : []) {
    const id = clean(entry.id);
    if (!id) continue;
    if (existing.has(id)) {
      duplicateLedgerEntries++;
      continue;
    }
    existing.set(id, entry);
  }

  const issues: string[] = [];
  let removedUnknown = 0;

  for (const id of existing.keys()) {
    if (!uniqueSource.has(id)) {
      existing.delete(id);
      removedUnknown++;
    }
  }

  if (removedUnknown) {
    issues.push(`Удалено записей вне периода: ${removedUnknown}.`);
  }

  for (const [id, record] of uniqueSource) {
    if (existing.has(id)) continue;

    const entry = entries.get(id);
    const title = entryTitle(entry, clean(record.title));
    const hasMaterial = entryHasMaterial(entry);

    existing.set(id, {
      id,
      type: String(record.type || entry?.type || 'note'),
      role: hasMaterial ? 'archive' : 'unavailable',
      reason: roleReason(hasMaterial ? 'archive' : 'unavailable', 'ru', title),
      partIndex: null,
      aiAllowed: record.ai_allowed === true,
      own: entry?.own === true,
      analysis: 'none',
      title,
    });

    issues.push(`Добавлена пропущенная запись ${id}.`);
  }

  if (duplicateSourceIds > 0) {
    issues.push(`В источнике повторяются ID: ${duplicateSourceIds}.`);
  }

  if (duplicateLedgerEntries > 0) {
    issues.push(`В реестре повторяются ID: ${duplicateLedgerEntries}.`);
  }

  if (recordsWithoutId > 0) {
    issues.push(`Записей без ID: ${recordsWithoutId}.`);
  }

  // Copy the parts and guarantee that each ID belongs to at most one part.
  const parts: EditorialPart[] = (Array.isArray(composition.parts) ? composition.parts : []).map(
    (part) => ({
      ...part,
      entryIds: unique((Array.isArray(part.entryIds) ? part.entryIds : []).map(clean)).filter(
        (id) => existing.has(id)
      ),
    })
  );

  const seenInParts = new Set<string>();

  for (const part of parts) {
    part.entryIds = part.entryIds.filter((id) => {
      if (seenInParts.has(id)) return false;
      seenInParts.add(id);
      return true;
    });
  }

  const archivePart = () => {
    const index = parts.findIndex((part) => part.kind === 'archive');

    if (index >= 0) return index;

    parts.push(
      makePart(
        'archive',
        1,
        'ru',
        'Полный обзор выпуска',
        'Все материалы периода с доступными ссылками и метаданными.',
        []
      )
    );

    return parts.length - 1;
  };

  for (const entry of existing.values()) {
    if (entry.role === 'other_edition') {
      if (seenInParts.has(entry.id)) {
        for (const part of parts) {
          part.entryIds = part.entryIds.filter((id) => id !== entry.id);
        }
        seenInParts.delete(entry.id);
      }
      entry.partIndex = null;
      continue;
    }

    let partIndex = Number.isInteger(entry.partIndex) ? Number(entry.partIndex) : -1;
    let part = parts[partIndex];

    if (!part || !part.entryIds.includes(entry.id)) {
      partIndex = parts.findIndex((candidate) => candidate.entryIds.includes(entry.id));
      part = parts[partIndex];
    }

    if (!part) {
      partIndex = archivePart();
      parts[partIndex].entryIds.push(entry.id);
      seenInParts.add(entry.id);
      issues.push(`Запись ${entry.id} возвращена в полный обзор.`);
    }

    entry.partIndex = partIndex;
  }

  // Drop empty parts, then remap partIndex after removals.
  const keptParts = parts.filter((part) => part.entryIds.length > 0);
  const indexMap = new Map<number, number>();

  parts.forEach((part, index) => {
    const next = keptParts.indexOf(part);
    if (next >= 0) indexMap.set(index, next);
  });

  for (const entry of existing.values()) {
    if (entry.partIndex === null) continue;
    entry.partIndex = indexMap.get(entry.partIndex) ?? null;
  }

  const ledger = [...existing.values()].sort((first, second) =>
    first.id.localeCompare(second.id)
  );

  const sourceRecords = [...uniqueSource.values()];
  const perType = sourceRecords.reduce<Record<string, number>>((counts, record) => {
    const type = String(record.type || 'note');
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});

  const byRole = ledger.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.role] = (counts[entry.role] || 0) + 1;
    return counts;
  }, {});

  const otherEditionCount = ledger.filter((entry) => entry.role === 'other_edition').length;
  const unassigned = ledger.filter(
    (entry) => entry.role !== 'other_edition' && entry.partIndex === null
  );
  // "Assigned" means accounted for: a part in this edition or an explicit
  // decision that the material belongs to the other language edition.
  const assignedCount = ledger.length - unassigned.length;
  const missingIds = [...uniqueSource.keys()].filter((id) => !existing.has(id));

  if (missingIds.length) {
    issues.push(`Не учтены ID: ${missingIds.join(', ')}.`);
  }

  const complete =
    unassigned.length === 0 &&
    missingIds.length === 0 &&
    duplicateSourceIds === 0 &&
    duplicateLedgerEntries === 0 &&
    recordsWithoutId === 0 &&
    ledger.length === uniqueSource.size;

  const fallbackReasons: string[] = [];

  if (composition.columnSource !== 'model') {
    fallbackReasons.push(
      'Колонка Пьеро собрана локальным детерминированным способом: модельный провайдер недоступен или не разрешён.'
    );
  }

  if (ledger.filter((entry) => entry.analysis === 'model').length === 0 && ledger.length > 0) {
    fallbackReasons.push(
      'Модельный анализ не использовался: решения опираются на видимые данные и локальную эвристику.'
    );
  }

  if (otherEditionCount > 0) {
    fallbackReasons.push(
      `Материалов в другом языковом выпуске: ${otherEditionCount}. Они не показаны в этой редакции, но учтены в реестре.`
    );
  }

  const diagnostics: EditorialDiagnostics = {
    source_count: records.length,
    assigned_count: assignedCount,
    unassigned_count: unassigned.length + missingIds.length,
    duplicate_count: duplicateSourceIds + duplicateLedgerEntries,
    other_edition_count: otherEditionCount,
    per_type: perType,
    by_role: byRole,
    own_count: ledger.filter((entry) => entry.own).length,
    external_count: ledger.filter((entry) => !entry.own && entry.role !== 'other_edition').length,
    ai_allowed_count: sourceRecords.filter((record) => record.ai_allowed === true).length,
    model_analysis_count: ledger.filter((entry) => entry.analysis === 'model').length,
    heuristic_analysis_count: ledger.filter((entry) => entry.analysis === 'heuristic').length,
    column_source: composition.columnSource,
    fallback_reasons: fallbackReasons,
    complete,
    issues,
  };

  return {
    ...composition,
    version: EDITORIAL_COMPOSITION_VERSION,
    parts: keptParts,
    ledger,
    diagnostics,
  };
}

/** True when the payload carries a composition this renderer understands. */
export function readEditorialComposition(
  payload: Pick<IssuePayload, 'editorialComposition'> | null | undefined
): EditorialComposition | null {
  const value = payload?.editorialComposition;

  if (!isRecord(value)) return null;
  if (typeof value.version !== 'number' || value.version < 1) return null;
  if (!Array.isArray(value.parts) || !Array.isArray(value.ledger)) return null;
  if (!isRecord(value.concept)) return null;

  const rawParts = value.parts as unknown[];
  const rawLedger = value.ledger as unknown[];

  const parts = rawParts
    .filter(
      (part): part is Record<string, any> =>
        isRecord(part) && Array.isArray(part.entryIds)
    )
    .map((part) => ({
      id: clean(part.id) || 'part',
      kind: String(part.kind || 'archive'),
      title: clean(part.title),
      annotation: clean(part.annotation),
      entryIds: (part.entryIds as unknown[])
        .map((id) => clean(id))
        .filter((id): id is string => Boolean(id)),
    })) as EditorialComposition['parts'];

  const ledger = rawLedger
    .filter((entry): entry is Record<string, any> => isRecord(entry) && Boolean(clean(entry.id)))
    .map((entry) => ({
      id: clean(entry.id),
      type: String(entry.type || 'note'),
      role: String(entry.role || 'archive'),
      reason: clean(entry.reason),
      partIndex: Number.isInteger(entry.partIndex) ? Number(entry.partIndex) : null,
      aiAllowed: entry.aiAllowed === true,
      own: entry.own === true,
      analysis:
        entry.analysis === 'model' || entry.analysis === 'heuristic'
          ? entry.analysis
          : 'none',
      title: clean(entry.title),
    })) as EditorialComposition['ledger'];

  const column = Array.isArray(value.column)
    ? value.column.map(clean).filter(Boolean)
    : [];

  return {
    ...(value as unknown as EditorialComposition),
    version: value.version,
    concept: {
      title: clean((value.concept as Record<string, unknown>).title),
      headline:
        clean((value.concept as Record<string, unknown>).headline) ||
        clean((value.concept as Record<string, unknown>).title),
      thesis: clean((value.concept as Record<string, unknown>).thesis),
    },
    parts,
    ledger,
    column,
    columnSource: value.columnSource === 'model' ? 'model' : 'fallback',
    summary: clean(value.summary),
  };
}

/**
 * Publication gate. A payload without a composition is an old issue and is
 * allowed. A payload with an incomplete ledger is explicitly not ready.
 */
export function compositionReadiness(payload: unknown): {
  ready: boolean;
  reason: string | null;
  diagnostics: EditorialDiagnostics | null;
} {
  if (!isRecord(payload)) {
    return { ready: true, reason: null, diagnostics: null };
  }

  const raw = payload.editorialComposition;

  if (raw === undefined || raw === null) {
    return { ready: true, reason: null, diagnostics: null };
  }

  const composition = readEditorialComposition({
    editorialComposition: raw as EditorialComposition,
  });

  if (!composition) {
    return {
      ready: false,
      reason: 'Редакционная композиция выпуска повреждена или имеет неизвестную версию.',
      diagnostics: null,
    };
  }

  const diagnostics = composition.diagnostics;

  if (!isRecord(diagnostics) || diagnostics.complete !== true) {
    const details =
      isRecord(diagnostics) && Array.isArray(diagnostics.issues)
        ? diagnostics.issues.filter((issue) => typeof issue === 'string').slice(0, 5).join(' ')
        : '';

    return {
      ready: false,
      reason: `Неполное покрытие выпуска: не все материалы периода учтены в редакционном реестре.${details ? ` ${details}` : ''}`,
      diagnostics: isRecord(diagnostics)
        ? (diagnostics as unknown as EditorialDiagnostics)
        : null,
    };
  }

  return { ready: true, reason: null, diagnostics };
}

/**
 * Composition coverage to show in the admin preview. It never touches the
 * source Flow records and is safe for old payloads.
 */
export function compositionCoverage(payload: unknown): {
  concept: string;
  parts: { title: string; kind: string; count: number }[];
  ledger: {
    id: string;
    title: string;
    type: string;
    role: string;
    reason: string;
    partIndex: number | null;
  }[];
  diagnostics: EditorialDiagnostics | null;
  complete: boolean;
} | null {
  if (!isRecord(payload)) return null;

  const composition = readEditorialComposition({
    editorialComposition: payload.editorialComposition as EditorialComposition,
  });

  if (!composition) return null;

  return {
    concept: clean(composition.concept?.title),
    parts: composition.parts.map((part) => ({
      title: clean(part.title),
      kind: String(part.kind || ''),
      count: Array.isArray(part.entryIds) ? part.entryIds.length : 0,
    })),
    ledger: composition.ledger.map((entry) => ({
      id: entry.id,
      title: clean(entry.title),
      type: String(entry.type || ''),
      role: String(entry.role || ''),
      reason: clean(entry.reason),
      partIndex: Number.isInteger(entry.partIndex) ? entry.partIndex : null,
    })),
    diagnostics: isRecord(composition.diagnostics)
      ? (composition.diagnostics as unknown as EditorialDiagnostics)
      : null,
    complete: composition.diagnostics?.complete === true,
  };
}
