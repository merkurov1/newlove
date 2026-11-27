'use client';

import { useState } from 'react';

type Diagnostics = {
  ok?: boolean;
  authenticated?: boolean | null;
  authorized?: boolean;
  role?: string | null;
  authMethod?: string | null;
  profileSource?: string | null;
  code?: string | null;
  reason?: string | null;
  message?: string | null;
  request?: {
    hasCookieHeader?: boolean;
    hasSupabaseSessionCookie?: boolean;
    hasAuthorizationHeader?: boolean;
    hasAdminSecretHeader?: boolean;
    hasTelegramInitData?: boolean;
  };
  checkedAt?: string;
};

type DiagnosticsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; status: number; payload: Diagnostics }
  | { kind: 'network_error'; message: string };

function flag(value: boolean | undefined): string {
  return value ? 'да' : 'нет';
}

export default function AdminAuthDiagnostics() {
  const [state, setState] = useState<DiagnosticsState>({ kind: 'idle' });

  async function check() {
    setState({ kind: 'loading' });

    try {
      const response = await fetch('/api/admin/auth-diagnostics', {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => ({}))) as Diagnostics;
      setState({ kind: 'done', status: response.status, payload });
    } catch (error) {
      setState({
        kind: 'network_error',
        message: error instanceof Error ? error.message : 'Сеть недоступна или запрос был прерван.',
      });
    }
  }

  return (
    <section className="pw-dev-auth-diagnostics" aria-live="polite">
      <div className="pw-dev-auth-diagnostics-head">
        <div>
          <p className="pw-dev-kicker">API AUTH</p>
          <strong>Диагностика админ-сессии</strong>
          <p className="pw-dev-auth-diagnostics-hint">
            Проверяет тот же путь авторизации, который используют <code>/api/admin/*</code>, включая
            статус и подключение YouTube.
          </p>
        </div>
        <button
          type="button"
          className="pw-dev-auth-diagnostics-button"
          onClick={check}
          disabled={state.kind === 'loading'}
        >
          {state.kind === 'loading' ? 'Проверяю…' : 'Проверить API'}
        </button>
      </div>

      {state.kind === 'network_error' && (
        <p className="pw-dev-auth-diagnostics-result is-error">Сеть: {state.message}</p>
      )}

      {state.kind === 'done' && (
        <div className="pw-dev-auth-diagnostics-result">
          <p>
            HTTP <code>{state.status}</code> ·{' '}
            {state.payload.authorized ? 'авторизован' : 'не авторизован'}{' '}
            {state.payload.code ? (
              <>
                · код <code>{state.payload.code}</code>
              </>
            ) : null}
          </p>
          {state.payload.message && <p>{state.payload.message}</p>}
          <dl>
            <div>
              <dt>Сессия найдена</dt>
              <dd>{flag(state.payload.authenticated === true)}</dd>
            </div>
            <div>
              <dt>Роль</dt>
              <dd>{state.payload.role || '—'}</dd>
            </div>
            <div>
              <dt>Метод</dt>
              <dd>{state.payload.authMethod || '—'}</dd>
            </div>
            <div>
              <dt>Профиль</dt>
              <dd>{state.payload.profileSource || '—'}</dd>
            </div>
            <div>
              <dt>Cookie</dt>
              <dd>{flag(state.payload.request?.hasCookieHeader)}</dd>
            </div>
            <div>
              <dt>Supabase cookie</dt>
              <dd>{flag(state.payload.request?.hasSupabaseSessionCookie)}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
