
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';
import { extractGraph, getKnowledgeMapModel } from '@/lib/knowledge-map/deepseek';
import { getTextFromRow, isTextFile, sanitizeForModel, shouldExcludeTable } from '@/lib/knowledge-map/sanitize';
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeNode } from '@/lib/knowledge-map/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const BUCKET = 'knowledge-map';
const ACTIVE_PATH = 'active/graph.json';
const STATE_PATH = 'work/state.json';
const GRAPH_PATH = 'work/graph.json';
const PAGE_SIZE = 25;
const MAX_FILE_BYTES = 200_000;
const STORAGE_BUCKETS = ['articles', 'artifacts', 'heartandangel', 'liveheart-og', 'media', 'whispers'];

type Client = Awaited<ReturnType<typeof getServerSupabaseClient>>;
type FileRef = { bucket: string; path: string };
type BuildState = {
  status: 'running' | 'completed' | 'completed_with_errors' | 'failed';
  phase: 'tables' | 'files' | 'complete';
  startedAt: string;
  tableNames: string[];
  tableIndex: number;
  offset: number;
  files: FileRef[];
  fileIndex: number;
  recordsProcessed: number;
  filesProcessed: number;
  errors: string[];
};

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sourceKey(table: string, row: Record<string, unknown>) {
  const id = row.id ?? row.slug ?? row.key ?? row.path ?? hash(JSON.stringify(row));
  return `${table}:${String(id)}`;
}

async function getClient(): Promise<Client> {
  return await getServerSupabaseClient({ useServiceRole: true });
}

async function readJson<T>(client: Client, path: string): Promise<T | null> {
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function writeJson(client: Client, path: string, value: unknown) {
  const { error } = await client.storage.from(BUCKET).upload(path, JSON.stringify(value), {
    contentType: 'application/json',
    upsert: true,
    cacheControl: '0',
  });
  if (error) throw error;
}

function makeEmptyGraph(tableCount: number): KnowledgeGraph {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    version: 0,
    model: getKnowledgeMapModel(),
    nodes: [],
    edges: [],
    stats: { tables: tableCount, records: 0, files: 0, nodes: 0, edges: 0 },
  };
}

function addTableStructure(
  graph: KnowledgeGraph,
  tableNames: string[],
  foreignKeys: Array<{
    source_table: string;
    source_column: string;
    target_table: string;
    target_column: string;
  }>,
) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));

  for (const table of tableNames) {
    const id = `table:${table}`;
    nodes.set(id, {
      id,
      type: 'table',
      label: table.replace(/^public\./, ''),
      description: 'Supabase database table',
      confidence: 1,
      sourceKeys: [`schema:${table}`],
      metadata: { table },
    });
  }

  for (const fk of foreignKeys) {
    if (!tableNames.includes(fk.source_table) || !tableNames.includes(fk.target_table)) continue;

    const source = `table:${fk.source_table}`;
    const target = `table:${fk.target_table}`;
    const id = hash(`${source}|${target}|${fk.source_column}|${fk.target_column}`);

    edges.set(id, {
      id,
      source,
      target,
      type: 'depends_on',
      label: `${fk.source_column} → ${fk.target_column}`,
      evidence: ['Supabase foreign-key constraint'],
      confidence: 1,
      origin: 'database',
    });
  }

  graph.nodes = [...nodes.values()];
  graph.edges = [...edges.values()];
}

function mergeExtraction(
  graph: KnowledgeGraph,
  key: string,
  label: string,
  table: string | null,
  extraction: Awaited<ReturnType<typeof extractGraph>>,
) {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const localToCanonical = new Map<string, string>();

  for (const raw of extraction.nodes) {
    const canonicalId = `entity:${hash(`${raw.type}|${raw.label.trim().toLowerCase()}`).slice(0, 24)}`;
    localToCanonical.set(raw.id, canonicalId);

    const previous = nodeMap.get(canonicalId);
    const node: KnowledgeNode = {
      ...raw,
      id: canonicalId,
      description: previous?.description || raw.description,
      sourceKeys: [...new Set([...(previous?.sourceKeys || []), key])],
      confidence: Math.max(previous?.confidence || 0, raw.confidence),
      metadata: {
        ...(previous?.metadata || {}),
        sourceLabel: label,
        ...(table ? { table } : {}),
      },
    };
    nodeMap.set(canonicalId, node);
  }

  for (const raw of extraction.edges) {
    const source = localToCanonical.get(raw.source);
    const target = localToCanonical.get(raw.target);
    if (!source || !target || source === target) continue;

    const id = hash(`${source}|${target}|${raw.type}|${raw.label || ''}`);
    const previous = edgeMap.get(id);
    const edge: KnowledgeEdge = {
      id,
      source,
      target,
      type: raw.type,
      label: raw.label,
      evidence: [...new Set([...(previous?.evidence || []), raw.evidence])].slice(0, 10),
      confidence: Math.max(previous?.confidence || 0, raw.confidence),
      origin: table ? 'model' : 'file',
    };
    edgeMap.set(id, edge);
  }

  graph.nodes = [...nodeMap.values()];
  graph.edges = [...edgeMap.values()];
}

async function listFiles(client: Client): Promise<FileRef[]> {
  const result: FileRef[] = [];

  async function walk(bucket: string, prefix: string, depth: number): Promise<void> {
    if (depth > 8) return;

    let offset = 0;
    while (true) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (error || !data?.length) break;

      for (const item of data) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;

        if (!item.id) {
          await walk(bucket, path, depth + 1);
          continue;
        }

        const mime = typeof item.metadata?.mimetype === 'string' ? item.metadata.mimetype : null;
        if (isTextFile(path, mime)) result.push({ bucket, path });
      }

      offset += data.length;
      if (data.length < 100) break;
    }
  }

  for (const bucket of STORAGE_BUCKETS) {
    await walk(bucket, '', 0);
  }

  return result;
}

async function listTables(client: Client): Promise<string[]> {
  const { data, error } = await client.rpc('knowledge_map_list_tables');
  if (error) throw error;

  return (data || [])
    .map((row: { table_name: string }) => {
      const name = String(row.table_name);
      return name.startsWith('public.') ? name : `public.${name}`;
    })
    .filter((name: string) => !shouldExcludeTable(name));
}

async function beginBuild(client: Client): Promise<BuildState> {
  const tableNames = await listTables(client);
  const files = await listFiles(client);
  const graph = makeEmptyGraph(tableNames.length);

  const { data: fkData, error: fkError } = await client.rpc('knowledge_map_foreign_keys');
  if (!fkError) {
    addTableStructure(
      graph,
      tableNames,
      (fkData || []) as Array<{
        source_table: string;
        source_column: string;
        target_table: string;
        target_column: string;
      }>,
    );
  }

  const state: BuildState = {
    status: 'running',
    phase: 'tables',
    startedAt: new Date().toISOString(),
    tableNames,
    tableIndex: 0,
    offset: 0,
    files,
    fileIndex: 0,
    recordsProcessed: 0,
    filesProcessed: 0,
    errors: fkError ? [`Foreign keys: ${fkError.message}`] : [],
  };

  await writeJson(client, GRAPH_PATH, graph);
  await writeJson(client, STATE_PATH, state);
  return state;
}

function publicState(state: BuildState | null) {
  if (!state) return null;
  return {
    status: state.status,
    phase: state.phase,
    startedAt: state.startedAt,
    tableIndex: state.tableIndex,
    tableCount: state.tableNames.length,
    offset: state.offset,
    fileIndex: state.fileIndex,
    fileCount: state.files.length,
    recordsProcessed: state.recordsProcessed,
    filesProcessed: state.filesProcessed,
    errors: state.errors.slice(-10),
  };
}

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
    const client = await getClient();
    const state = await readJson<BuildState>(client, STATE_PATH);
    const graph = await readJson<KnowledgeGraph>(client, ACTIVE_PATH);

    return NextResponse.json({
      ok: true,
      state: publicState(state),
      graph: graph
        ? { version: graph.version, generatedAt: graph.generatedAt, stats: graph.stats }
        : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Status error';
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
    const client = await getClient();
    const body: unknown = await request.json().catch(() => null);

    if (!isRecord(body) || !['build', 'continue'].includes(String(body.action))) {
      return NextResponse.json({ error: 'Ожидается action: build или continue.' }, { status: 400 });
    }

    let state = await readJson<BuildState>(client, STATE_PATH);

    if (body.action === 'build') {
      if (state?.status === 'running') {
        return NextResponse.json(
          { error: 'Сборка уже идёт. Используйте «Продолжить».' },
          { status: 409 },
        );
      }
      state = await beginBuild(client);
    }

    if (!state) {
      return NextResponse.json(
        { error: 'Нет сохранённого состояния. Нажмите «Начать сборку».' },
        { status: 409 },
      );
    }

    if (state.status !== 'running') {
      const active = await readJson<KnowledgeGraph>(client, ACTIVE_PATH);
      return NextResponse.json({
        ok: true,
        done: true,
        state: publicState(state),
        graph: active?.stats || null,
      });
    }

    const graph = await readJson<KnowledgeGraph>(client, GRAPH_PATH);
    if (!graph) throw new Error('Рабочий граф отсутствует. Начните новую сборку.');

    let modelCalls = 0;
    let scanned = 0;

    while (state.phase !== 'complete' && modelCalls < 1 && scanned < 100) {
      if (state.phase === 'tables') {
        if (state.tableIndex >= state.tableNames.length) {
          state.phase = 'files';
          continue;
        }

        const table = state.tableNames[state.tableIndex];
        const { data: rows, error } = await client.rpc('knowledge_map_table_page', {
          p_table: table.replace(/^public\./, ''),
          p_limit: PAGE_SIZE,
          p_offset: state.offset,
        });

        if (error) {
          state.errors.push(`${table}: ${error.message}`);
          state.tableIndex++;
          state.offset = 0;
          continue;
        }

        if (!Array.isArray(rows) || rows.length === 0) {
          state.tableIndex++;
          state.offset = 0;
          continue;
        }

        let consumed = 0;

        for (let i = 0; i < rows.length; i++) {
          consumed = i + 1;
          scanned++;

          const row = rows[i];
          if (!isRecord(row)) continue;

          const key = sourceKey(table, row);
          const text = getTextFromRow(row);
          if (!text || text.length < 20 || text === '{}') continue;

          modelCalls++;
          try {
            const label = `${table.replace(/^public\./, '')} record`;
            const extraction = await extractGraph(key, label, text);
            mergeExtraction(graph, key, label, table, extraction);
            state.recordsProcessed++;
          } catch (error) {
            state.errors.push(
              `${key}: ${error instanceof Error ? error.message : 'DeepSeek error'}`,
            );
          }
          break;
        }

        state.offset += modelCalls ? consumed : rows.length;

        if (!modelCalls && rows.length < PAGE_SIZE) {
          state.tableIndex++;
          state.offset = 0;
        }
        continue;
      }

      if (state.phase === 'files') {
        if (state.fileIndex >= state.files.length) {
          state.phase = 'complete';
          continue;
        }

        const file = state.files[state.fileIndex];
        state.fileIndex++;
        scanned++;

        const key = `storage:${file.bucket}/${file.path}`;

        try {
          const { data, error } = await client.storage.from(file.bucket).download(file.path);
          if (error || !data) throw new Error(error?.message || 'download failed');

          if (data.size > MAX_FILE_BYTES) {
            state.errors.push(`${key}: пропущен файл больше 200 KB`);
            continue;
          }

          const rawText = await data.text();
          if (!rawText.trim()) continue;

          const safeText = String(sanitizeForModel(rawText)).slice(0, 12_000);
          if (safeText.length < 20) continue;

          modelCalls++;
          const extraction = await extractGraph(key, file.path, safeText);
          mergeExtraction(graph, key, file.path, null, extraction);
          state.filesProcessed++;
        } catch (error) {
          state.errors.push(`${key}: ${error instanceof Error ? error.message : 'file error'}`);
        }
      }
    }

    if (state.phase === 'complete') {
      const previous = await readJson<KnowledgeGraph>(client, ACTIVE_PATH);

      graph.generatedAt = new Date().toISOString();
      graph.version = (previous?.version || 0) + 1;
      graph.model = getKnowledgeMapModel();
      graph.stats = {
        tables: state.tableNames.length,
        records: state.recordsProcessed,
        files: state.filesProcessed,
        nodes: graph.nodes.length,
        edges: graph.edges.length,
      };

      // Publish only after the complete pass. Until this point the previous graph remains live.
      await writeJson(client, ACTIVE_PATH, graph);
      state.status = state.errors.length ? 'completed_with_errors' : 'completed';
    }

    await writeJson(client, GRAPH_PATH, graph);
    await writeJson(client, STATE_PATH, state);

    return NextResponse.json({
      ok: true,
      done: state.status === 'completed' || state.status === 'completed_with_errors',
      state: publicState(state),
      graph: state.phase === 'complete' ? { version: graph.version, stats: graph.stats } : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка построения графа';
    const unauthorized = /unauthorized|admin access required/i.test(message);
    return NextResponse.json(
      { error: unauthorized ? 'Доступ запрещён' : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
