'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Proposal = {
  id: string;
  chapterLabel: string | null;
  status: string;
  original: string;
  proposed: string;
  rationale: string;
  createdAt: string;
  diff?: string;
};

export default function ManuscriptEditingPanel({ proposals }: { proposals: Proposal[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    chapterNumber: '',
    chunkId: '',
    original: '',
    proposed: '',
    rationale: '',
  });

  async function act(proposalId: string, action: 'approve' | 'reject') {
    setBusy(`${action}:${proposalId}`);
    setError(null);
    try {
      const response = await fetch('/api/admin/pierrot/manuscript/edits', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Review failed');
      router.refresh();
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : 'Review failed');
    } finally {
      setBusy(null);
    }
  }

  async function createProposal() {
    setBusy('create');
    setError(null);
    try {
      const response = await fetch('/api/admin/pierrot/manuscript/edits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chapterNumber: form.chapterNumber ? Number(form.chapterNumber) : null,
          chunkId: form.chunkId,
          original: form.original,
          proposed: form.proposed,
          rationale: form.rationale,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Proposal failed');
      setForm({ chapterNumber: '', chunkId: '', original: '', proposed: '', rationale: '' });
      router.refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Proposal failed');
    } finally {
      setBusy(null);
    }
  }

  const fieldStyle = {
    width: '100%',
    minHeight: 44,
    padding: '10px 12px',
    border: '1px solid #d8d3c7',
    borderRadius: 8,
    background: '#fffdf8',
    font: 'inherit',
  } as const;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section>
        <h2>Предложить правку</h2>
        <p style={{ color: '#6b6255', marginTop: -6 }}>
          Оригинал не перезаписывается. Предложение хранится отдельно; после одобрения создаётся
          ревизия с хэшем и автором.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 2fr', gap: 10, marginBottom: 10 }}>
          <input
            style={fieldStyle}
            placeholder="Глава"
            value={form.chapterNumber}
            onChange={(event) => setForm({ ...form, chapterNumber: event.target.value })}
          />
          <input
            style={fieldStyle}
            placeholder="Chunk ID (chk_…)"
            value={form.chunkId}
            onChange={(event) => setForm({ ...form, chunkId: event.target.value })}
          />
        </div>
        <textarea
          style={{ ...fieldStyle, minHeight: 100, marginBottom: 10 }}
          placeholder="Точный оригинальный фрагмент (должен дословно быть в chunks)"
          value={form.original}
          onChange={(event) => setForm({ ...form, original: event.target.value })}
        />
        <textarea
          style={{ ...fieldStyle, minHeight: 100, marginBottom: 10 }}
          placeholder="Предлагаемая редакция"
          value={form.proposed}
          onChange={(event) => setForm({ ...form, proposed: event.target.value })}
        />
        <input
          style={{ ...fieldStyle, marginBottom: 10 }}
          placeholder="Редакционное обоснование (необязательно)"
          value={form.rationale}
          onChange={(event) => setForm({ ...form, rationale: event.target.value })}
        />
        <button
          type="button"
          onClick={createProposal}
          disabled={busy !== null}
          style={{
            minHeight: 44,
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid #1f1b16',
            background: '#1f1b16',
            color: '#fffdf8',
            cursor: 'pointer',
          }}
        >
          {busy === 'create' ? 'Сохраняю…' : 'Сохранить предложение'}
        </button>
        {error ? <p style={{ color: '#8a1f1f' }}>{error}</p> : null}
      </section>

      <section>
        <h2>Предложения</h2>
        {proposals.length === 0 ? <p>Предложений пока нет.</p> : null}
        <div style={{ display: 'grid', gap: 14 }}>
          {proposals.map((proposal) => (
            <article
              key={proposal.id}
              style={{ border: '1px solid #d8d3c7', borderRadius: 10, padding: 14, background: '#fffdf8' }}
            >
              <header style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <strong>{proposal.chapterLabel || 'Без главы'}</strong>
                <span>{proposal.status}</span>
              </header>
              {proposal.rationale ? <p>{proposal.rationale}</p> : null}
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, overflowX: 'auto' }}>
                {proposal.diff || ''}
              </pre>
              {proposal.status === 'proposed' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => act(proposal.id, 'approve')}
                    disabled={busy !== null}
                  >
                    {busy === `approve:${proposal.id}` ? 'Одобряю…' : 'Одобрить ревизию'}
                  </button>
                  <button
                    type="button"
                    onClick={() => act(proposal.id, 'reject')}
                    disabled={busy !== null}
                  >
                    Отклонить
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
