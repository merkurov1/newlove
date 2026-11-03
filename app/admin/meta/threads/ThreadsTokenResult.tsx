'use client';

import { useState } from 'react';

import type { ThreadsOAuthToken } from '@/lib/meta/threadsOAuth';

type CopyTarget = 'token' | 'userId';

function expiresAtLabel(token: ThreadsOAuthToken): string | null {
  if (!token.expiresIn) return null;

  const obtained = Date.parse(token.obtainedAt);

  if (!Number.isFinite(obtained)) return null;

  return new Date(obtained + token.expiresIn * 1000).toISOString();
}

export default function ThreadsTokenResult({ token }: { token: ThreadsOAuthToken }) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const expiresAt = expiresAtLabel(token);
  const days = token.expiresIn ? Math.max(1, Math.round(token.expiresIn / 86400)) : null;

  async function copy(value: string, target: CopyTarget) {
    setCopyError(null);

    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopyError('Не удалось скопировать автоматически. Выделите значение вручную.');
    }
  }

  return (
    <section className="border border-emerald-200 bg-emerald-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-700">
            OAuth result
          </p>
          <h2 className="mt-1 font-serif text-xl text-[#211F1F]">Long-lived Threads token</h2>
          <p className="mt-1 text-xs text-[#5F6B60]">
            Показан только в защищённой админке и исчезнет из cookie через 10 минут.
          </p>
        </div>
        <span className="border border-emerald-300 bg-white px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-700">
          {token.tokenType}
        </span>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="border border-emerald-200 bg-white p-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
            META_THREADS_USER_ID
          </dt>
          <dd className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all text-sm text-[#211F1F]">{token.userId}</code>
            <button
              type="button"
              onClick={() => void copy(token.userId, 'userId')}
              className="border border-[#D9D3CD] px-2 py-1 text-xs text-[#49443C] transition hover:border-[#990F3D] hover:text-[#990F3D]"
            >
              {copied === 'userId' ? 'Скопировано' : 'Копировать'}
            </button>
          </dd>
        </div>

        <div className="border border-emerald-200 bg-white p-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
            Срок действия
          </dt>
          <dd className="mt-2 text-sm text-[#211F1F]">
            {days ? `${days} дней` : 'не указан'}
            {expiresAt && <span className="mt-1 block text-xs text-[#746D66]">до {expiresAt}</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-4 border border-emerald-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="threads-access-token"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]"
          >
            META_THREADS_ACCESS_TOKEN
          </label>
          <button
            type="button"
            onClick={() => void copy(token.accessToken, 'token')}
            className="border border-[#211F1F] bg-[#211F1F] px-3 py-1.5 text-xs text-white transition hover:bg-[#990F3D]"
          >
            {copied === 'token' ? 'Скопировано' : 'Скопировать токен'}
          </button>
        </div>
        <textarea
          id="threads-access-token"
          readOnly
          rows={3}
          value={token.accessToken}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-2 w-full resize-none border border-[#E5E1DC] bg-[#FAF9F7] p-2 font-mono text-xs text-[#49443C] outline-none"
        />
        {copyError && <p className="mt-2 text-xs text-red-700">{copyError}</p>}
      </div>
    </section>
  );
}
