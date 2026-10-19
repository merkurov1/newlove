
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KnowledgeGraph, KnowledgeNode } from '@/lib/knowledge-map/types';

type BuildStatus = {
  status: string;
  phase: string;
  startedAt: string;
  tableIndex: number;
  tableCount: number;
  offset: number;
  fileIndex: number;
  fileCount: number;
  recordsProcessed: number;
  filesProcessed: number;
  errors: string[];
};

type AdminStatus = {
  ok?: boolean;
  state?: BuildStatus | null;
  graph?: {
    version: number;
    generatedAt: string;
    stats: KnowledgeGraph['stats'];
  } | null;
  error?: string;
};

export default function KnowledgeMapClient() {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');
  const [admin, setAdmin] = useState(false);
  const [buildStatus, setBuildStatus] = useState<BuildStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [buildMessage, setBuildMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const loadGraph = useCallback(async () => {
    const response = await fetch('/api/all/map', { cache: 'no-store' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Граф пока недоступен.');
    }

    setGraph(data as KnowledgeGraph);
    setPageError('');
  }, []);

  const loadAdminStatus = useCallback(async () => {
    const response = await fetch('/api/admin/knowledge-map', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    });

    const data = (await response.json()) as AdminStatus;

    if (!response.ok) {
      setAdmin(false);
      return;
    }

    setAdmin(true);
    setBuildStatus(data.state || null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await loadGraph();
      } catch (error) {
        if (!cancelled) {
          setPageError(
            error instanceof Error
              ? error.message
              : 'Ошибка загрузки графа.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (!cancelled) {
        try {
          await loadAdminStatus();
        } catch {
          if (!cancelled) setAdmin(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [loadGraph, loadAdminStatus]);

  const types = useMemo(
    () => [...new Set((graph?.nodes || []).map((node) => node.type))].sort(),
    [graph],
  );

  const filteredNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return (graph?.nodes || []).filter((node) => {
      if (type !== 'all' && node.type !== type) return false;
      if (!normalized) return true;

      return [
        node.label,
        node.description || '',
        node.id,
        ...node.sourceKeys,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [graph, query, type]);

  const activeNode: KnowledgeNode | null =
    filteredNodes.find((node) => node.id === selected) ||
    graph?.nodes.find((node) => node.id === selected) ||
    null;

  const connectedEdges = useMemo(() => {
    if (!graph || !activeNode) return [];

    return graph.edges.filter(
      (edge) =>
        edge.source === activeNode.id ||
        edge.target === activeNode.id,
    );
  }, [graph, activeNode]);

  const runBuild = useCallback(
    async (action: 'build' | 'continue') => {
      setBusy(true);
      setBuildMessage(
        action === 'build'
          ? 'Подготовка новой сборки…'
          : 'Продолжаю сборку…',
      );

      try {
        let nextAction: 'build' | 'continue' = action;
        let done = false;

        for (let step = 0; step < 25; step++) {
          const response = await fetch('/api/admin/knowledge-map', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: nextAction }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Сборка завершилась ошибкой.');
          }

          const latestStatus = (data.state || null) as BuildStatus | null;
          setBuildStatus(latestStatus);
          done = Boolean(data.done);

          if (done) {
            setBuildMessage(
              latestStatus?.status === 'completed_with_errors'
                ? 'Граф опубликован, но есть ошибки. Посмотрите список ниже.'
                : 'Граф успешно построен и опубликован.',
            );

            await loadGraph().catch(() => undefined);
            await loadAdminStatus().catch(() => undefined);
            break;
          }

          nextAction = 'continue';

          setBuildMessage(
            `Обработано записей: ${latestStatus?.recordsProcessed ?? 0}; файлов: ${latestStatus?.filesProcessed ?? 0}. Работа продолжается…`,
          );
        }

        if (!done) {
          setBuildMessage(
            'Порция завершена. Нажмите «Продолжить сборку», чтобы продолжить с сохранённого места.',
          );
          await loadAdminStatus().catch(() => undefined);
        }
      } catch (error) {
        setBuildMessage(
          error instanceof Error
            ? error.message
            : 'Не удалось выполнить сборку.',
        );
        await loadAdminStatus().catch(() => undefined);
      } finally {
        setBusy(false);
      }
    },
    [loadGraph, loadAdminStatus],
  );

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="font-mono text-sm text-neutral-500">
          Loading knowledge map…
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-10 md:px-8">
      <header className="border-b border-neutral-200 pb-6">
        

        <div className="mt-5 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <h1 className="text-4xl font-light tracking-tight md:text-5xl">
              Knowledge map
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              A connected index of database records, text files, projects and ideas.
            </p>
          </div>

          {graph && (
            <div className="font-mono text-xs leading-6 text-neutral-500">
              <div>{graph.stats.nodes} nodes</div>
              <div>{graph.stats.edges} relationships</div>
              <div>version {graph.version}</div>
            </div>
          )}
        </div>
      </header>

      {admin && (
        <section className="border-b border-neutral-200 py-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-lg">Graph builder</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {buildStatus
                  ? `Status: ${buildStatus.status}; phase: ${buildStatus.phase}; tables: ${buildStatus.tableIndex}/${buildStatus.tableCount}; files: ${buildStatus.fileIndex}/${buildStatus.fileCount}`
                  : 'Сборка ещё не запускалась.'}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Работа идёт порциями. Предыдущий опубликованный граф остаётся доступен до завершения новой сборки.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || buildStatus?.status === 'running'}
                onClick={() => void runBuild('build')}
                className="border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                {busy ? 'Обработка…' : 'Начать сборку'}
              </button>

              <button
                type="button"
                disabled={busy || buildStatus?.status !== 'running'}
                onClick={() => void runBuild('continue')}
                className="border border-neutral-300 px-4 py-2 text-sm disabled:opacity-40"
              >
                Продолжить сборку
              </button>
            </div>
          </div>

          {buildMessage && (
            <p className="mt-4 text-sm leading-6">{buildMessage}</p>
          )}

          {buildStatus && (
            <div className="mt-4 grid gap-2 text-xs text-neutral-500 sm:grid-cols-3">
              <p>Records processed: {buildStatus.recordsProcessed}</p>
              <p>Text files processed: {buildStatus.filesProcessed}</p>
              <p>Started: {new Date(buildStatus.startedAt).toLocaleString()}</p>
            </div>
          )}

          {Boolean(buildStatus?.errors?.length) && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer">
                Последние ошибки ({buildStatus?.errors.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-600">
                {buildStatus?.errors.map((item, index) => (
                  <li key={index} className="break-words">{item}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {pageError && !graph ? (
        <section className="py-10">
          <p className="text-sm leading-6 text-neutral-600">{pageError}</p>
          <p className="mt-2 text-sm text-neutral-500">
            Если вы администратор, войдите в систему, чтобы увидеть панель сборки.
          </p>
        </section>
      ) : !graph ? (
        <p className="py-10 text-sm text-neutral-500">
          Граф ещё не опубликован. Войдите как администратор и нажмите «Начать сборку».
        </p>
      ) : (
        <section className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search entities, texts, projects…"
                className="min-w-0 flex-1 border border-neutral-300 bg-transparent px-3 py-3 text-sm outline-none focus:border-neutral-700"
              />

              <select
                value={type}
                onChange={(event) => setType(event.target.value)}
                className="border border-neutral-300 bg-white px-3 py-3 text-sm"
              >
                <option value="all">All types</option>
                {types.map((item) => (
                  <option value={item} key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div className="mt-5 border-t border-neutral-200">
              {filteredNodes.length === 0 ? (
                <p className="py-8 text-sm text-neutral-500">No matching entities.</p>
              ) : (
                filteredNodes.slice(0, 300).map((node) => (
                  <button
                    key={node.id}
                    onClick={() => setSelected(node.id)}
                    className={`block w-full border-b border-neutral-200 px-3 py-4 text-left transition-colors ${
                      selected === node.id ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-4">
                      <span className="text-base">{node.label}</span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                        {node.type}
                      </span>
                    </span>
                    {node.description && (
                      <span className="mt-1 block text-sm leading-5 text-neutral-600">
                        {node.description}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>

            <p className="mt-4 font-mono text-[11px] text-neutral-500">
              Showing {Math.min(filteredNodes.length, 300)} of {filteredNodes.length} matching entities.
            </p>
          </div>

          <aside className="self-start border-t border-neutral-300 pt-5 lg:sticky lg:top-8">
            {!activeNode ? (
              <p className="text-sm leading-6 text-neutral-500">
                Select an entity to inspect its relationships and source records.
              </p>
            ) : (
              <>
                <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                  Selected entity
                </p>
                <h2 className="mt-3 break-words text-2xl font-light">{activeNode.label}</h2>
                <p className="mt-2 font-mono text-xs text-neutral-500">{activeNode.type}</p>

                {activeNode.description && (
                  <p className="mt-4 text-sm leading-6 text-neutral-700">
                    {activeNode.description}
                  </p>
                )}

                <div className="mt-6 border-t border-neutral-200 pt-4">
                  <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                    Relationships ({connectedEdges.length})
                  </h3>

                  {connectedEdges.length === 0 ? (
                    <p className="mt-3 text-sm text-neutral-500">No linked entities found.</p>
                  ) : (
                    <ul className="mt-3 space-y-3">
                      {connectedEdges.map((edge) => {
                        const otherId = edge.source === activeNode.id ? edge.target : edge.source;
                        const other = graph.nodes.find((node) => node.id === otherId);

                        return (
                          <li key={edge.id} className="border-b border-neutral-100 pb-3">
                            <button
                              className="text-left text-sm underline decoration-neutral-300 underline-offset-4"
                              onClick={() => setSelected(otherId)}
                            >
                              {other?.label || otherId}
                            </button>
                            <p className="mt-1 text-xs text-neutral-500">{edge.label || edge.type}</p>
                            {edge.evidence?.[0] && (
                              <p className="mt-1 text-xs leading-5 text-neutral-500">
                                {edge.evidence[0]}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="mt-6 border-t border-neutral-200 pt-4">
                  <h3 className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                    Source records
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {activeNode.sourceKeys.map((key) => (
                      <li key={key} className="break-all font-mono text-[11px] text-neutral-500">
                        {key}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}
