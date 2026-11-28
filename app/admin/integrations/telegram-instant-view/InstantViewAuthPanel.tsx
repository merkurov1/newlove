'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { adminFetch } from '@/lib/auth/adminFetch';
import type { InstantViewPublicStatus } from '@/lib/telegram/instantViewAuth';

type Status = InstantViewPublicStatus;

type PanelProps = {
  initial: Status;
};

type ApiError = {
  error?: string;
  message?: string;
};

function statusLabel(status: Status['status']): string {
  switch (status) {
    case 'connected':
      return 'Подключено';
    case 'pending':
      return 'Ожидает подтверждения';
    case 'error':
      return 'Требует внимания';
    default:
      return 'Не подключено';
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function hashStatusLabel(status: Status['template']): string {
  switch (status?.hashStatus) {
    case 'verified':
      return 'совпадает — проверено';
    case 'mismatch':
      return 'не совпадает — нужен точный editor-issued hash';
    case 'missing_server_hash':
      return 'редактор выдал rhash, на сервере не настроен';
    case 'unknown':
      return 'не удалось определить';
    default:
      return 'не проверено — запустите проверку шаблона';
  }
}

function hashStatusTone(status: Status['template']): string {
  switch (status?.hashStatus) {
    case 'verified':
      return 'text-emerald-700';
    case 'mismatch':
    case 'missing_server_hash':
      return 'text-red-700';
    default:
      return 'text-[#211F1F]';
  }
}

function detailStatusLabel(status: Status['template']): string {
  switch (status?.detailStatus) {
    case 'loaded':
      return 'страница шаблона открыта';
    case 'unavailable':
      return 'страница шаблона недоступна';
    case 'unauthenticated':
      return 'страница шаблона не приняла сессию';
    default:
      return 'detail/preview не открывался';
  }
}

function errorText(code: string | undefined): string {
  switch (code) {
    case 'invalid_phone':
      return 'Введите номер в международном формате, например +79001234567.';
    case 'login_request_failed':
      return 'Telegram не принял запрос на вход. Проверьте номер и попробуйте снова.';
    case 'login_expired':
      return 'Подтверждение истекло. Начните подключение заново.';
    case 'login_check_failed':
      return 'Не удалось проверить подтверждение. Попробуйте ещё раз.';
    case 'session_cookie_missing':
      return 'Telegram подтвердил вход, но не выдал сессию редактора. Начните заново.';
    case 'session_verification_failed':
      return 'Сессия редактора не прошла проверку. Начните заново.';
    case 'session_unreadable':
      return 'Сохранённая сессия не читается. Подключите Telegram заново.';
    case 'session_expired':
      return 'Сессия редактора истекла. Подключите Telegram заново.';
    case 'editor_unreachable':
      return 'Редактор Instant View сейчас недоступен. Повторите проверку позже.';
    case 'storage_unavailable':
      return 'Приватное хранилище сессии недоступно. Проверьте server-side настройки.';
    default:
      return 'Операция не завершилась. Повторите попытку.';
  }
}

export default function InstantViewAuthPanel({ initial }: PanelProps) {
  const [status, setStatus] = useState<Status>(initial);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef(false);

  const request = useCallback(
    async (action: 'login' | 'check' | 'test' | 'inspect' | 'disconnect', body?: unknown) => {
      setBusy(action);
      setError(null);

      try {
        const path =
          action === 'login'
            ? '/api/admin/integrations/telegram-instant-view/login'
            : action === 'check'
              ? '/api/admin/integrations/telegram-instant-view/login/check'
              : action === 'test'
                ? '/api/admin/integrations/telegram-instant-view/test'
                : action === 'inspect'
                  ? '/api/admin/integrations/telegram-instant-view/inspect'
                  : '/api/admin/integrations/telegram-instant-view/disconnect';

        const response = await adminFetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        });
        const data = (await response.json().catch(() => ({}))) as Partial<Status> & ApiError;

        if (!response.ok || data.error) {
          setError(errorText(data.error));
          return null;
        }

        const next = data as Status;
        setStatus(next);
        return next;
      } catch {
        setError('Сеть недоступна. Повторите попытку.');
        return null;
      } finally {
        setBusy(null);
      }
    },
    []
  );

  useEffect(() => {
    if (status.status !== 'pending') return;

    const timer = window.setInterval(() => {
      if (polling.current) return;
      polling.current = true;
      void request('check').finally(() => {
        polling.current = false;
      });
    }, 2500);

    return () => window.clearInterval(timer);
  }, [request, status.status]);

  const connected = status.status === 'connected';
  const pending = status.status === 'pending';

  return (
    <div className="space-y-8">
      <header className="border-b border-[#D9D3CD] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#990F3D]">
          Admin → Integrations
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-[#211F1F] sm:text-4xl">
          Telegram Instant View
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#746D66]">
          Официальная авторизация редактора instantview.telegram.org. Подтверждение приходит в
          Telegram; коды, пароль и 2FA вводятся только в Telegram, а не на этом сайте. Cookie сессии
          хранится на сервере в зашифрованном виде и никогда не возвращается в браузер.
        </p>
      </header>

      {error && (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-[#D9D3CD] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">Сессия</p>
          <p
            className={[
              'mt-2 text-sm font-medium',
              connected
                ? 'text-emerald-700'
                : status.status === 'error'
                  ? 'text-red-700'
                  : 'text-[#211F1F]',
            ].join(' ')}
          >
            {statusLabel(status.status)}
          </p>
          <p className="mt-1 text-xs text-[#746D66]">
            {pending
              ? `до ${formatDate(status.pendingExpiresAt)}`
              : formatDate(status.lastVerifiedAt)}
          </p>
        </div>

        <div className="border border-[#D9D3CD] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">
            Хранилище
          </p>
          <p className="mt-2 text-sm font-medium text-[#211F1F]">
            {status.storage === 'available' ? 'Приватное, зашифровано' : 'Недоступно'}
          </p>
          <p className="mt-1 text-xs text-[#746D66]">
            {status.keySource === 'dedicated'
              ? 'TELEGRAM_INSTANT_VIEW_SESSION_KEY'
              : status.keySource === 'derived'
                ? 'Ключ из server-side service role'
                : 'Ключ не настроен'}
          </p>
        </div>

        <div className="border border-[#D9D3CD] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">
            Template hash
          </p>
          <p className="mt-2 text-sm font-medium text-[#211F1F]">
            {status.hashConfigured ? 'Настроен на сервере' : 'Не настроен'}
          </p>
          <p className="mt-1 text-xs text-[#746D66]">
            Значение не выводится и не попадает в клиент.
          </p>
        </div>

        <div className="border border-[#D9D3CD] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">
            Последняя проверка
          </p>
          <p className="mt-2 text-sm font-medium text-[#211F1F]">
            {formatDate(status.lastVerifiedAt)}
          </p>
          <p className="mt-1 text-xs text-[#746D66]">
            {status.lastErrorCode ? errorText(status.lastErrorCode) : 'Ошибок нет'}
          </p>
        </div>
      </section>

      {!connected && !pending && (
        <section className="border border-[#D9D3CD] bg-white p-5">
          <h2 className="font-serif text-xl text-[#211F1F]">Подключить Telegram</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#746D66]">
            Введите номер телефона, привязанный к аккаунту Telegram владельца. Telegram пришлёт
            подтверждение в приложение. Нажмите «Подтвердить» именно в Telegram — здесь нет полей
            для кода, пароля или 2FA.
          </p>

          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void request('login', { phone });
            }}
          >
            <label className="min-w-[260px] flex-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">
                Телефон
              </span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+79001234567"
                className="mt-2 w-full border border-[#CFC7C0] bg-white px-3 py-2.5 text-sm text-[#211F1F] outline-none focus:border-[#990F3D]"
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null || status.storage === 'unavailable'}
              className="inline-flex items-center bg-[#211F1F] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#990F3D] disabled:opacity-40"
            >
              {busy === 'login' ? 'Отправка…' : 'Подключить Telegram'}
            </button>
          </form>

          <p className="mt-3 text-xs text-[#89827B]">
            Номер используется только для официального запроса входа и не сохраняется в базе.
          </p>
        </section>
      )}

      {pending && (
        <section className="border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-serif text-xl text-[#5C4412]">Подтвердите вход в Telegram</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#6B5320]">
            Откройте Telegram на телефоне и подтвердите вход в Instant View. Эта страница
            автоматически проверит сессию. Не отправляйте коды или cookie в чат.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void request('check')}
              disabled={busy !== null}
              className="border border-[#C9A75B] bg-white px-3 py-2 text-sm text-[#5C4412] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
            >
              {busy === 'check' ? 'Проверка…' : 'Проверить сейчас'}
            </button>
            <button
              type="button"
              onClick={() => void request('disconnect')}
              disabled={busy !== null}
              className="border border-[#C9A75B] bg-transparent px-3 py-2 text-sm text-[#5C4412] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
            >
              Отменить
            </button>
          </div>
        </section>
      )}

      {connected && (
        <section className="border border-[#D9D3CD] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl text-[#211F1F]">Сессия редактора активна</h2>
              <p className="mt-1 text-sm text-[#746D66]">
                Подключено {formatDate(status.connectedAt)}. Сессия переживает перезапуск worker и
                хранится только на сервере.
              </p>
            </div>
            <span className="border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-700">
              verified
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void request('test')}
              disabled={busy !== null}
              className="border border-[#211F1F] bg-[#211F1F] px-3 py-2 text-sm text-white transition hover:bg-[#990F3D] disabled:opacity-40"
            >
              {busy === 'test' ? 'Проверка…' : 'Проверить сессию'}
            </button>
            <button
              type="button"
              onClick={() => void request('inspect')}
              disabled={busy !== null}
              className="border border-[#CFC7C0] px-3 py-2 text-sm text-[#49443C] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:opacity-40"
            >
              {busy === 'inspect' ? 'Проверка редактора…' : 'Проверить шаблон и hash'}
            </button>
            <button
              type="button"
              onClick={() => void request('disconnect')}
              disabled={busy !== null}
              className="border border-[#CFC7C0] px-3 py-2 text-sm text-[#49443C] transition hover:border-red-300 hover:text-red-700 disabled:opacity-40"
            >
              {busy === 'disconnect' ? 'Отключение…' : 'Отключить'}
            </button>
          </div>

          {status.template && (
            <dl className="mt-5 grid gap-3 border-t border-[#EAE6E1] pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
                  Template
                </dt>
                <dd className="mt-1 text-[#211F1F]">
                  {status.template.templatePresent ? 'merkurov.love найден' : 'не найден'}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
                  editor rhash
                </dt>
                <dd className="mt-1 text-[#211F1F]">
                  {status.template.rhashPresent ? 'выдан редактором' : 'не получен'}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
                  Совпадение с production
                </dt>
                <dd className={`mt-1 font-medium ${hashStatusTone(status.template)}`}>
                  {hashStatusLabel(status.template)}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
                  server-side secret
                </dt>
                <dd className="mt-1 text-[#211F1F]">
                  {status.template.serverHashConfigured ? 'настроен' : 'не настроен'}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
                  Detail / preview
                </dt>
                <dd className="mt-1 text-[#211F1F]">{detailStatusLabel(status.template)}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#89827B]">
                  Проверено
                </dt>
                <dd className="mt-1 text-[#211F1F]">
                  {formatDate(status.template.checkedAt ?? null)}
                </dd>
              </div>
            </dl>
          )}

          {status.template?.hashStatus === 'mismatch' && (
            <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800">
              Серверный secret не совпадает с hash, который выдал редактор. Откройте сохранённый
              шаблон в instantview.telegram.org, скопируйте значение <code>rhash</code> из ссылки
              «View in Telegram» и обновите только переменную{' '}
              <code>TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH</code> в Vercel → Settings → Environment
              Variables. Не отправляйте hash в чат и не меняйте его вручную.
            </p>
          )}

          {status.template?.hashStatus === 'missing_server_hash' && (
            <p className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800">
              Редактор уже выдал <code>rhash</code>, но на сервере не настроена переменная{' '}
              <code>TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH</code>. Добавьте точное значение из ссылки
              «View in Telegram» в Vercel → Settings → Environment Variables. Не публикуйте его в
              клиентских переменных.
            </p>
          )}

          {status.template?.hashStatus === 'unknown' && (
            <p className="mt-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-[#6B5320]">
              <code>rhash</code> не удалось получить со страницы шаблона или preview. Это не
              доказывает, что server-side secret неверен. Откройте сохранённый шаблон в редакторе и
              повторите проверку; production hash не меняется автоматически.
            </p>
          )}

          <p className="mt-4 border-t border-[#EAE6E1] pt-4 text-xs leading-relaxed text-[#89827B]">
            Проверка редактора не перезаписывает шаблон и не меняет hash. Репозиторный .iv остаётся
            единственным source of truth; расхождение с редактором требует решения владельца, а не
            автоматической замены. Сам hash и cookie никогда не возвращаются в браузер.
          </p>
        </section>
      )}

      <section className="border border-[#D9D3CD] bg-[#FAF9F7] p-5">
        <h2 className="font-serif text-xl text-[#211F1F]">Что происходит после подключения</h2>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed text-[#746D66]">
          <li>1. Worker проверяет /my/ уже с серверной сессией, без 401.</li>
          <li>
            2. Если в listing нет rhash, worker открывает сохранённый template detail/preview и
            читает ссылку «View in Telegram». Автоматической записи в редактор нет.
          </li>
          <li>3. Реальный rhash сверяется с server-only TELEGRAM_INSTANT_VIEW_TEMPLATE_HASH.</li>
          <li>
            4. При совпадении публичный Flow crosspost использует t.me/iv; иначе остаётся безопасный
            Mini App/canonical fallback.
          </li>
        </ol>
      </section>
    </div>
  );
}
