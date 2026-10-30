'use client';

import { useState } from 'react';

import { getBrainExampleQuestions } from '@/lib/pierrot/brain';

type Citation = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  heading: string;
  sectionPath: string[];
  similarity: number | null;
  publishedAt: string | null;
  sourceType: string | null;
};

type ResearchAnswer = {
  status: string;
  answer: string;
  citations: Citation[];
  entities: Array<{ id: string; name: string; type: string; description: string | null }>;
  relationships: Array<{
    source: string;
    target: string;
    relation: string;
    confidence: number;
    inference: boolean;
    document_id: string;
    document_title: string | null;
    chunk_id: string;
    evidence: string;
  }>;
  retrieval: {
    outcome: string;
    documentIds: string[];
    chunkIds: string[];
    latencyMs: number;
  };
  graphContext: {
    matchedEntities: number;
    matchedRelationships: number;
    summaries: number;
  };
  caveat: string;
};

const EXAMPLES = [
  ...getBrainExampleQuestions('ru').slice(0, 3).map((question) => question.prompt),
  ...getBrainExampleQuestions('en').slice(0, 2).map((question) => question.prompt),
];

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

export default function BrainResearchClient() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<ResearchAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (value?: string) => {
    const text = (value ?? question).trim();

    if (!text || busy) return;

    setQuestion(text);
    setBusy(true);
    setError(null);
    setAnswer(null);

    try {
      const data = await api<ResearchAnswer>('/api/admin/brain/research', {
        method: 'POST',
        body: JSON.stringify({ question: text }),
      });

      setAnswer(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Could not answer the question.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="border border-[#E5E1DC] bg-white/70 p-4 sm:p-6">
        <label htmlFor="brain-research-question" className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#746D66]">
          Research question
        </label>
        <textarea
          id="brain-research-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void ask();
            }
          }}
          rows={4}
          placeholder="How has my position on AI regulation changed?"
          className="mt-3 w-full resize-y border border-[#D9D3CD] bg-[#FDFCFA] p-3 font-serif text-base leading-relaxed text-[#211F1F] outline-none focus:border-[#990F3D]"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void ask()}
            disabled={busy || !question.trim()}
            className="bg-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition hover:bg-[#990F3D] disabled:opacity-40"
          >
            {busy ? 'Thinking…' : 'Ask Brain'}
          </button>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#A29B94]">
            ⌘/Ctrl + Enter
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => void ask(example)}
              disabled={busy}
              className="border border-[#D9D3CD] px-2.5 py-1.5 text-left font-serif text-[12px] text-[#625D58] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
            >
              {example}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-4 border border-[#E7C9D2] bg-[#F8EAF0] px-3 py-2 text-sm text-[#8A1235]">
            {error}
          </p>
        )}
      </section>

      {answer && (
        <section className="space-y-6">
          <article className="border border-[#E5E1DC] bg-white/80 p-5 sm:p-7">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#89827B]">
              Answer · {answer.retrieval.outcome} · {answer.retrieval.latencyMs} ms
            </p>
            <div className="mt-3 whitespace-pre-wrap font-serif text-[17px] leading-[1.75] text-[#2F2B26]">
              {answer.answer}
            </div>
            <p className="mt-4 border-t border-[#EEE9E4] pt-3 text-xs leading-relaxed text-[#89827B]">
              {answer.caveat}
            </p>
          </article>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border border-[#E5E1DC] bg-white/70 p-4">
              <h2 className="font-serif text-xl text-[#211F1F]">Sources</h2>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#A29B94]">
                {answer.citations.length} cited passages
              </p>
              <ul className="mt-3 space-y-3">
                {answer.citations.map((citation, index) => (
                  <li key={`${citation.documentId}-${citation.chunkId}-${index}`} className="border-t border-[#EEE9E4] pt-2">
                    <p className="font-serif text-sm leading-snug text-[#37332D]">
                      {citation.documentTitle}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#A29B94]">
                      {citation.sourceType || 'document'}
                      {citation.publishedAt ? ` · ${citation.publishedAt.slice(0, 10)}` : ''}
                      {citation.similarity !== null ? ` · ${citation.similarity.toFixed(3)}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-[#746D66]">
                      {citation.heading}
                      {citation.sectionPath.length > 0 ? ` · ${citation.sectionPath.join(' / ')}` : ''}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] text-[#A29B94]">{citation.chunkId}</p>
                  </li>
                ))}
                {answer.citations.length === 0 && (
                  <li className="text-sm text-[#89827B]">No supporting passages were returned.</li>
                )}
              </ul>
            </div>

            <div className="border border-[#E5E1DC] bg-white/70 p-4">
              <h2 className="font-serif text-xl text-[#211F1F]">Graph context</h2>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#A29B94]">
                {answer.graphContext.matchedEntities} entities ·{' '}
                {answer.graphContext.matchedRelationships} relationships ·{' '}
                {answer.graphContext.summaries} summaries
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {answer.entities.map((entity) => (
                  <span
                    key={entity.id}
                    className="border border-[#E4DCCF] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#625D58]"
                    title={entity.description || undefined}
                  >
                    {entity.name} · {entity.type.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              <ul className="mt-4 space-y-2">
                {answer.relationships.slice(0, 15).map((relationship, index) => (
                  <li key={`${relationship.source}-${relationship.target}-${index}`} className="border-t border-[#EEE9E4] pt-2">
                    <p className="text-xs text-[#37332D]">
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#990F3D]">
                        {relationship.relation.replace(/_/g, ' ')}
                      </span>{' '}
                      {relationship.source} → {relationship.target}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] text-[#A29B94]">
                      {relationship.confidence.toFixed(2)}
                      {relationship.inference ? ' · inferred hypothesis' : ' · explicit'}
                      {relationship.document_title ? ` · ${relationship.document_title}` : ''}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-[#746D66]">
                      {relationship.evidence}
                    </p>
                  </li>
                ))}
                {answer.relationships.length === 0 && (
                  <li className="text-sm text-[#89827B]">No entity relationships matched the question.</li>
                )}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
