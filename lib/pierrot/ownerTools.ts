import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { loadAdminRagOverview } from '@/lib/analytics/adminRagOverview';
import { loadObservatorySnapshot, parseObservatoryFilters } from '@/lib/analytics/observatory';
import { loadPierrotIdentityMetrics } from '@/lib/analytics/pierrotIdentity';
import { loadOperationsSnapshot } from '@/lib/operations/dashboard';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';
import { answerBrainResearchQuestion } from '@/lib/knowledge/graph/research';
import {
  loadBrainGraph,
  type GraphQuery,
} from '@/lib/knowledge/graph/visualization';
import type { BrainGraphEdge, BrainGraphPayload } from '@/lib/knowledge/graph/types';
import { detectCommercialQuestion } from '@/lib/pierrot/commercialQuestion';
import { answerPierrotCommercialQuestion } from '@/lib/pierrot/commercialIntelligence';
import { detectWebsiteQuestion } from '@/lib/analytics/website/question';
import { answerWebsiteAnalyticsQuestion } from '@/lib/analytics/website/answer';
import {
  buildGraphResponse,
  buildWebsiteResponse,
} from '@/lib/pierrot/response/select';
import type { PierrotResponse } from '@/lib/pierrot/response/types';
import { detectMediaCatalogQuestion } from '@/lib/pierrot/mediaCatalogIntent';
import {
  answerMediaArchiveQuestion,
  type MediaAnswerResult,
} from '@/lib/pierrot/mediaAnswer';
import {
  detectGraphDemoRequest,
  detectJournalFlowIntent,
  type PierrotQueryPlan,
} from '@/lib/pierrot/queryUnderstanding';
import { isCorrectionMessage, isRepeatRequest } from '@/lib/pierrot/correction';
import type { SupabaseClient } from '@supabase/supabase-js';

assertServerOnly('lib/pierrot/ownerTools');

export type OwnerToolKind =
  | 'stats'
  | 'rag'
  | 'brain'
  | 'graph'
  | 'graph_demo'
  | 'research'
  | 'diagnostics'
  | 'analytics'
  | 'commercial'
  | 'website'
  | 'media';

export type OwnerToolRequest = {
  kind: OwnerToolKind;
  query: string;
  /** Media sub-kind, filled only for kind=media. */
  mediaKind?: string;
  /**
   * True when a correction/follow-up recovered the original request from the
   * bounded conversation context instead of classifying the current words.
   */
  recoveredFromContext?: boolean;
};

export type OwnerToolGraphSummary = {
  query: string | null;
  nodes: number;
  edges: number;
  directEdges: number;
  inferenceEdges: number;
  visualizationUrl: string;
};

export type OwnerToolDetailedResult = {
  text: string;
  provenance: MediaAnswerResult['provenance'] | null;
  mediaKind: string | null;
  graph?: OwnerToolGraphSummary | null;
  /** Optional validated visual composition; Markdown `text` remains fallback. */
  response?: PierrotResponse | null;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Explicit owner commands only. Ordinary questions about the site, art or
 * books must continue through the normal Pierrot answer path.
 */
function detectOwnerToolBase(
  message: string,
  options: {
    queryPlan?: Pick<PierrotQueryPlan, 'intent' | 'correction' | 'followUp' | 'signals'>;
    contextMessages?: string[];
  } = {}
): OwnerToolRequest | null {
  const text = normalize(message);
  const command = text.match(
    /^\/(stats|rag|brain|graph|research|diag|analytics|commercial|revenue|site|website)\b/
  );

  if (command) {
    const kind: OwnerToolKind =
      command[1] === 'diag'
        ? 'diagnostics'
        : command[1] === 'revenue'
          ? 'commercial'
          : command[1] === 'site' || command[1] === 'website'
            ? 'website'
            : (command[1] as OwnerToolKind);
    return { kind, query: message.trim() };
  }

  // A named document must reach Brain lookup before any status/commercial
  // shortcut. Explicit slash commands above remain the deliberate exception.
  if (options.queryPlan?.intent === 'document_lookup') return null;

  // A graph demonstration retrieves and traverses real nodes/edges. It is not
  // the administrative status report.
  if (detectGraphDemoRequest(message)) {
    return { kind: 'graph_demo', query: message.trim() };
  }

  // Website intelligence is a first-class owner question: traffic, search,
  // pages, projects and action funnels. It never replaces the commercial
  // revenue tool and is recognised before generic statistics.
  if (detectWebsiteQuestion(message)) {
    return { kind: 'website', query: message.trim() };
  }

  // Commercial performance questions must be recognised before generic
  // statistics, but after explicit slash commands. Detection itself is pure;
  // the financial data is only loaded inside the verified owner branch.
  if (detectCommercialQuestion(message)) {
    return { kind: 'commercial', query: message.trim() };
  }

  // Media Archive catalogue/count/mentions/diagnostics/content questions need
  // SQL-backed tools, not the 8-result semantic retrieval branch. The detector
  // is deliberately conservative and returns null for ambiguous personal
  // writing questions, which keep their Brain routing.
  const mediaPlan = detectMediaCatalogQuestion(message, {
    contextMessages: options.contextMessages,
  });
  if (mediaPlan) {
    return { kind: 'media', query: message.trim(), mediaKind: mediaPlan.kind };
  }

  if (
    /(brain\s*research|research\s+question|research:|исследован|исследуй|исследовать)/i.test(text)
  ) {
    return { kind: 'research', query: message.trim() };
  }

  if (
    /(диагностик|diagnostic|воркер|worker|operations|операц|health|сбой|очеред|queue|scheduler|состояни[а-яё]*\s+систем|system\s+status)/i.test(
      text
    )
  ) {
    return { kind: 'diagnostics', query: message.trim() };
  }

  if (
    /(knowledge\s*graph|граф\s*знаний|(?:^|[^а-яё])граф(?:$|[^а-яё])|graph\s*(status|state)|состояни.*граф)/i.test(
      text
    )
  ) {
    return { kind: 'graph', query: message.trim() };
  }

  if (/\brag\b|retrieval|ретрив|состояни.*rag|rag.*состояни|источник.*rag/i.test(text)) {
    return { kind: 'rag', query: message.trim() };
  }

  if (
    /(\bbrain\b|мозг).*(status|state|состояни|статус|corpus|корпус|queue|очеред|document|документ|покажи|сколько|ошиб)/i.test(
      text
    ) ||
    /(status|state|состояни|статус).*(brain|мозг)/i.test(text)
  ) {
    return { kind: 'brain', query: message.trim() };
  }

  if (
    /(analytics|аналитик|observatory|обсерватор|media intelligence|медиа.*аналитик|media archive|медиа архив|реальн[а-яё]*\s+посетител|уникальн[а-яё]*\s+посетител|нов[а-яё]*\s+и\s+вернувш|visitor|unknown|неизвестн[а-яё]*\s+сесси|сесси[а-яё]*.*классифиц|мои\s+диалог|диалог[а-яё]*\s+принадлеж)/i.test(
      text
    )
  ) {
    return { kind: 'analytics', query: message.trim() };
  }

  if (
    /(какие\s+вопросы\s+чаще\s+задавали|какие\s+вопросы\s+задавали|что\s+спрашивали|какие\s+ответы\s+получали\s+отрицательн)/i.test(
      text
    )
  ) {
    return { kind: 'analytics', query: message.trim() };
  }

  if (
    /(статистик|stats|statistics|dashboard|показател)/i.test(text) ||
    /сколько\s+(пользовател|подписчик|диалог|запис|документ|сообщен|публикац|проект)/i.test(text)
  ) {
    return { kind: 'stats', query: message.trim() };
  }

  return null;
}

function isRecoveryTurn(options: {
  queryPlan?: Pick<PierrotQueryPlan, 'intent' | 'correction' | 'followUp' | 'signals'>;
}): boolean {
  if (!options.queryPlan) return false;
  if (!options.queryPlan.correction && !options.queryPlan.followUp) return false;

  // A new, independently classified request must not inherit an old tool.
  if (options.queryPlan.intent === 'general') return true;

  // An intent explicitly inherited from history is a continuation, not a new
  // request. "Ты выдумал статистику" after a Bluesky report lands here.
  return (options.queryPlan.signals || []).some((signal) => signal.startsWith('history:'));
}

/**
 * Owner-tool detection with bounded correction recovery.
 *
 * The current turn is classified first. Only a general correction/follow-up
 * may recover a more specific earlier tool ("Покажи статистику Bluesky" →
 * "Ты выдумал статистику"). In that case the recovered tool is executed with
 * the original question, so the data is fetched again instead of restating
 * the previous answer.
 */
export function detectOwnerTool(
  message: string,
  options: {
    queryPlan?: Pick<PierrotQueryPlan, 'intent' | 'correction' | 'followUp' | 'signals'>;
    contextMessages?: string[];
  } = {}
): OwnerToolRequest | null {
  const current = detectOwnerToolBase(message, options);
  const recovery = isRecoveryTurn(options);

  if (!recovery) return current;

  // A generic "stats" match is exactly what caused a Bluesky/Journal/Media
  // correction to fall back to the site-wide report. Prefer a specific tool
  // recovered from the original request.
  const context = (options.contextMessages || []).filter((item) => item.trim());

  for (let index = context.length - 1; index >= 0; index -= 1) {
    const previousText = context[index];
    if (isCorrectionMessage(previousText) || isRepeatRequest(previousText)) continue;

    // Journal/Flow are editorial sources with their own retrieval branch. They
    // must not be recovered as the website project tool just because the
    // previous question contained the word "статистика".
    if (detectJournalFlowIntent(previousText).intent) return null;

    const recovered = detectOwnerToolBase(previousText);
    if (!recovered) continue;
    if (recovered.kind === 'stats' && context.length > 1) continue;

    return {
      ...recovered,
      query: previousText.trim(),
      recoveredFromContext: true,
    };
  }

  return current;
}

function number(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('en-GB');
}

async function count(
  store: SupabaseClient,
  table: string,
  configure?: (query: any) => any
): Promise<number | null> {
  try {
    let query = store.from(table).select('id', { count: 'exact', head: true });
    if (configure) query = configure(query);
    const { count: value, error } = await query;
    if (error) return null;
    return value ?? 0;
  } catch {
    return null;
  }
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU');
}

async function formatStats(language: 'ru' | 'en'): Promise<string> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [users, subscribers, flow, conversations, messages, media, projects] = await Promise.all([
    count(store, 'users'),
    count(store, 'subscribers', (query) => query.eq('isActive', true)),
    count(store, 'items', (query) => query.eq('status', 'published').eq('visibility', 'public')),
    count(store, 'pierrot_conversations', (query) => query.gte('started_at', since)),
    count(store, 'pierrot_messages', (query) => query.gte('created_at', since)),
    count(store, 'media_archive_records'),
    count(store, 'projects'),
  ]);

  if (language === 'en') {
    return [
      'Project statistics',
      `Users: ${number(users)}`,
      `Active subscribers: ${number(subscribers)}`,
      `Flow records: ${number(flow)}`,
      `Pierrot conversations (30 days): ${number(conversations)} · messages: ${number(messages)}`,
      `Media records: ${number(media)} · projects: ${number(projects)}`,
    ].join('\n');
  }

  return [
    'Статистика проекта',
    `Пользователи: ${number(users)}`,
    `Активные подписчики: ${number(subscribers)}`,
    `Записи Flow: ${number(flow)}`,
    `Диалоги Pierrot (30 дней): ${number(conversations)} · сообщений: ${number(messages)}`,
    `Медиа: ${number(media)} · проекты: ${number(projects)}`,
  ].join('\n');
}

async function formatRag(language: 'ru' | 'en'): Promise<string> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const overview = await loadAdminRagOverview(store);
  const brainQueue = overview.queues.brain;
  const graphQueue = overview.queues.graph;
  const mediaQueue = overview.queues.mediaAnalysis;
  const retrieval = overview.retrieval;

  if (language === 'en') {
    return [
      'RAG status',
      `Corpus: ${number(overview.documents.total)} documents · ${number(overview.documents.chunks)} chunks · ${number(overview.documents.embeddedChunks)} embedded`,
      `Brain queue: ${brainQueue.queued} queued · ${brainQueue.processing} processing · ${brainQueue.failed} failed · ${brainQueue.completed} completed`,
      `Graph queue: ${graphQueue.queued} queued · ${graphQueue.processing} processing · ${graphQueue.failed} failed`,
      `Media analysis queue: ${mediaQueue.queued} queued · ${mediaQueue.processing} processing · ${mediaQueue.failed} failed`,
      `Retrieval (30 days): ${retrieval.attempts} attempts · ${retrieval.relevant} relevant · ${retrieval.noMatch} no match · ${retrieval.errors} errors`,
      `Media: ${overview.media.records} records · ${overview.media.withDocument} linked documents · ${overview.media.quotes} quotes`,
      `Last retrieval: ${dateLabel(retrieval.lastAt)}`,
    ].join('\n');
  }

  return [
    'Состояние RAG',
    `Корпус: ${number(overview.documents.total)} документов · ${number(overview.documents.chunks)} фрагментов · ${number(overview.documents.embeddedChunks)} с embeddings`,
    `Очередь Brain: ${brainQueue.queued} в очереди · ${brainQueue.processing} в работе · ${brainQueue.failed} ошибок · ${brainQueue.completed} завершено`,
    `Очередь Graph: ${graphQueue.queued} в очереди · ${graphQueue.processing} в работе · ${graphQueue.failed} ошибок`,
    `Очередь Media analysis: ${mediaQueue.queued} в очереди · ${mediaQueue.processing} в работе · ${mediaQueue.failed} ошибок`,
    `Retrieval (30 дней): ${retrieval.attempts} попыток · ${retrieval.relevant} релевантных · ${retrieval.noMatch} без совпадений · ${retrieval.errors} ошибок`,
    `Медиа: ${overview.media.records} записей · ${overview.media.withDocument} связано с документами · ${overview.media.quotes} цитат`,
    `Последний retrieval: ${dateLabel(retrieval.lastAt)}`,
  ].join('\n');
}

async function formatBrain(language: 'ru' | 'en'): Promise<string> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const overview = await loadAdminRagOverview(store);
  const queue = overview.queues.brain;
  const operations = await loadOperationsSnapshot().catch(() => null);
  const lastRun = operations?.recentRuns.find((run) => run.scope === 'brain') || null;

  if (language === 'en') {
    return [
      'Brain status',
      `Indexed: ${number(overview.documents.total)} documents · ${number(overview.documents.chunks)} chunks · ${number(overview.documents.embeddedChunks)} embedded`,
      `Sources: ${overview.documents.bySourceType.map((row) => `${row.key} ${row.value}`).join(' · ') || '—'}`,
      `Ingestion queue: ${queue.queued} queued · ${queue.processing} processing · ${queue.failed} failed · ${queue.completed} completed`,
      lastRun
        ? `Last worker run: ${lastRun.status} · ${lastRun.processed} processed · ${lastRun.failed} failed${lastRun.error_code ? ` · ${lastRun.error_code}` : ''}`
        : 'Last worker run: —',
    ].join('\n');
  }

  return [
    'Состояние Brain',
    `Проиндексировано: ${number(overview.documents.total)} документов · ${number(overview.documents.chunks)} фрагментов · ${number(overview.documents.embeddedChunks)} с embeddings`,
    `Источники: ${overview.documents.bySourceType.map((row) => `${row.key} ${row.value}`).join(' · ') || '—'}`,
    `Очередь импорта: ${queue.queued} в очереди · ${queue.processing} в работе · ${queue.failed} ошибок · ${queue.completed} завершено`,
    lastRun
      ? `Последний запуск worker: ${lastRun.status} · обработано ${lastRun.processed} · ошибок ${lastRun.failed}${lastRun.error_code ? ` · ${lastRun.error_code}` : ''}`
      : 'Последний запуск worker: —',
  ].join('\n');
}

async function formatGraph(language: 'ru' | 'en'): Promise<string> {
  const store = createBrainGraphStore();
  if (!store) {
    return language === 'ru'
      ? 'Knowledge Graph недоступен: база знаний не настроена.'
      : 'Knowledge Graph is unavailable: the knowledge database is not configured.';
  }

  const [entities, relationships, summaries, runs] = await Promise.all([
    count(store.client, 'brain_entities'),
    count(store.client, 'brain_relationships'),
    count(store.client, 'brain_thematic_summaries'),
    store.listRecentRuns(1).catch(() => []),
  ]);
  const run = runs[0] || null;
  const overview = await loadAdminRagOverview(store.client).catch(() => null);
  const queue = overview?.queues.graph;

  if (language === 'en') {
    return [
      'Knowledge Graph status',
      `Entities: ${number(entities)} · relationships: ${number(relationships)} · thematic summaries: ${number(summaries)}`,
      queue
        ? `Graph queue: ${queue.queued} queued · ${queue.processing} processing · ${queue.failed} failed · ${queue.completed} completed`
        : 'Graph queue: —',
      run ? `Last graph run: ${run.status} · ${dateLabel(run.created_at)}` : 'Last graph run: —',
    ].join('\n');
  }

  return [
    'Состояние Knowledge Graph',
    `Сущности: ${number(entities)} · связи: ${number(relationships)} · тематические сводки: ${number(summaries)}`,
    queue
      ? `Очередь Graph: ${queue.queued} в очереди · ${queue.processing} в работе · ${queue.failed} ошибок · ${queue.completed} завершено`
      : 'Очередь Graph: —',
    run
      ? `Последний запуск Graph: ${run.status} · ${dateLabel(run.created_at)}`
      : 'Последний запуск Graph: —',
  ].join('\n');
}

function graphDemoSubject(message: string): string | null {
  const subject = message
    .replace(/^\/(?:graph|research)\s*/i, '')
    .replace(
      /(покажи|показать|продемонстрир[а-яё]*|объясни|расскажи|как|работает|устроен[а-яё]*|мне|пожалуйста|show|demonstrate|explain|how|does|the|work[s]?|graph|граф[а-яё]*|связ[а-яё]*|relations?(?:hip)?s?|knowledge|знаний|по|on|of|в|with|через|between)/gi,
      ' '
    )
    .replace(/[?!.,:;"«»“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (subject.length < 3 || subject.length > 120) return null;
  return subject;
}

function edgeProvenance(edge: BrainGraphEdge): string | null {
  if (!edge.provenance) return null;
  const heading = edge.provenance.heading ? `, ${edge.provenance.heading}` : '';
  return `«${edge.provenance.documentTitle}»${heading}`;
}

function formatGraphEdge(
  edge: BrainGraphEdge,
  labels: Map<string, string>,
  index: number
): string {
  const source = labels.get(edge.source) || edge.source;
  const target = labels.get(edge.target) || edge.target;
  const provenance = edgeProvenance(edge);
  const confidence = Number.isFinite(edge.confidence)
    ? ` · confidence ${edge.confidence.toFixed(2)}`
    : '';
  const evidence = provenance ? `\n   Evidence: ${provenance}` : '';

  return `${index}. ${source} —${edge.label}→ ${target}${confidence}${evidence}`;
}

function findTraversalPath(
  edges: BrainGraphEdge[],
  labels: Map<string, string>
): string | null {
  const direct = edges.filter((edge) => !edge.inference);
  const bySource = new Map<string, BrainGraphEdge[]>();

  for (const edge of direct) {
    const list = bySource.get(edge.source) || [];
    list.push(edge);
    bySource.set(edge.source, list);
  }

  for (const first of direct) {
    const second = (bySource.get(first.target) || []).find(
      (candidate) => candidate.id !== first.id && candidate.target !== first.source
    );
    if (!second) continue;

    const a = labels.get(first.source) || first.source;
    const b = labels.get(first.target) || first.target;
    const c = labels.get(second.target) || second.target;

    return `${a} —${first.label}→ ${b} —${second.label}→ ${c}`;
  }

  return null;
}

type GraphLoader = (store: NonNullable<ReturnType<typeof createBrainGraphStore>>, query: GraphQuery) => Promise<BrainGraphPayload>;

async function formatGraphDemo(
  message: string,
  language: 'ru' | 'en',
  deps: { loadGraph?: GraphLoader } = {}
): Promise<OwnerToolDetailedResult> {
  const store = createBrainGraphStore();

  if (!store) {
    return {
      text:
        language === 'ru'
          ? 'Knowledge Graph недоступен: база знаний не настроена. Это не означает, что в графе нет связей — я просто не могу их прочитать.'
          : 'The Knowledge Graph is unavailable because the knowledge database is not configured. This does not mean the graph has no relationships; I simply cannot read them.',
      provenance: null,
      mediaKind: null,
      graph: null,
    };
  }

  const query = graphDemoSubject(message);
  const loadGraph: GraphLoader = deps.loadGraph || loadBrainGraph;

  try {
    const payload = await loadGraph(store, {
      ...(query ? { q: query } : {}),
      limit: 160,
    });

    const labels = new Map(payload.nodes.map((node) => [node.id, node.label]));
    const direct = payload.edges.filter((edge) => !edge.inference);
    const inference = payload.edges.filter((edge) => edge.inference);
    const shownDirect = direct.slice(0, 4);
    const shownInference = inference.slice(0, 3);
    const path = findTraversalPath(payload.edges, labels);
    const visualizationUrl = '/admin/brain/graph';
    const summary: OwnerToolGraphSummary = {
      query,
      nodes: payload.nodes.length,
      edges: payload.edges.length,
      directEdges: direct.length,
      inferenceEdges: inference.length,
      visualizationUrl,
    };

    if (payload.nodes.length === 0) {
      return {
        text:
          language === 'ru'
            ? [
                query
                  ? `В Knowledge Graph не нашлось сущностей или документов по запросу «${query}».`
                  : 'Knowledge Graph сейчас не вернул сущностей и документов.',
                'Это результат конкретного graph-запроса, а не утверждение, что граф пуст.',
                'Интерактивная визуализация: /admin/brain/graph.',
              ].join('\n')
            : [
                query
                  ? `The Knowledge Graph returned no entities or documents for “${query}”.`
                  : 'The Knowledge Graph returned no entities or documents for this query.',
                'This is the result of this specific graph query, not a claim that the whole graph is empty.',
                'Interactive view: /admin/brain/graph.',
              ].join('\n'),
        provenance: null,
        mediaKind: null,
        graph: summary,
      };
    }

    if (payload.edges.length === 0) {
      return {
        text:
          language === 'ru'
            ? [
                `Граф вернул ${payload.nodes.length} узлов, но ни одной связи для этой выборки.`,
                'Количество сущностей само по себе не доказывает наличие отношений, поэтому я не буду его выдавать за результат анализа.',
                'Интерактивная визуализация: /admin/brain/graph.',
              ].join('\n')
            : [
                `The graph returned ${payload.nodes.length} nodes but no relationships for this sample.`,
                'Entity counts alone do not prove relationships, so I will not present them as an analysis result.',
                'Interactive view: /admin/brain/graph.',
              ].join('\n'),
        provenance: null,
        mediaKind: null,
        graph: summary,
      };
    }

    const lines: string[] = [];

    if (language === 'ru') {
      lines.push(query ? `Graph retrieval по запросу «${query}»:` : 'Graph retrieval по текущей выборке:');
      lines.push(
        `Найдено ${payload.nodes.length} узлов и ${payload.edges.length} связей в выборке. Ниже — реальные связи, а не статистика очереди.`
      );
    } else {
      lines.push(query ? `Graph retrieval for “${query}”:` : 'Graph retrieval for the current sample:');
      lines.push(
        `Found ${payload.nodes.length} nodes and ${payload.edges.length} relationships in the sample. The relationships below are real retrieved edges, not queue statistics.`
      );
    }

    if (path) {
      lines.push('', language === 'ru' ? '**Цепочка связей:**' : '**Relationship path:**', path);
    }

    if (shownDirect.length > 0) {
      lines.push('', language === 'ru' ? '**Прямые связи:**' : '**Direct relationships:**');
      lines.push(
        ...shownDirect.map((edge, index) => formatGraphEdge(edge, labels, index + 1))
      );
    }

    if (shownInference.length > 0) {
      lines.push(
        '',
        language === 'ru'
          ? '**Гипотезы (inference=true, требуют проверки):**'
          : '**Hypotheses (inference=true, require verification):**'
      );
      lines.push(
        ...shownInference.map((edge, index) => formatGraphEdge(edge, labels, index + 1))
      );
    } else {
      lines.push(
        '',
        language === 'ru'
          ? 'Связей с inference=true в этой выборке нет. Прямые связи подтверждены провенансом документа.'
          : 'No inference=true relationships in this sample. Direct relationships carry document provenance.'
      );
    }

    lines.push(
      '',
      language === 'ru'
        ? `Визуализация: ${visualizationUrl}. Это выборка из ${payload.nodes.length} узлов; полный граф шире и здесь не утверждается.`
        : `Visualisation: ${visualizationUrl}. This is a sample of ${payload.nodes.length} nodes; the full graph is larger and is not claimed here.`
    );

    return {
      text: lines.join('\n'),
      provenance: null,
      mediaKind: null,
      graph: summary,
      response: buildGraphResponse(payload, query, language),
    };
  } catch (error) {
    console.error('[Pierrot graph demo]', {
      code: error instanceof Error ? error.message.slice(0, 120) : 'graph_demo_failed',
    });

    return {
      text:
        language === 'ru'
          ? 'Не удалось выполнить graph retrieval: запрос к графу завершился ошибкой. Это не означает, что связей нет; я не буду подменять результат количеством сущностей.'
          : 'Graph retrieval failed: the graph query returned an error. This does not mean there are no relationships; I will not substitute entity counts for the result.',
      provenance: null,
      mediaKind: null,
      graph: null,
    };
  }
}

function stripResearchPrefix(message: string): string {
  return message
    .replace(/^\/(research|brain\s*research)\s*/i, '')
    .replace(
      /^(brain\s*research|research\s*question|research|исследуй|исследовать|исследование)\s*[:\-—]?\s*/i,
      ''
    )
    .trim();
}

async function formatResearch(message: string, language: 'ru' | 'en'): Promise<string> {
  const store = createBrainGraphStore();
  if (!store) {
    return language === 'ru'
      ? 'Brain Research недоступен: база знаний не настроена.'
      : 'Brain Research is unavailable: the knowledge database is not configured.';
  }

  const question = stripResearchPrefix(message);
  if (!question) {
    return language === 'ru'
      ? 'Сформулируйте исследовательский вопрос после команды /research.'
      : 'Write a research question after /research.';
  }

  const result = await answerBrainResearchQuestion({ question, store });
  const citations = result.citations.slice(0, 5).map((citation, index) => {
    const title = citation.documentTitle || citation.documentId;
    return `${index + 1}. ${title}${citation.publishedAt ? ` · ${citation.publishedAt}` : ''}`;
  });

  if (language === 'en') {
    return [
      result.answer,
      '',
      citations.length > 0 ? `Sources:\n${citations.join('\n')}` : '',
      result.caveat ? `\n${result.caveat}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    result.answer,
    '',
    citations.length > 0 ? `Источники:\n${citations.join('\n')}` : '',
    result.caveat ? `\n${result.caveat}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function formatDiagnostics(language: 'ru' | 'en'): Promise<string> {
  const snapshot = await loadOperationsSnapshot();
  const scopes = ['brain', 'graph', 'media', 'newsletter', 'retention'] as const;
  const lines = scopes.map((scope) => {
    const queue = snapshot.queues[scope];
    const budget = snapshot.budgets[scope];
    const last = snapshot.recentRuns.find((run) => run.scope === scope) || null;
    const error = last?.error_code ? ` · ${last.error_code}` : '';
    return `${scope}: ${queue.queued} queued · ${queue.processing} processing · ${queue.failed} failed · budget ${budget.usedHour}/${budget.maxHour}h${error}`;
  });

  const alerts = snapshot.alerts.map((alert) => `${alert.level}: ${alert.code} · ${alert.message}`);
  const recentErrors = snapshot.recentRuns
    .filter((run) => run.failed > 0 || run.error_code)
    .slice(0, 5)
    .map(
      (run) =>
        `${run.scope} · ${run.status} · ${dateLabel(run.started_at)} · failed ${run.failed}${run.error_code ? ` · ${run.error_code}` : ''}`
    );

  if (language === 'en') {
    return [
      'Diagnostics',
      `Workers: ${snapshot.control.workersEnabled ? 'enabled' : 'stopped'} · control source: ${snapshot.control.source}`,
      ...lines,
      alerts.length > 0 ? `\nAlerts:\n${alerts.join('\n')}` : '',
      recentErrors.length > 0
        ? `\nRecent errors:\n${recentErrors.join('\n')}`
        : '\nRecent errors: none',
      'Scheduler: no schedule is created from Operations.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    'Диагностика',
    `Workers: ${snapshot.control.workersEnabled ? 'включены' : 'остановлены'} · источник управления: ${snapshot.control.source}`,
    ...lines,
    alerts.length > 0 ? `\nПредупреждения:\n${alerts.join('\n')}` : '',
    recentErrors.length > 0
      ? `\nПоследние ошибки:\n${recentErrors.join('\n')}`
      : '\nПоследних ошибок нет',
    'Scheduler: расписание из Operations не создаётся.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function formatAnalytics(language: 'ru' | 'en'): Promise<string> {
  const filters = parseObservatoryFilters({ preset: '7d' });
  const store = getServerSupabaseClient({ useServiceRole: true });
  const [snapshot, rag, identity] = await Promise.all([
    loadObservatorySnapshot(filters),
    loadAdminRagOverview(store),
    loadPierrotIdentityMetrics(store, filters.from, filters.to),
  ]);
  const topics = snapshot.interest.topTopics
    .slice(0, 5)
    .map((topic) => `${topic.topic}: ${topic.conversationCount}`);

  if (language === 'en') {
    return [
      'Pierrot analytics · 7 days',
      `Identity: owner ${identity.ownerConversations} conversations · visitor ${identity.visitorConversations} · unknown ${identity.unknownConversations}`,
      `Visitors: ${identity.uniqueVisitors} unique · ${identity.newVisitors ?? '—'} new · ${identity.returningVisitors ?? '—'} returning · ${identity.conversationsPerVisitor ?? '—'} conversations per visitor`,
      `Owner tests excluded from visitor totals: ${identity.ownerTestsExcluded}. Unknown is never counted as visitor.`,
      `Conversations: today ${snapshot.overview.conversationsToday} · week ${snapshot.overview.conversationsThisWeek} · month ${snapshot.overview.conversationsThisMonth}`,
      `Period: ${snapshot.overview.totalConversations.value} conversations · ${snapshot.overview.totalMessages.value} messages · ${snapshot.overview.activeConversations} active`,
      `Quality: ${snapshot.intelligence.retrievalFailures} retrieval failures · ${snapshot.intelligence.unansweredQuestions} unanswered · ${snapshot.intelligence.assistantFailures} assistant failures`,
      `Media: ${rag.media.records} records · ${rag.media.quotes} quotes · ${rag.media.topics} topics · ${rag.media.entities} entities · ${rag.media.relations} relations`,
      topics.length > 0 ? `Topics: ${topics.join(' · ')}` : 'Topics: —',
      snapshot.intelligence.editorialRadar.length > 0
        ? `Editorial radar: ${snapshot.intelligence.editorialRadar
            .slice(0, 5)
            .map((topic) => topic.topic)
            .join(' · ')}`
        : 'Editorial radar: —',
    ].join('\n');
  }

  return [
    'Аналитика Pierrot · 7 дней',
    `Identity: owner ${identity.ownerConversations} диалогов · visitor ${identity.visitorConversations} · unknown ${identity.unknownConversations}`,
    `Посетители: ${identity.uniqueVisitors} уникальных · ${identity.newVisitors ?? '—'} новых · ${identity.returningVisitors ?? '—'} вернувшихся · ${identity.conversationsPerVisitor ?? '—'} диалогов на посетителя`,
    `Тесты владельца исключены из visitor-метрик: ${identity.ownerTestsExcluded}. Unknown не считается посетителем.`,
    `Диалоги: сегодня ${snapshot.overview.conversationsToday} · неделя ${snapshot.overview.conversationsThisWeek} · месяц ${snapshot.overview.conversationsThisMonth}`,
    `Период: ${snapshot.overview.totalConversations.value} диалогов · ${snapshot.overview.totalMessages.value} сообщений · ${snapshot.overview.activeConversations} активных`,
    `Качество: ${snapshot.intelligence.retrievalFailures} ошибок retrieval · ${snapshot.intelligence.unansweredQuestions} без ответа · ${snapshot.intelligence.assistantFailures} ошибок ассистента`,
    `Медиа: ${rag.media.records} записей · ${rag.media.quotes} цитат · ${rag.media.topics} тем · ${rag.media.entities} сущностей · ${rag.media.relations} связей`,
    topics.length > 0 ? `Темы: ${topics.join(' · ')}` : 'Темы: —',
    snapshot.intelligence.editorialRadar.length > 0
      ? `Editorial Radar: ${snapshot.intelligence.editorialRadar
          .slice(0, 5)
          .map((topic) => topic.topic)
          .join(' · ')}`
      : 'Editorial Radar: —',
  ].join('\n');
}

async function formatMedia(
  request: OwnerToolRequest,
  language: 'ru' | 'en'
): Promise<OwnerToolDetailedResult> {
  const answer = await answerMediaArchiveQuestion(request.query, language);

  if (!answer) {
    return {
      text:
        language === 'ru'
          ? 'Не удалось разобрать вопрос о Media Archive. Уточните год, издание или название публикации.'
          : 'I could not parse the Media Archive question. Specify the year, outlet or publication title.',
      provenance: null,
      mediaKind: null,
    };
  }

  return {
    text: answer.text,
    provenance: answer.provenance,
    mediaKind: answer.kind,
  };
}

export async function runOwnerToolDetailed(
  request: OwnerToolRequest,
  language: 'ru' | 'en',
  deps: { loadGraph?: GraphLoader } = {}
): Promise<OwnerToolDetailedResult> {
  if (request.kind === 'graph_demo') {
    return formatGraphDemo(request.query, language, deps);
  }

  if (request.kind === 'website') {
    try {
      const store = getServerSupabaseClient({ useServiceRole: true });
      const answer = await answerWebsiteAnalyticsQuestion({
        message: request.query,
        language,
        store,
      });

      return {
        text:
          answer.markdown ||
          (language === 'ru'
            ? 'Не распознал вопрос о сайте. Спросите, например: «Что у нас с сайтом за последние 7 дней?»'
            : 'I did not recognise a website question. Try: “How is the website doing over the last 7 days?”'),
        provenance: null,
        mediaKind: null,
        response: answer.report ? buildWebsiteResponse(answer.report, language) : null,
      };
    } catch (error) {
      console.error('[Pierrot website tool]', {
        code: error instanceof Error ? error.message : 'website_tool_failed',
      });

      return {
        text:
          language === 'ru'
            ? 'Не удалось получить данные. Проверьте состояние базы и workers, затем повторите запрос.'
            : 'Could not load the data. Check the database and workers, then try again.',
        provenance: null,
        mediaKind: null,
        response: null,
      };
    }
  }

  if (request.kind === 'media') {
    try {
      return await formatMedia(request, language);
    } catch (error) {
      console.error('[Pierrot media tool]', {
        kind: request.mediaKind || 'media',
        code: error instanceof Error ? error.message : 'media_tool_failed',
      });

      return {
        text:
          language === 'ru'
            ? 'Не удалось получить данные Media Archive из базы. Это не означает, что публикаций нет: запрос к каталогу не завершился. Повторите позже.'
            : 'Could not read the Media Archive database. This does not mean there are no publications: the catalogue query did not complete. Try again later.',
        provenance: null,
        mediaKind: request.mediaKind || 'media_error',
      };
    }
  }

  return { text: await runOwnerTool(request, language), provenance: null, mediaKind: null };
}

export async function runOwnerTool(
  request: OwnerToolRequest,
  language: 'ru' | 'en',
  deps: { loadGraph?: GraphLoader } = {}
): Promise<string> {
  try {
    switch (request.kind) {
      case 'graph_demo':
        return (await formatGraphDemo(request.query, language, deps)).text;
      case 'media': {
        const result = await formatMedia(request, language);
        return result.text;
      }
      case 'stats':
        return await formatStats(language);
      case 'rag':
        return await formatRag(language);
      case 'brain':
        return await formatBrain(language);
      case 'graph':
        return await formatGraph(language);
      case 'research':
        return await formatResearch(request.query, language);
      case 'diagnostics':
        return await formatDiagnostics(language);
      case 'analytics':
        return await formatAnalytics(language);
      case 'website': {
        const store = getServerSupabaseClient({ useServiceRole: true });
        const answer = await answerWebsiteAnalyticsQuestion({
          message: request.query,
          language,
          store,
        });

        return (
          answer.markdown ||
          (language === 'ru'
            ? 'Не распознал вопрос о сайте. Спросите, например: «Что у нас с сайтом за последние 7 дней?»'
            : 'I did not recognise a website question. Try: “How is the website doing over the last 7 days?”')
        );
      }
      case 'commercial': {
        const store = getServerSupabaseClient({ useServiceRole: true });
        const answer = await answerPierrotCommercialQuestion({
          question: request.query,
          language,
          store,
        });

        return (
          answer ||
          (language === 'ru'
            ? 'Не распознал коммерческий вопрос. Спросите, например: «Сколько мы заработали за последнюю неделю?»'
            : 'I did not recognise a commercial question. Try: “How much did we earn last week?”')
        );
      }
    }
  } catch (error) {
    console.error('[Pierrot owner tool]', {
      kind: request.kind,
      code: error instanceof Error ? error.message : 'owner_tool_failed',
    });

    return language === 'ru'
      ? 'Не удалось получить данные. Проверьте состояние базы и workers, затем повторите запрос.'
      : 'Could not load the data. Check the database and workers, then try again.';
  }
}
