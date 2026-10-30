'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type GraphNode = {
  id: string;
  kind: string;
  label: string;
  subtitle: string | null;
  documentId?: string;
  entityId?: string;
  sourceType?: string;
  publishedAt?: string | null;
  mentionCount?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
  label: string;
  confidence: number;
  inference: boolean;
  provenance?: {
    documentId: string;
    documentTitle: string;
    chunkId: string;
    heading: string | null;
    sectionPath: string[];
  } | null;
};

type GraphPayload = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    documents: number;
    entities: number;
    relationships: number;
    mentions: number;
    shownNodes: number;
    shownEdges: number;
  };
};

type GraphProgress = {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  skipped: number;
  failed: number;
  cancelled: number;
  done: boolean;
};

type GraphRun = {
  id: string;
  status: string;
  total_documents: number;
  completed_documents: number;
  failed_documents: number;
  skipped_documents: number;
  created_at: string;
};

type GraphJob = {
  id: string;
  document_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_detail: string | null;
};

type NextResponse =
  | { state: 'processed'; job: GraphJob; progress: GraphProgress; runStatus: string; entityCount: number; relationshipCount: number; skipped: boolean }
  | { state: 'waiting'; progress: GraphProgress; runStatus: string }
  | { state: 'done'; progress: GraphProgress; runStatus: string }
  | { state: 'paused'; progress: GraphProgress; runStatus: string };

type SynthesisStep = 'documents' | 'chapters' | 'projects' | 'themes';

const TYPE_ORDER = [
  'document',
  'person',
  'organization',
  'publication',
  'artwork',
  'art_project',
  'technology',
  'event',
  'country',
  'city',
  'concept',
  'theme',
];

const TYPE_COLORS: Record<string, string> = {
  document: '#37332D',
  person: '#990F3D',
  organization: '#8A5A2B',
  publication: '#7A5C8E',
  artwork: '#2F6B45',
  art_project: '#2F6B45',
  technology: '#2E5A86',
  event: '#B06B2F',
  country: '#6B6B6B',
  city: '#6B6B6B',
  concept: '#87652A',
  theme: '#8A1235',
};

const SYNTHESIS_STEPS: SynthesisStep[] = ['documents', 'chapters', 'projects', 'themes'];

function api<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${response.status}).`);
    }

    return data as T;
  });
}

function nodeRadius(node: GraphNode): number {
  if (node.kind === 'document') return 6;
  return Math.min(15, 5 + Math.sqrt(node.mentionCount || 0));
}

function GraphCanvas({
  payload,
  selected,
  onSelect,
}: {
  payload: GraphPayload;
  selected: GraphNode | null;
  onSelect: (node: GraphNode | null) => void;
}) {
  const width = 1000;
  const height = 700;
  const centerX = width / 2;
  const centerY = height / 2;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const documents = payload.nodes.filter((node) => node.kind === 'document');
    const entityGroups = new Map<string, GraphNode[]>();

    for (const node of payload.nodes) {
      if (node.kind === 'document') continue;
      const list = entityGroups.get(node.kind) || [];
      list.push(node);
      entityGroups.set(node.kind, list);
    }

    documents.forEach((node, index) => {
      const angle = (index / Math.max(1, documents.length)) * Math.PI * 2 - Math.PI / 2;
      map.set(node.id, {
        x: centerX + Math.cos(angle) * 318,
        y: centerY + Math.sin(angle) * 286,
      });
    });

    const kindOrder = TYPE_ORDER.filter((kind) => kind !== 'document' && entityGroups.has(kind));
    const baseRadius = Math.min(245, 110 + kindOrder.length * 12);

    kindOrder.forEach((kind, kindIndex) => {
      const nodes = (entityGroups.get(kind) || []).sort(
        (left, right) => (right.mentionCount || 0) - (left.mentionCount || 0)
      );
      const radius = Math.max(95, baseRadius - kindIndex * 14);

      nodes.forEach((node, index) => {
        const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2 + kindIndex * 0.37;
        map.set(node.id, {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius * 0.82,
        });
      });
    });

    return map;
  }, [payload.nodes, centerX, centerY]);

  const selectedNeighbors = useMemo(() => {
    if (!selected) return new Set<string>();
    const ids = new Set<string>([selected.id]);

    for (const edge of payload.edges) {
      if (edge.source === selected.id) ids.add(edge.target);
      if (edge.target === selected.id) ids.add(edge.source);
    }

    return ids;
  }, [payload.edges, selected]);

  const labelThreshold = payload.nodes.length > 140 ? 22 : payload.nodes.length > 80 ? 10 : 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[560px] w-full min-w-[720px] select-none bg-[#FDFCFA]"
      role="img"
      aria-label="Brain knowledge graph"
      onClick={() => onSelect(null)}
    >
      <g>
        {payload.edges.map((edge) => {
          const source = positions.get(edge.source);
          const target = positions.get(edge.target);

          if (!source || !target) return null;

          const isMention = edge.relation === 'mentions';
          const isDocLink = edge.relation === 'related_to' && !edge.provenance;
          const highlighted = selected
            ? edge.source === selected.id || edge.target === selected.id
            : false;
          const opacity = selected ? (highlighted ? 0.75 : 0.06) : isMention ? 0.12 : 0.2;

          return (
            <line
              key={edge.id}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={
                edge.inference
                  ? '#B06B2F'
                  : isMention
                    ? '#8A8175'
                    : isDocLink
                      ? '#2E5A86'
                      : '#625D58'
              }
              strokeWidth={highlighted ? 1.8 : isMention ? 0.6 : 1}
              strokeDasharray={edge.inference ? '4 4' : undefined}
              opacity={opacity}
            />
          );
        })}
      </g>

      <g>
        {payload.nodes.map((node) => {
          const position = positions.get(node.id);

          if (!position) return null;

          const active = selected?.id === node.id;
          const connected = selected ? selectedNeighbors.has(node.id) : true;
          const color = TYPE_COLORS[node.kind] || '#625D58';
          const radius = nodeRadius(node);
          const showLabel =
            active ||
            (connected && ((node.mentionCount || 0) >= labelThreshold || payload.nodes.length < 70));

          return (
            <g
              key={node.id}
              transform={`translate(${position.x}, ${position.y})`}
              opacity={connected ? 1 : 0.18}
              className="cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(node);
              }}
            >
              {node.kind === 'document' ? (
                <rect
                  x={-radius}
                  y={-radius}
                  width={radius * 2}
                  height={radius * 2}
                  fill={color}
                  stroke={active ? '#990F3D' : '#FAF8F5'}
                  strokeWidth={active ? 2.5 : 1}
                />
              ) : (
                <circle
                  r={radius}
                  fill={color}
                  stroke={active ? '#990F3D' : '#FAF8F5'}
                  strokeWidth={active ? 2.5 : 1}
                  fillOpacity={node.kind === 'concept' || node.kind === 'theme' ? 0.8 : 0.95}
                />
              )}
              <title>{`${node.label} — ${node.kind}${node.mentionCount ? ` · ${node.mentionCount} mentions` : ''}`}</title>
              {showLabel && (
                <text
                  x={radius + 4}
                  y={3}
                  fill="#37332D"
                  fontSize={active ? 11 : 8.5}
                  fontFamily="ui-serif, Georgia, serif"
                  pointerEvents="none"
                >
                  {node.label.length > 34 ? `${node.label.slice(0, 33)}…` : node.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default function BrainGraphClient() {
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [types, setTypes] = useState<string[]>(TYPE_ORDER);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [busy, setBusy] = useState<'load' | 'build' | 'synthesize' | null>(null);
  const [run, setRun] = useState<GraphRun | null>(null);
  const [jobs, setJobs] = useState<GraphJob[]>([]);
  const [progress, setProgress] = useState<GraphProgress | null>(null);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    setBusy('load');
    setError(null);

    try {
      const params = new URLSearchParams();

      if (appliedQuery.trim()) params.set('q', appliedQuery.trim());
      if (types.length < TYPE_ORDER.length) params.set('types', types.join(','));
      params.set('limit', '320');

      const data = await api<GraphPayload & { status: string }>(
        `/api/admin/brain/graph?${params.toString()}`
      );

      setPayload({ nodes: data.nodes, edges: data.edges, stats: data.stats });
      setSelected(null);

      if (data.stats.entities === 0) {
        setMessage('No graph yet. Build the graph from the indexed documents first.');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load the graph.');
    } finally {
      setBusy(null);
    }
  }, [appliedQuery, types]);

  useEffect(() => {
    void loadGraph();
    // Load once on mount; filters use the Apply button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshRun = async (runId: string) => {
    const data = await api<{ run: GraphRun; jobs: GraphJob[]; progress: GraphProgress }>(
      `/api/admin/brain/graph/runs/${runId}`
    );

    setRun(data.run);
    setJobs(data.jobs || []);
    setProgress(data.progress);
  };

  const handleBuild = async () => {
    setBusy('build');
    setError(null);
    setMessage(null);
    setSynthesis(null);

    try {
      const created = await api<{
        status: string;
        run: GraphRun | null;
        jobs: GraphJob[];
        progress: GraphProgress;
        skippedDocumentIds: string[];
        message?: string;
      }>('/api/admin/brain/graph/runs', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (!created.run) {
        setMessage(created.message || 'The graph is already up to date.');
        await loadGraph();
        return;
      }

      setRun(created.run);
      setJobs(created.jobs || []);
      setProgress(created.progress);
      setMessage(
        `Extracting ${created.run.total_documents} documents. Unchanged documents were skipped.`
      );

      let guard = 0;

      while (guard < 1000) {
        guard += 1;
        const result = await api<NextResponse>(
          `/api/admin/brain/graph/runs/${created.run.id}/next`,
          { method: 'POST' }
        );

        setProgress(result.progress);
        await refreshRun(created.run.id);

        if (result.state === 'done' || result.state === 'paused') break;
      }

      setMessage('Graph extraction finished. Generate thematic summaries next.');
      await loadGraph();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Graph extraction failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleSynthesize = async () => {
    setBusy('synthesize');
    setError(null);
    setSynthesis(null);

    try {
      for (const step of SYNTHESIS_STEPS) {
        let guard = 0;

        while (guard < 200) {
          guard += 1;
          const result = await api<{
            step: SynthesisStep;
            done: boolean;
            processed: number;
            remaining: number;
          }>('/api/admin/brain/graph/synthesize', {
            method: 'POST',
            body: JSON.stringify({ step }),
          });

          setSynthesis(
            `${step}: ${result.processed} generated${result.remaining ? `, ${result.remaining} remaining` : ''}`
          );

          if (result.done) break;
        }
      }

      setMessage('Thematic summaries generated.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Could not generate summaries.'
      );
    } finally {
      setBusy(null);
    }
  };

  const selectedEdges = useMemo(() => {
    if (!payload || !selected) return [];

    return payload.edges
      .filter((edge) => edge.source === selected.id || edge.target === selected.id)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 24);
  }, [payload, selected]);

  const toggleType = (type: string) => {
    setTypes((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type]
    );
  };

  return (
    <div className="space-y-8">
      <section className="border border-[#E5E1DC] bg-white/70 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
              Search nodes
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setAppliedQuery(query);
              }}
              placeholder="AI regulation, Heart & Angel, memory…"
              className="mt-2 w-full border border-[#D9D3CD] bg-[#FDFCFA] px-3 py-2 text-sm text-[#211F1F] outline-none focus:border-[#990F3D]"
            />
          </label>

          <button
            type="button"
            onClick={() => setAppliedQuery(query)}
            disabled={busy !== null}
            className="border border-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#211F1F] transition hover:bg-[#211F1F] hover:text-white disabled:opacity-40"
          >
            Apply
          </button>

          <button
            type="button"
            onClick={handleBuild}
            disabled={busy !== null}
            className="bg-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition hover:bg-[#990F3D] disabled:opacity-40"
          >
            {busy === 'build' ? 'Extracting…' : 'Build / refresh graph'}
          </button>

          <button
            type="button"
            onClick={handleSynthesize}
            disabled={busy !== null}
            className="border border-[#E7C9D2] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A1235] transition hover:bg-[#F8EAF0] disabled:opacity-40"
          >
            {busy === 'synthesize' ? 'Summarising…' : 'Generate summaries'}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {TYPE_ORDER.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className={`border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] transition ${
                types.includes(type)
                  ? 'border-[#37332D] bg-[#37332D] text-white'
                  : 'border-[#D9D3CD] text-[#89827B]'
              }`}
            >
              {type.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {progress && (
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[#746D66]">
            {progress.completed + progress.skipped + progress.failed} / {progress.total} documents
            processed · {progress.completed} extracted · {progress.skipped} unchanged ·{' '}
            {progress.failed} failed
          </p>
        )}

        {synthesis && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#87652A]">
            {synthesis}
          </p>
        )}

        {error && (
          <p className="mt-4 border border-[#E7C9D2] bg-[#F8EAF0] px-3 py-2 text-sm text-[#8A1235]">
            {error}
          </p>
        )}

        {message && !error && (
          <p className="mt-4 border border-[#E5E1DC] bg-[#F8F6F2] px-3 py-2 text-sm text-[#625D58]">
            {message}
          </p>
        )}
      </section>

      {payload && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#D9D3CD] pb-3">
            <h2 className="font-serif text-2xl text-[#211F1F]">Graph</h2>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#89827B]">
              {payload.stats.documents} documents · {payload.stats.entities} entities ·{' '}
              {payload.stats.relationships} relationships · showing {payload.stats.shownNodes} /{' '}
              {payload.stats.shownEdges}
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="overflow-x-auto border border-[#E5E1DC]">
              <GraphCanvas payload={payload} selected={selected} onSelect={setSelected} />
            </div>

            <aside className="border border-[#E5E1DC] bg-white/70 p-4">
              {!selected ? (
                <div className="space-y-3 text-sm leading-relaxed text-[#746D66]">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
                    Inspect
                  </p>
                  <p>
                    Click a document or entity to see its connections and source provenance.
                    Dashed edges are inferred relationships, not verified facts.
                  </p>
                  <p>
                    Documents are squares on the outer ring. Entities are circles inside, grouped
                    by type.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                      {selected.kind.replace(/_/g, ' ')}
                    </p>
                    <h3 className="mt-1 font-serif text-xl leading-tight text-[#211F1F]">
                      {selected.label}
                    </h3>
                    {selected.subtitle && (
                      <p className="mt-1 text-sm leading-relaxed text-[#746D66]">
                        {selected.subtitle}
                      </p>
                    )}
                    <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#A29B94]">
                      {selected.mentionCount || 0} connections
                      {selected.confidence ? ` · confidence ${selected.confidence.toFixed(2)}` : ''}
                    </p>
                  </div>

                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#89827B]">
                      Connections
                    </p>
                    <ul className="mt-2 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {selectedEdges.map((edge) => {
                        const otherId = edge.source === selected.id ? edge.target : edge.source;
                        const other = payload.nodes.find((node) => node.id === otherId);

                        return (
                          <li key={edge.id} className="border-t border-[#EEE9E4] pt-2">
                            <p className="text-xs text-[#37332D]">
                              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#990F3D]">
                                {edge.label}
                              </span>{' '}
                              → {other?.label || otherId}
                            </p>
                            <p className="mt-0.5 font-mono text-[9px] text-[#A29B94]">
                              confidence {edge.confidence.toFixed(2)}
                              {edge.inference ? ' · inferred' : ' · explicit'}
                            </p>
                            {edge.provenance && (
                              <p className="mt-1 text-[11px] leading-relaxed text-[#746D66]">
                                {edge.provenance.documentTitle}
                                {edge.provenance.heading ? ` · ${edge.provenance.heading}` : ''}
                                <br />
                                <span className="font-mono text-[9px] text-[#A29B94]">
                                  {edge.provenance.chunkId}
                                </span>
                              </p>
                            )}
                          </li>
                        );
                      })}
                      {selectedEdges.length === 0 && (
                        <li className="text-xs text-[#89827B]">No visible connections.</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}
            </aside>
          </div>

          {jobs.length > 0 && (
            <details className="border-t border-[#D9D3CD] pt-4">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-[#746D66]">
                Extraction jobs · {jobs.length}
              </summary>
              <ul className="mt-3 max-h-72 divide-y divide-[#EEE9E4] overflow-y-auto">
                {jobs.slice(0, 200).map((job) => (
                  <li key={job.id} className="flex items-baseline justify-between gap-4 py-2">
                    <span className="truncate font-mono text-[10px] text-[#625D58]">
                      {job.document_id}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-[#89827B]">
                      {job.status} · {job.attempts}/{job.max_attempts}
                      {job.error_code ? ` · ${job.error_code}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
