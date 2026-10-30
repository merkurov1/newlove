'use client';

import { useCallback, useEffect, useState } from 'react';

type Suggestion = {
  id: string;
  topic: string;
  representative_question: string;
  occurrences: number;
  avg_retrieval_similarity: number | null;
  missing_knowledge: boolean;
  related_document_ids: string[];
  related_document_titles: string[];
  suggestion: string;
  rationale: string | null;
  confidence: number;
  status: 'pending' | 'approved' | 'dismissed';
  created_at: string;
};

type RadarRun = {
  id: string;
  status: string;
  period_start: string;
  period_end: string;
  question_count: number;
  cluster_count: number;
  created_at: string;
};

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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export default function BrainRadarClient() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [runs, setRuns] = useState<RadarRun[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'dismissed'>('pending');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      const data = await api<{ suggestions: Suggestion[]; runs: RadarRun[] }>(
        `/api/admin/brain/radar?${params.toString()}`
      );

      setSuggestions(data.suggestions || []);
      setRuns(data.runs || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load the radar.');
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const data = await api<{
        questionCount: number;
        clusterCount: number;
        suggestions: Suggestion[];
      }>('/api/admin/brain/radar/refresh', {
        method: 'POST',
        body: JSON.stringify({ periodDays: 90, limit: 200 }),
      });

      setMessage(
        `Radar refreshed: ${data.questionCount} questions → ${data.clusterCount} topics.`
      );
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not refresh the radar.');
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (id: string, status: 'approved' | 'dismissed' | 'pending') => {
    setBusy(true);
    setError(null);

    try {
      await api(`/api/admin/brain/radar/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Could not update the suggestion.'
      );
    } finally {
      setBusy(false);
    }
  };

  const latestRun = runs[0] || null;

  return (
    <div className="space-y-8">
      <section className="border border-[#E5E1DC] bg-white/70 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
              Last 90 days of visitor questions
            </p>
            {latestRun ? (
              <p className="mt-2 text-sm text-[#625D58]">
                {latestRun.question_count} questions · {latestRun.cluster_count} topics ·{' '}
                {formatDate(latestRun.created_at)}
              </p>
            ) : (
              <p className="mt-2 text-sm text-[#89827B]">No radar run yet.</p>
            )}
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="bg-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition hover:bg-[#990F3D] disabled:opacity-40"
          >
            {busy ? 'Analysing…' : 'Refresh radar'}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {(['pending', 'approved', 'dismissed', 'all'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] transition ${
                filter === value
                  ? 'border-[#37332D] bg-[#37332D] text-white'
                  : 'border-[#D9D3CD] text-[#89827B]'
              }`}
            >
              {value}
            </button>
          ))}
        </div>

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

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#D9D3CD] pb-3">
          <h2 className="font-serif text-2xl text-[#211F1F]">Suggestions</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#89827B]">
            {suggestions.length} shown
          </p>
        </div>

        <ul className="divide-y divide-[#EEE9E4]">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} className="py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-xl leading-tight text-[#211F1F]">
                      {suggestion.topic}
                    </h3>
                    {suggestion.missing_knowledge && (
                      <span className="border border-[#E7C9D2] bg-[#F8EAF0] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8A1235]">
                        missing knowledge
                      </span>
                    )}
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#A29B94]">
                      {suggestion.status}
                    </span>
                  </div>
                  <p className="mt-1 font-serif text-sm italic text-[#746D66]">
                    “{suggestion.representative_question}”
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  {suggestion.status !== 'approved' && (
                    <button
                      type="button"
                      onClick={() => void updateStatus(suggestion.id, 'approved')}
                      disabled={busy}
                      className="border border-[#C7D8C4] bg-[#EEF5EC] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#3F6B39] disabled:opacity-40"
                    >
                      Approve
                    </button>
                  )}
                  {suggestion.status !== 'dismissed' && (
                    <button
                      type="button"
                      onClick={() => void updateStatus(suggestion.id, 'dismissed')}
                      disabled={busy}
                      className="border border-[#D9D3CD] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#89827B] disabled:opacity-40"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-3 max-w-4xl text-sm leading-relaxed text-[#37332D]">
                {suggestion.suggestion}
              </p>

              {suggestion.rationale && (
                <p className="mt-2 max-w-4xl text-xs leading-relaxed text-[#89827B]">
                  {suggestion.rationale}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#A29B94]">
                <span>{suggestion.occurrences} similar questions</span>
                <span>
                  avg similarity{' '}
                  {suggestion.avg_retrieval_similarity === null
                    ? '—'
                    : suggestion.avg_retrieval_similarity.toFixed(3)}
                </span>
                <span>confidence {suggestion.confidence.toFixed(2)}</span>
              </div>

              {suggestion.related_document_titles.length > 0 && (
                <div className="mt-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#89827B]">
                    Could be answered by
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs leading-relaxed text-[#625D58]">
                    {suggestion.related_document_titles.map((title, index) => (
                      <li key={`${suggestion.id}-${index}`}>{title}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>

        {suggestions.length === 0 && (
          <p className="mt-4 text-sm text-[#89827B]">
            No suggestions in this view. Refresh the radar or switch the filter.
          </p>
        )}
      </section>
    </div>
  );
}
