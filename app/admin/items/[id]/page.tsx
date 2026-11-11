'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  FLOW_DISTRIBUTION_CHANNELS as DISTRIBUTION_CHANNELS,
  readDistributionState,
  type FlowDistributionChannel as DistributionChannel,
  type FlowDistributionState as ChannelState,
} from '@/lib/flow/distribution';
import TelegramPreview from '@/components/flow/TelegramPreview';

type Item = {
  id: string;
  title: string;
  slug: string;
  lang: string;
  type: string;
  status: string;
  visibility: string;
  body_md: string;
  source_url?: string | null;
  rag_allowed?: boolean;
  ai_allowed?: boolean;
  metadata?: Record<string, unknown> | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'ожидает',
  publishing: 'публикуется',
  published: 'опубликовано',
  failed: 'ошибка',
  skipped: 'пропущено',
  not_attempted: 'не отправлялось',
};

function statusClass(status: string): string {
  if (status === 'published') return 'bg-emerald-100 text-emerald-700';
  if (status === 'failed') return 'bg-red-100 text-red-700';
  if (status === 'publishing') return 'bg-amber-100 text-amber-700';
  return 'bg-stone-100 text-stone-600';
}

function DistributionPanel({
  item,
  onChanged,
}: {
  item: Item;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<DistributionChannel | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function retry(channel: DistributionChannel, uncertain: boolean) {
    if (uncertain) {
      const confirmed = window.confirm(
        'Результат предыдущей публикации неизвестен. Повторная отправка может создать дубликат. Продолжить?'
      );
      if (!confirmed) return;
    }

    setBusy(channel);
    setMessage(null);

    try {
      const res = await fetch('/api/flow/crosspost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          channels: [channel],
          retryUncertain: uncertain,
        }),
      });

      const json = await res.json();

      if (
        !res.ok ||
        (json.success === false && !json.channels?.[channel])
      ) {
        throw new Error(json.error ?? 'Не удалось выполнить публикацию.');
      }

      const state = json.channels?.[channel] as ChannelState | undefined;
      const status = state?.status ?? 'not_attempted';

      setMessage(
        `${DISTRIBUTION_CHANNELS.find((entry) => entry.key === channel)?.label ?? channel}: ${
          STATUS_LABELS[status] ?? status
        }${state?.lastError ? ` — ${state.lastError}` : ''}`
      );

      await onChanged();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Не удалось выполнить публикацию.'
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border p-4">
      <div>
        <h2 className="text-lg font-semibold">Публикация во внешние каналы</h2>
        <p className="mt-1 text-xs text-stone-500">
          Каждый канал публикуется независимо. Уже опубликованный канал повторно
          не отправляется, а неопределённый результат требует явного подтверждения.
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Threads:{' '}
          <Link
            href="/admin/meta/threads"
            className="text-[#990F3D] hover:underline"
          >
            подключить или обновить токен ↗
          </Link>
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {DISTRIBUTION_CHANNELS.map(({ key, label }) => {
          const state = readDistributionState(item.metadata, key);
          const status = state?.status ?? 'not_attempted';
          const uncertain = Boolean(state?.uncertain);
          const metaDisabled = key === 'threads';
          const canRetry =
            !metaDisabled &&
            status !== 'published' &&
            status !== 'publishing' &&
            busy === null;

          return (
            <div key={key} className="rounded-lg border p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-stone-800">{label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass(status)}`}
                >
                  {STATUS_LABELS[status] ?? status}
                  {uncertain ? ' · ?' : ''}
                </span>
              </div>

              <div className="mt-1 text-stone-500">
                attempts: {state?.attempts ?? 0}
              </div>

              {state?.externalUri && (
                <a
                  href={state.externalUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[#990F3D] hover:underline"
                >
                  Открыть публикацию ↗
                </a>
              )}

              {!state?.externalUri && state?.externalId && (
                <div className="mt-1 break-all text-stone-500">
                  id: {state.externalId}
                </div>
              )}

              {state?.lastError && (
                <p className="mt-2 rounded bg-red-50 px-2 py-1 text-red-700">
                  {state.lastError}
                </p>
              )}

              {canRetry && (
                <button
                  type="button"
                  onClick={() => void retry(key, uncertain)}
                  disabled={busy !== null}
                  className="mt-2 rounded-lg border px-2.5 py-1.5 text-stone-700 transition hover:bg-stone-50 disabled:opacity-40"
                >
                  {busy === key
                    ? 'Отправка...'
                    : uncertain
                      ? 'Повторить с подтверждением'
                      : 'Повторить'}
                </button>
              )}

              {metaDisabled && status !== 'published' && (
                <p className="mt-2 text-stone-500">
                  Кросспост отключён
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <TelegramPreview item={item} />
      </div>

      {message && (
        <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-700">
          {message}
        </p>
      )}
    </section>
  );
}

type AiContext = {
  id: string;
  item_id: string;
  content: string | null;
  model: string | null;
  provider: string | null;
  status: 'pending' | 'generating' | 'ready' | 'error';
  error: string | null;
  generated_at: string | null;
  updated_at: string;
  rag_enabled: boolean;
  retrieval_status: string;
  generation_version: string;
};

export default function AdminItemDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [item, setItem] = useState<Item | null>(null);
  const [aiContext, setAiContext] = useState<AiContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiMessage, setAiMessage] = useState('');

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);

      try {
        const res = await fetch(`/api/admin/items/${params.id}`);
        const json = await res.json();
        setItem(json.item);
        setAiContext(json.aiContext ?? null);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [params.id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!item) return;

    setSaving(true);

    const res = await fetch(`/api/admin/items/${params.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: item.title,
        slug: item.slug,
        lang: item.lang,
        visibility: item.visibility,
        status: item.status,
        body_md: item.body_md,
        rag_allowed: item.rag_allowed !== false,
      }),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      alert(json.error ?? 'Save failed');
      return;
    }

    if (json.aiContext?.context) {
      setAiContext(json.aiContext.context as AiContext);
      setAiMessage('AI context generated after publication.');
    } else if (json.aiContext?.status === 'error') {
      setAiMessage(json.aiContext.error ?? 'AI context generation failed after publication.');
    }

    alert('Saved');
  }

  async function handleGenerateAi() {
    if (!item) return;

    setGenerating(true);
    setAiMessage('');

    try {
      const res = await fetch(`/api/admin/items/${params.id}/ai`, {
        method: 'POST',
      });
      const json = await res.json();

      if (!res.ok) {
        // The endpoint persists an error row. Reload it so the admin sees the
        // real status/error instead of the previous ready content.
        try {
          const latest = await fetch(`/api/admin/items/${params.id}`);
          const latestJson = await latest.json();
          setAiContext(latestJson.aiContext ?? null);
        } catch {
          // Keep the error message even if the refresh fails.
        }

        setAiMessage(json.error ?? 'AI generation failed');
        return;
      }

      if (json.context) {
        setAiContext(json.context as AiContext);
        setAiMessage('AI context generated and saved.');
      } else {
        setAiContext(null);
        setAiMessage(json.message ?? 'AI context skipped for this item.');
      }
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : 'AI generation failed');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!item) {
    return <div className="p-8">Not found</div>;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Edit item</h1>

        <button onClick={handleSave} className="rounded-xl bg-black px-4 py-2 text-white" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} className="w-full rounded-xl border p-3" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Slug</label>
          <input value={item.slug} onChange={(e) => setItem({ ...item, slug: e.target.value })} className="w-full rounded-xl border p-3" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Language</label>
            <select value={item.lang} onChange={(e) => setItem({ ...item, lang: e.target.value })} className="w-full rounded-xl border p-3">
              <option value="ru">ru</option>
              <option value="en">en</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Visibility</label>
            <select value={item.visibility} onChange={(e) => setItem({ ...item, visibility: e.target.value })} className="w-full rounded-xl border p-3">
              <option value="private">private</option>
              <option value="public">public</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Status</label>
          <select value={item.status} onChange={(e) => setItem({ ...item, status: e.target.value })} className="w-full rounded-xl border p-3">
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="archived">archived</option>
          </select>
        </div>

        <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
          <input
            type="checkbox"
            checked={item.rag_allowed !== false}
            onChange={(e) => setItem({ ...item, rag_allowed: e.target.checked })}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">Allow public Brain RAG</span>
            <span className="block text-xs text-stone-500">
              When disabled, AI context is generated from the item itself only.
              Only explicitly public Brain documents can ever be used.
            </span>
          </span>
        </label>

        <section className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Flow AI context</h2>
              <p className="mt-1 text-xs text-stone-500">
                One DeepSeek request per click. Public Flow reads only the saved
                result; generated_at updates on every regeneration.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateAi}
              disabled={generating || item.type === 'photo' || item.ai_allowed === false}
              className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              {generating
                ? 'Generating...'
                : aiContext
                  ? 'Regenerate AI context'
                  : 'Generate AI context'}
            </button>
          </div>

          {item.type === 'photo' && (
            <p className="mt-3 text-xs text-stone-500">
              Photo items do not receive AI context by design.
            </p>
          )}
          {item.ai_allowed === false && (
            <p className="mt-3 text-xs text-[#990F3D]">
              AI context is disabled for this item (`ai_allowed=false`).
            </p>
          )}
          {aiMessage && (
            <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-700">
              {aiMessage}
            </p>
          )}

          {aiContext && (
            <div className="mt-4 space-y-2 border-t pt-4 text-xs text-stone-600">
              <p>
                status: <strong>{aiContext.status}</strong>
                {' · '}model: {aiContext.model ?? '—'}
                {' · '}provider: {aiContext.provider ?? '—'}
              </p>
              <p>
                generated_at: {aiContext.generated_at ?? '—'}
                {' · '}retrieval: {aiContext.retrieval_status}
                {' · '}version: {aiContext.generation_version}
              </p>
              {aiContext.error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
                  {aiContext.error}
                </p>
              )}
              {aiContext.content ? (
                <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-serif text-sm leading-relaxed">
                  {aiContext.content}
                </div>
              ) : (
                <p>No saved content yet.</p>
              )}
            </div>
          )}
        </section>

        <DistributionPanel item={item} onChanged={() => load(true)} />

        <div>
          <label className="mb-1 block text-sm font-medium">Body</label>
          <textarea value={item.body_md} onChange={(e) => setItem({ ...item, body_md: e.target.value })} rows={16} className="w-full rounded-xl border p-3" />
        </div>
      </div>
    </main>
  );
}
