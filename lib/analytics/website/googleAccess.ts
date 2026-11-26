/**
 * Owner-facing explanation of Google authorization and resource-permission
 * failures.
 *
 * This module is deliberately pure: it receives only classified error codes,
 * selected resource identifiers and the connected Google account label. Raw
 * OAuth responses, access tokens and refresh tokens are never accepted here, so
 * they cannot leak into the admin UI or sync history through this path.
 */

export const GA4_MINIMUM_ROLE = 'Viewer';
export const GSC_MINIMUM_ROLE = 'Full user или Owner';

/** Expected production resources; used only when a stored id is unavailable. */
export const EXPECTED_GA4_PROPERTY_ID = '244838264';
export const EXPECTED_GSC_PROPERTY = 'sc-domain:merkurov.love';

export type GoogleAccessProvider = 'google_analytics' | 'search_console';

export type GoogleAccessGuidanceInput = {
  provider: GoogleAccessProvider | string;
  errorCode?: string | null;
  lastErrorMessage?: string | null;
  googleAccountEmail?: string | null;
  ga4PropertyId?: string | null;
  ga4AccountId?: string | null;
  gscProperty?: string | null;
  permissionLevel?: string | null;
  /**
   * Whether the stored grant contains the required read-only scope. `null`
   * means the legacy scope list is unknown; a missing scope is then inferred
   * from the diagnostic message only when it explicitly mentions scopes.
   */
  requiredScopeGranted?: boolean | null;
};

export type GoogleAccessGuidance = {
  provider: GoogleAccessProvider;
  resourceKind: 'ga4_property' | 'search_console_property' | 'google_account' | null;
  resource: string | null;
  googleAccount: string | null;
  minimumRole: string | null;
  reason: string;
  ownerAction: string;
  /** A fresh consent is required; granting a role alone will not help. */
  reconnectRequired: boolean;
  /** The owner can retry after fixing permissions without a new consent. */
  retryable: boolean;
  /** The wrong Google account is connected; stop and wait for the owner. */
  accountChangeRequired: boolean;
};

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Last-resort defense for display strings. Provider errors are already reduced
 * to safe fields before storage; this also catches an accidentally embedded
 * credential in an upstream message so it cannot reach the admin UI.
 */
export function redactGoogleSecrets(value: string | null | undefined): string | null {
  if (!value) return value ?? null;

  return value
    .replace(/ya29\.[A-Za-z0-9._-]+/gi, '[redacted]')
    .replace(/1\/\/[A-Za-z0-9._-]+/g, '[redacted]')
    .replace(
      /((?:access_token|refresh_token|id_token|client_secret|authorization_code|code)=)[^&\s]+/gi,
      '$1[redacted]'
    )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

function providerOf(value: string | null | undefined): GoogleAccessProvider {
  return value === 'search_console' ? 'search_console' : 'google_analytics';
}

function resourceFor(
  provider: GoogleAccessProvider,
  input: GoogleAccessGuidanceInput
): { kind: 'ga4_property' | 'search_console_property'; resource: string } {
  if (provider === 'search_console') {
    return {
      kind: 'search_console_property',
      resource: clean(input.gscProperty) || EXPECTED_GSC_PROPERTY,
    };
  }

  return {
    kind: 'ga4_property',
    resource: clean(input.ga4PropertyId) || clean(input.ga4AccountId) || EXPECTED_GA4_PROPERTY_ID,
  };
}

function accountLabel(input: GoogleAccessGuidanceInput): string {
  return clean(input.googleAccountEmail) || 'подключённому Google-аккаунту';
}

function roleAction(
  provider: GoogleAccessProvider,
  resource: string,
  input: GoogleAccessGuidanceInput
): string {
  const account = accountLabel(input);

  if (provider === 'search_console') {
    return `Search Console → Settings → Users and permissions: добавьте ${account} как ${GSC_MINIMUM_ROLE} на property ${resource}. Права выдаёт владелец property. После выдачи нажмите «Повторить синхронизацию» — повторная авторизация не нужна.`;
  }

  return `Google Analytics → Admin → Property access management: выдайте ${account} роль ${GA4_MINIMUM_ROLE} (минимум) на property ${resource}. Права выдаёт владелец property. После выдачи нажмите «Повторить синхронизацию» — повторная авторизация не нужна.`;
}

function scopeAction(provider: GoogleAccessProvider, input: GoogleAccessGuidanceInput): string {
  const scope = provider === 'search_console' ? 'webmasters.readonly' : 'analytics.readonly';
  const account = clean(input.googleAccountEmail);
  return `Нажмите «Переподключить»${account ? ` и выберите Google-аккаунт ${account}` : ''}, затем подтвердите read-only scope ${scope}. Текущий grant не содержит этот scope.`;
}

function needsReconnect(code: string | null): boolean {
  return code === 'invalid_grant' || code === 'needs_reauthorization' || code === 'unauthorized';
}

export function buildGoogleAccessGuidance(input: GoogleAccessGuidanceInput): GoogleAccessGuidance {
  const provider = providerOf(input.provider);
  const code = clean(input.errorCode);
  const { kind, resource } = resourceFor(provider, input);
  const googleAccount = clean(input.googleAccountEmail);
  const message = redactGoogleSecrets(clean(input.lastErrorMessage));

  const base = {
    provider,
    resourceKind: kind,
    resource,
    googleAccount,
    minimumRole: provider === 'search_console' ? GSC_MINIMUM_ROLE : GA4_MINIMUM_ROLE,
    reconnectRequired: false,
    retryable: false,
    accountChangeRequired: false,
  } satisfies Omit<GoogleAccessGuidance, 'reason' | 'ownerAction'>;

  if (needsReconnect(code)) {
    return {
      ...base,
      reason:
        code === 'invalid_grant'
          ? 'Google больше не принимает сохранённый refresh token: grant отозван или истёк. Это не ошибка прав на resource.'
          : 'Сохранённый Google grant непригоден: нужна новая авторизация.',
      ownerAction: `Нажмите «Переподключить»${googleAccount ? ` и выберите Google-аккаунт ${googleAccount}` : ', выберите нужный Google-аккаунт'} и подтвердите read-only доступ. Токены в интерфейсе и журналах не показываются.`,
      reconnectRequired: true,
      retryable: false,
    };
  }

  if (code === 'insufficient_permissions') {
    const mentionsScope =
      input.requiredScopeGranted === false ||
      (input.requiredScopeGranted !== true && Boolean(message && /scope|scopes/i.test(message)));

    if (mentionsScope) {
      return {
        ...base,
        reason:
          provider === 'search_console'
            ? 'Google-аккаунт авторизован, но grant не содержит read-only scope webmasters.readonly.'
            : 'Google-аккаунт авторизован, но grant не содержит read-only scope analytics.readonly.',
        ownerAction: scopeAction(provider, input),
        reconnectRequired: true,
        retryable: false,
      };
    }

    return {
      ...base,
      reason:
        provider === 'search_console'
          ? `Google-аккаунт авторизован, но у него нет роли ${GSC_MINIMUM_ROLE} на Search Console property ${resource}.`
          : `Google-аккаунт авторизован, но у него нет роли ${GA4_MINIMUM_ROLE} (или выше) на GA4 property ${resource}.`,
      ownerAction: roleAction(provider, resource, input),
      reconnectRequired: false,
      retryable: true,
    };
  }

  if (code === 'account_mismatch') {
    return {
      ...base,
      resourceKind: 'google_account',
      reason:
        'Ресурс виден Google API, но принадлежит другому GA4 account или другому Google-аккаунту, чем ожидает конфигурация.',
      ownerAction:
        'Не выдавайте права автоматически. Проверьте ANALYTICS_GA4_ACCOUNT_ID и property id. Если нужен другой Google-аккаунт, остановитесь и переподключите Google с правильным аккаунтом.',
      reconnectRequired: true,
      retryable: false,
      accountChangeRequired: true,
    };
  }

  if (
    code === 'resource_not_found' ||
    code === 'discovery_empty' ||
    code === 'invalid_property_id' ||
    code === 'invalid_site_url'
  ) {
    return {
      ...base,
      reason:
        provider === 'search_console'
          ? `Подключённый Google-аккаунт не видит Search Console property ${resource} или ресурс не выбран.`
          : `Подключённый Google-аккаунт не видит GA4 property ${resource} или resource id указан неверно.`,
      ownerAction:
        provider === 'search_console'
          ? `Проверьте, что выбран правильный Google-аккаунт и property ${resource} существует. Если нужен другой аккаунт, остановитесь и переподключите Google; после выдачи ${GSC_MINIMUM_ROLE} нажмите «Повторить обнаружение».`
          : `Проверьте, что выбран правильный Google-аккаунт и property ${resource} существует. Если нужен другой аккаунт, остановитесь и переподключите Google; после выдачи ${GA4_MINIMUM_ROLE} нажмите «Повторить обнаружение».`,
      reconnectRequired: false,
      retryable: true,
      accountChangeRequired: true,
    };
  }

  if (code === 'api_not_enabled') {
    return {
      ...base,
      reason: 'Нужный Google API не включён в Google Cloud Console для этого проекта.',
      ownerAction:
        'Владельцу Google Cloud проекта нужно включить Google Analytics Admin API, Google Analytics Data API и Search Console API. Переменные окружения и OAuth scopes менять не нужно. Затем нажмите «Повторить обнаружение».',
      reconnectRequired: false,
      retryable: true,
    };
  }

  if (code === 'measurement_id_mismatch') {
    return {
      ...base,
      reason:
        'У выбранного GA4 property нет web data stream с ожидаемым Measurement ID. Property ID, Account ID и Measurement ID — разные идентификаторы.',
      ownerAction:
        'Проверьте, что в property есть web stream для сайта. Не подменяйте Property ID на Measurement ID; при необходимости остановитесь и уточните ресурс у владельца.',
      reconnectRequired: false,
      retryable: true,
    };
  }

  const isAuthOrPermissionCode = code === 'forbidden' || code === 'api_not_enabled';

  return {
    ...base,
    reason: isAuthOrPermissionCode
      ? 'Google отклонил запрос к resource.'
      : message || 'Google API вернул ошибку, которую нужно проверить.',
    ownerAction:
      'Проверьте диагностику без секретов ниже. Если ошибка связана с Google-аккаунтом или правами, остановитесь и передайте задачу владельцу. После устранения причины нажмите «Повторить синхронизацию».',
    reconnectRequired: false,
    retryable: true,
  };
}

export function googleAccountEmailFromMeta(
  meta: Record<string, unknown> | null | undefined
): string | null {
  if (!meta) return null;

  const direct = clean(meta.google_account_email);
  if (direct) return direct;

  const account = meta.google_account;
  if (account && typeof account === 'object' && !Array.isArray(account)) {
    return clean((account as Record<string, unknown>).email);
  }

  return null;
}
