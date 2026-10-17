import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import {
  getServerSupabaseClient,
  requireAdminFromRequest,
} from '@/lib/serverAuth';
import {
  extractGraph,
  getKnowledgeMapModel,
} from '@/lib/knowledge-map/deepseek';
import {
  getTextFromRow,
  sanitizeForModel,
  shouldExcludeTable,
} from '@/lib/knowledge-map/sanitize';
import type {
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
} from '@/lib/knowledge-map/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const BUCKET = 'knowledge-map';
const GRAPH_PATH = 'active/graph.json';
const PAGE_SIZE = 100;

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sourceKey(table: string, row: Record<string, unknown>) {
  const identity =
    row.id ??
    row.slug ??
    row.key ??
    row.path ??
    hash(JSON.stringify(row));

  return `${table}:${String(identity)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeNode(
  node: KnowledgeNode,
): KnowledgeNode {
  return {
    ...node,
    confidence: Math.min(1, Math.max(0, node.confidence || 0)),
    sourceKeys: [...new Set(node.sourceKeys || [])],
  };
}

function mergeNodes(
  existing: Map<string, KnowledgeNode>,
  incoming: KnowledgeNode[],
) {
  for (const raw of incoming) {
    const node = normalizeNode(raw);
    const previous = existing.get(node.id);

    if (!previous) {
      existing.set(node.id, node);
      continue;
    }

    existing.set(node.id, {
      ...previous,
      description: previous.description || node.description,
      sourceKeys: [
        ...new Set([...previous.sourceKeys, ...node.sourceKeys]),
      ],
      confidence: Math.max(previous.confidence, node.confidence),
    });
  }
}

function mergeEdges(
  existing: Map<string, KnowledgeEdge>,
  incoming: KnowledgeEdge[],
) {
  for (const edge of incoming) {
    const id = hash(
      `${edge.source}|${edge.target}|${edge.type}|${edge.label || ''}`,
    );

    const previous = existing.get(id);

    existing.set(id, {
      ...edge,
      id,
      evidence: [
        ...new Set([
          ...(previous?.evidence || []),
          ...(edge.evidence || []),
        ]),
      ].slice(0, 10),
      confidence: Math.max(previous?.confidence || 0, edge.confidence),
    });
  }
}

async function getAdminClient() {
  return getServerSupabaseClient({ useServiceRole: true });
}

async function loadExistingGraph(
  supabase: Awaited<ReturnType<typeof getAdminClient>>,
): Promise<KnowledgeGraph | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(GRAPH_PATH);

  if (error || !data) return null;

  try {
    return JSON.parse(await data.text()) as KnowledgeGraph;
  } catch {
    return null;
  }
}

async function saveGraph(
  supabase: Awaited<ReturnType<typeof getAdminClient>>,
  graph: KnowledgeGraph,
) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(GRAPH_PATH, JSON.stringify(graph), {
      contentType: 'application/json',
      upsert: true,
      cacheControl: '0',
    });

  if (error) throw error;
}

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);

    const supabase = await getAdminClient();

    const { data: run, error } = await supabase
      .schema('knowledge_map_private')
      .from('runs')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const graph = await loadExistingGraph(supabase);

    return NextResponse.json({
      ok: true,
      run,
      graph: graph
        ? {
            version: graph.version,
            generatedAt: graph.generatedAt,
            stats: graph.stats,
          }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Ошибка статуса';

    const unauthorized = /unauthorized|admin access required/i.test(message);

    return NextResponse.json(
      { error: unauthorized ? 'Доступ запрещён' : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminFromRequest(request);

    const supabase = await getAdminClient();

    const body: unknown = await request.json().catch(() => null);

    if (!isRecord(body) || body.action !== 'build') {
      return NextResponse.json(
        { error: 'Ожидается action: build.' },
        { status: 400 },
      );
    }

    const existing = await loadExistingGraph(supabase);
    const nodeMap = new Map<string, KnowledgeNode>();
    const edgeMap = new Map<string, KnowledgeEdge>();

    if (existing) {
      mergeNodes(nodeMap, existing.nodes);
      mergeEdges(edgeMap, existing.edges);
    }

    const { data: tables, error: tablesError } = await supabase.rpc(
      'knowledge_map_list_tables',
    );

    if (tablesError) throw tablesError;

    const tableNames = (tables || [])
      .map((row: { table_name: string }) => row.table_name)
      .filter((name: string) => !shouldExcludeTable(name));

    let recordsProcessed = 0;
    const errors: string[] = [];

    for (const tableName of tableNames) {
      let offset = 0;

      while (true) {
        const { data: rows, error: pageError } = await supabase.rpc(
          'knowledge_map_table_page',
          {
            p_table: tableName,
            p_limit: PAGE_SIZE,
            p_offset: offset,
          },
        );

        if (pageError) {
          errors.push(`${tableName}: ${pageError.message}`);
          break;
        }

        if (!Array.isArray(rows) || rows.length === 0) break;

        for (const rawRow of rows) {
          if (!isRecord(rawRow)) continue;

          const key = sourceKey(tableName, rawRow);
          const text = getTextFromRow(rawRow);

          if (!text.trim() || text === '{}') continue;

          const { data: storedSource } = await supabase
            .schema('knowledge_map_private')
            .from('sources')
            .select('content_hash,processed_hash')
            .eq('source_key', key)
            .maybeSingle();

          const contentHash = hash(text);

          if (
            storedSource?.content_hash === contentHash &&
            storedSource?.processed_hash === contentHash
          ) {
            recordsProcessed++;
            continue;
          }

          const { error: sourceError } = await supabase
            .schema('knowledge_map_private')
            .from('sources')
            .upsert(
              {
                source_key: key,
                source_type: 'record',
                source_table: tableName,
                source_path: null,
                content_hash: contentHash,
                content: text,
                metadata: {
                  table: tableName,
                  id: rawRow.id ?? null,
                },
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'source_key' },
            );

          if (sourceError) {
            errors.push(`${key}: ${sourceError.message}`);
            continue;
          }

          try {
            const extraction = await extractGraph(
              key,
              `${tableName} record`,
              text,
            );

            const incomingNodes: KnowledgeNode[] = extraction.nodes.map(
              (node) => ({
                ...node,
                sourceKeys: [key],
                metadata: {
                  table: tableName,
                },
              }),
            );

            mergeNodes(nodeMap, incomingNodes);

            const incomingEdges: KnowledgeEdge[] = extraction.edges.map(
              (edge) => ({
                ...edge,
                id: hash(
                  `${edge.source}|${edge.target}|${edge.type}|${edge.label || ''}`,
                ),
                evidence: [edge.evidence],
                origin: 'model',
              }),
            );

            mergeEdges(edgeMap, incomingEdges);

            const { error: processedError } = await supabase
              .schema('knowledge_map_private')
              .from('sources')
              .update({ processed_hash: contentHash })
              .eq('source_key', key);

            if (processedError) {
              errors.push(`${key}: ${processedError.message}`);
            }
          } catch (error) {
            errors.push(
              `${key}: ${
                error instanceof Error ? error.message : 'DeepSeek error'
              }`,
            );
          }

          recordsProcessed++;
        }

        offset += rows.length;

        if (rows.length < PAGE_SIZE) break;
      }
    }

    const nodes = [...nodeMap.values()];
    const edges = [...edgeMap.values()].filter(
      (edge) =>
        nodeMap.has(edge.source) &&
        nodeMap.has(edge.target),
    );

    const previousVersion = existing?.version || 0;

    const graph: KnowledgeGraph = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      version: previousVersion + 1,
      model: getKnowledgeMapModel(),
      nodes,
      edges,
      stats: {
        tables: tableNames.length,
        records: recordsProcessed,
        files: 0,
        nodes: nodes.length,
        edges: edges.length,
      },
    };

    await saveGraph(supabase, graph);

    const { error: runError } = await supabase
      .schema('knowledge_map_private')
      .from('runs')
      .insert({
        status: errors.length ? 'failed' : 'completed',
        phase: 'graph_saved',
        graph_version: graph.version,
        started_at: graph.generatedAt,
        finished_at: new Date().toISOString(),
        error: errors.length ? errors.slice(0, 20).join('\n') : null,
      });

    if (runError) throw runError;

    return NextResponse.json({
      ok: errors.length === 0,
      graph: {
        version: graph.version,
        stats: graph.stats,
      },
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Ошибка построения графа';

    const unauthorized = /unauthorized|admin access required/i.test(message);

    return NextResponse.json(
      { error: unauthorized ? 'Доступ запрещён' : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}