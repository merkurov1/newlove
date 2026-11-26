import type { FacebookConnectionState } from '@/lib/meta/facebookConnection';
import type { FacebookOAuthConfig, FacebookPageSummary } from '@/lib/meta/facebookOAuth';

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

function tokenExpiryLabel(state: FacebookConnectionState): string {
  if (state.source === 'environment') return 'не проверен (legacy env)';
  if (!state.tokenExpiryKnown) return 'не проверен';
  if (!state.tokenExpiresAt) return 'без установленной даты истечения';
  return `истекает ${formatDate(state.tokenExpiresAt)}`;
}

function statusLabel(state: FacebookConnectionState): string {
  if (state.connected) {
    return state.source === 'database' ? 'подключён · OAuth' : 'подключён · env';
  }
  if (state.status === 'disabled') return 'отключён';
  if (state.status === 'needs_reauthorization') return 'нужно разрешение';
  if (state.status === 'error') return 'ошибка';
  return 'не подключён';
}

function tone(state: FacebookConnectionState): string {
  if (state.connected && state.source === 'database') return 'growth';
  if (state.connected) return 'attention';
  if (state.status === 'error' || state.status === 'needs_reauthorization') {
    return 'attention';
  }
  return 'missing';
}

export default function FacebookPageManager({
  state,
  oauth,
  callbackUrl,
  selection,
}: {
  state: FacebookConnectionState;
  oauth: FacebookOAuthConfig;
  callbackUrl: string;
  selection: FacebookPageSummary[] | null;
}) {
  const connectHref = '/api/meta/facebook/authorize';

  return (
    <article className="pw-analytics-card">
      <div className="pw-analytics-card-head">
        <div>
          <span className={`pw-dot pw-dot-${tone(state)}`} aria-hidden="true" />
          <h2>Flow · Facebook Page</h2>
        </div>
        <span className="pw-analytics-badge">{statusLabel(state)}</span>
      </div>

      <p className="pw-analytics-id">
        {state.pageName || state.pageId || 'Facebook Page ещё не подключён'}
      </p>

      <dl className="pw-analytics-facts">
        <div>
          <dt>Page ID</dt>
          <dd>{state.pageId || '—'}</dd>
        </div>
        <div>
          <dt>Page token</dt>
          <dd>{tokenExpiryLabel(state)}</dd>
        </div>
        <div>
          <dt>Подключён</dt>
          <dd>{formatDate(state.connectedAt)}</dd>
        </div>
        <div>
          <dt>Источник токена</dt>
          <dd>
            {state.source === 'database'
              ? 'зашифрованное хранилище'
              : state.source === 'environment'
                ? 'META_FACEBOOK_PAGE_ACCESS_TOKEN'
                : '—'}
          </dd>
        </div>
      </dl>

      <p className="pw-analytics-hint">
        Права: {state.scopes.length ? state.scopes.join(', ') : '—'}. Публикация выполняется только
        на Page, не на личный профиль. Токен хранится на сервере в AES-256-GCM и не попадает в
        metadata Flow, localStorage или client bundle.
      </p>

      {oauth.configured ? (
        <p className="pw-analytics-hint">
          OAuth приложение настроено. Callback URL для Meta: <code>{callbackUrl}</code>
        </p>
      ) : (
        <p className="pw-analytics-action">
          OAuth не настроен: добавьте{' '}
          {oauth.missing.map((name, index) => (
            <span key={name}>
              <code>{name}</code>
              {index < oauth.missing.length - 1 ? ', ' : ''}
            </span>
          ))}
          . После добавления переменных deployment нужно перезапустить.
        </p>
      )}

      {state.storageError && <p className="pw-analytics-error">{state.storageError}</p>}

      {state.lastErrorCode && (
        <p className="pw-analytics-error">
          Meta: {state.lastErrorCode}
          {state.lastErrorMessage ? ` · ${state.lastErrorMessage}` : ''}
        </p>
      )}

      {selection && selection.length > 0 && (
        <div className="pw-analytics-config pw-analytics-config--quiet">
          <h2>Выберите Facebook Page</h2>
          <p>
            У аккаунта несколько доступных Page. Подключите ту, в которую Flow должен публиковать
            материалы. Токены Page остаются в зашифрованной серверной cookie до выбора.
          </p>
          <div className="pw-analytics-card-actions">
            {selection.map((page) => (
              <form key={page.id} action="/api/meta/facebook/select" method="post">
                <input type="hidden" name="page_id" value={page.id} />
                <button className="pw-analytics-button pw-analytics-button--quiet" type="submit">
                  {page.name} · {page.id}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      <p className="pw-analytics-hint">
        Meta может отозвать Page token при изменении разрешений, роли на странице, пароля или
        настроек приложения. В этом случае публикация остановится с понятной ошибкой, а Page нужно
        переподключить здесь. Дата истечения у long-lived Page token не устанавливается.
      </p>

      <div className="pw-analytics-card-actions">
        {oauth.configured && (
          <a className="pw-analytics-button" href={connectHref}>
            {state.connected ? 'Переподключить Facebook' : 'Подключить Facebook'}
          </a>
        )}
        {state.connected && state.source === 'database' && (
          <form action="/api/meta/facebook/disconnect" method="post">
            <button className="pw-analytics-button pw-analytics-button--quiet" type="submit">
              Отключить
            </button>
          </form>
        )}
        {state.connected && state.source === 'environment' && oauth.configured && (
          <span className="pw-analytics-hint">
            Сейчас используется legacy-токен из env. После переподключения приоритет получит
            зашифрованный токен из базы.
          </span>
        )}
      </div>
    </article>
  );
}
