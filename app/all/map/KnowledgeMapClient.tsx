'use client';

import { useEffect, useMemo, useState } from 'react';
import type { KnowledgeGraph, KnowledgeNode } from '@/lib/knowledge-map/types';

type GraphResponse = KnowledgeGraph & {
  ok?: boolean;
  error?: string;
};

export default function KnowledgeMapClient() {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch('/api/all/map', {
          cache: 'no-store',
        });

        const data = (await response.json()) as GraphResponse;

        if (!response.ok) {
          throw new Error(data.error || 'Граф пока недоступен.');
        }

        if (!cancelled) setGraph(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Ошибка загрузки графа.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const types = useMemo(() => {
    const unique = new Set(
      (graph?.nodes || []).map((node) => node.type),
    );

    return [...unique].sort();
  }, [graph]);

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

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="font-mono text-sm text-neutral-500">
          Loading knowledge map…
        </p>
      </main>
    );
  }

  if (error || !graph) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
          merkurov.love / all / map
        </p>
        <h1 className="mt-5 text-3xl font-light">Knowledge map</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-neutral-600">
          {error || 'Граф пока недоступен.'}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-10 md:px-8">
      <header className="border-b border-neutral-200 pb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
          merkurov.love / all / map
        </p>

        <div className="mt-5 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <h1 className="text-4xl font-light tracking-tight md:text-5xl">
              Knowledge map
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              A connected index of data, texts, projects and ideas.
            </p>
          </div>

          <div className="font-mono text-xs leading-6 text-neutral-500">
            <div>{graph.stats.nodes} nodes</div>
            <div>{graph.stats.edges} relationships</div>
            <div>version {graph.version}</div>
          </div>
        </div>
      </header>

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
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5 border-t border-neutral-200">
            {filteredNodes.length === 0 ? (
              <p className="py-8 text-sm text-neutral-500">
                No matching entities.
              </p>
            ) : (
              filteredNodes.slice(0, 300).map((node) => (
                <button
                  key={node.id}
                  onClick={() => setSelected(node.id)}
                  className={`block w-full border-b border-neutral-200 px-3 py-4 text-left transition-colors ${
                    selected === node.id
                      ? 'bg-neutral-100'
                      : 'hover:bg-neutral-50'
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
            Showing {Math.min(filteredNodes.length, 300)} of{' '}
            {filteredNodes.length} matching entities.
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

              <h2 className="mt-3 break-words text-2xl font-light">
                {activeNode.label}
              </h2>

              <p className="mt-2 font-mono text-xs text-neutral-500">
                {activeNode.type}
              </p>

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
                  <p className="mt-3 text-sm text-neutral-500">
                    No relationships recorded.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {connectedEdges.map((edge) => {
                      const otherId =
                        edge.source === activeNode.id
                          ? edge.target
                          : edge.source;

                      const other = graph.nodes.find(
                        (node) => node.id === otherId,
                      );

                      return (
                        <li
                          key={edge.id}
                          className="border-b border-neutral-200 pb-3"
                        >
                          <button
                            onClick={() => setSelected(otherId)}
                            className="text-left text-sm underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-700"
                          >
                            {other?.label || otherId}
                          </button>

                          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-neutral-500">
                            {edge.type}
                            {edge.label ? ` · ${edge.label}` : ''}
                          </p>

                          {edge.evidence.length > 0 && (
                            <p className="mt-2 text-xs leading-5 text-neutral-600">
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
                  Sources ({activeNode.sourceKeys.length})
                </h3>

                <ul className="mt-3 space-y-2">
                  {activeNode.sourceKeys.map((source) => (
                    <li
                      key={source}
                      className="break-all font-mono text-[11px] leading-5 text-neutral-600"
                    >
                      {source}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </aside>
      </section>

      <footer className="border-t border-neutral-200 pt-4 font-mono text-[10px] text-neutral-500">
        Generated {new Date(graph.generatedAt).toLocaleString()}
      </footer>
    </main>
  );
}