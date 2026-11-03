import { cookies, headers } from 'next/headers';

import { requireAdmin } from '@/lib/serverAuth';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import {
  decryptThreadsOAuthResult,
  readThreadsOAuthConfig,
  THREADS_OAUTH_RESULT_COOKIE,
} from '@/lib/meta/threadsOAuth';
import ThreadsTokenResult from './ThreadsTokenResult';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
  robots: { index: false, follow: false },
  title: 'Threads OAuth',
});

const FALLBACK_SITE_URL = 'https://www.merkurov.love';

function callbackUrl(host: string | null, protocol: string | null): string {
  if (host) {
    const origin = `${protocol || (process.env.NODE_ENV === 'production' ? 'https' : 'http')}://${host}`;

    try {
      return new URL('/api/meta/threads/callback', origin).toString();
    } catch {
      // Fall through to the configured public URL.
    }
  }

  const base =
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL;

  return new URL('/api/meta/threads/callback', base).toString();
}

function statusMessage(status?: string, reason?: string): string | null {
  if (status === 'connected') {
    return 'Авторизация завершена. Скопируйте long-lived токен и добавьте его в Vercel.';
  }

  if (status === 'denied') {
    return 'Доступ отменён на стороне Threads. Публикация не была изменена.';
  }

  if (status !== 'error') return null;

  switch (reason) {
    case 'not_configured':
      return 'OAuth не настроен: отсутствуют META_THREADS_APP_ID или META_THREADS_APP_SECRET.';
    case 'invalid_state':
      return 'OAuth state недействителен. Запустите авторизацию заново из этой страницы.';
    case 'expired_state':
      return 'OAuth state истёк. Запустите авторизацию заново.';
    case 'missing_code':
      return 'Threads не вернул authorization code. Попробуйте ещё раз.';
    case 'exchange_failed':
      return 'Не удалось обменять authorization code на токен. Подробности не раскрываются; проверьте настройки приложения.';
    case 'storage_failed':
      return 'Токен получен, но защищённое хранилище результата недоступно. Запустите авторизацию заново.';
    default:
      return 'Авторизация Threads завершилась ошибкой.';
  }
}

type PageProps = {
  searchParams?: {
    status?: string;
    reason?: string;
  };
};

export default async function ThreadsOAuthPage({ searchParams }: PageProps) {
  await requireAdmin();

  const config = readThreadsOAuthConfig();
  const headerStore = await headers();
  const host =
    headerStore.get('x-forwarded-host')?.split(',')[0]?.trim() || headerStore.get('host');
  const protocol = headerStore.get('x-forwarded-proto')?.split(',')[0]?.trim() || null;
  const cookieStore = await cookies();
  const encryptedResult = cookieStore.get(THREADS_OAUTH_RESULT_COOKIE)?.value;
  const token =
    encryptedResult && config.appSecret
      ? decryptThreadsOAuthResult(encryptedResult, config.appSecret)
      : null;

  const message = statusMessage(searchParams?.status, searchParams?.reason);
  const callback = callbackUrl(host, protocol);
  const userIdConfigured = Boolean(process.env.META_THREADS_USER_ID?.trim());
  const accessTokenConfigured = Boolean(process.env.META_THREADS_ACCESS_TOKEN?.trim());

  return (
    <div className="space-y-8">
      <header className="border-b border-[#D9D3CD] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#990F3D]">
          Owner only
        </p>
        <h1 className="mt-2 font-serif text-3xl tracking-tight text-[#211F1F] sm:text-4xl">
          Threads OAuth
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#746D66]">
          Подключение Threads через официальный OAuth 2.0. Токен показывается только администратору
          и никогда не сохраняется в публичных таблицах, metadata Flow или localStorage.
        </p>
      </header>

      {message && (
        <div
          className={[
            'border px-4 py-3 text-sm',
            searchParams?.status === 'connected'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : searchParams?.status === 'denied'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-800',
          ].join(' ')}
        >
          {message}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="border border-[#D9D3CD] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">
            OAuth app
          </p>
          <p className="mt-2 text-sm font-medium text-[#211F1F]">
            {config.configured ? 'Настроен' : 'Не настроен'}
          </p>
          <p className="mt-1 text-xs text-[#746D66]">
            META_THREADS_APP_ID + META_THREADS_APP_SECRET
          </p>
        </div>

        <div className="border border-[#D9D3CD] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">
            Publish user
          </p>
          <p className="mt-2 text-sm font-medium text-[#211F1F]">
            {userIdConfigured ? 'User ID задан' : 'User ID не задан'}
          </p>
          <p className="mt-1 text-xs text-[#746D66]">META_THREADS_USER_ID</p>
        </div>

        <div className="border border-[#D9D3CD] bg-white p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">
            Publish token
          </p>
          <p className="mt-2 text-sm font-medium text-[#211F1F]">
            {accessTokenConfigured ? 'Токен задан' : 'Токен не задан'}
          </p>
          <p className="mt-1 text-xs text-[#746D66]">META_THREADS_ACCESS_TOKEN</p>
        </div>
      </section>

      <section className="border border-[#D9D3CD] bg-white p-5">
        <h2 className="font-serif text-xl text-[#211F1F]">Начать авторизацию</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#746D66]">
          Откроется официальное окно Threads. Запрошенные разрешения:{' '}
          <code className="rounded bg-[#F2EFEA] px-1.5 py-0.5 text-xs">
            threads_basic, threads_content_publish
          </code>
          . После подтверждения Threads вернёт вас на callback URL.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href="/api/meta/threads/authorize"
            aria-disabled={!config.configured}
            className={[
              'inline-flex items-center bg-[#211F1F] px-4 py-2.5 text-sm font-medium text-white transition',
              config.configured ? 'hover:bg-[#990F3D]' : 'pointer-events-none opacity-40',
            ].join(' ')}
          >
            Подключить Threads ↗
          </a>
          <span className="text-xs text-[#89827B]">Требуется активная admin-сессия.</span>
        </div>

        <div className="mt-5 border-t border-[#E5E1DC] pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#89827B]">
            Callback URL для Meta
          </p>
          <code className="mt-2 block break-all border border-[#E5E1DC] bg-[#FAF9F7] px-3 py-2 text-xs text-[#49443C]">
            {callback}
          </code>
          <p className="mt-2 text-xs leading-relaxed text-[#746D66]">
            Этот URL должен точно совпадать с Valid OAuth Redirect URI в настройках
            Threads-приложения Meta. Если вы открываете админку на другом домене, добавьте и его
            callback-вариант.
          </p>
        </div>
      </section>

      {token && <ThreadsTokenResult token={token} />}

      <section className="border border-[#D9D3CD] bg-white p-5">
        <h2 className="font-serif text-xl text-[#211F1F]">Что сделать после авторизации</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[#746D66]">
          <li>Скопировать long-lived access token из блока выше.</li>
          <li>
            Добавить в Vercel переменную{' '}
            <code className="rounded bg-[#F2EFEA] px-1.5 py-0.5 text-xs">
              META_THREADS_ACCESS_TOKEN
            </code>{' '}
            со значением токена.
          </li>
          <li>
            Добавить{' '}
            <code className="rounded bg-[#F2EFEA] px-1.5 py-0.5 text-xs">META_THREADS_USER_ID</code>{' '}
            со значением Threads User ID.
          </li>
          <li>Перезапустить deployment, чтобы новые env-переменные применились.</li>
        </ol>
        <p className="mt-4 text-xs leading-relaxed text-[#89827B]">
          Приложение не изменяет Vercel Environment Variables автоматически и не сохраняет токены в
          базе данных.
        </p>
      </section>
    </div>
  );
}
