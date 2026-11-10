import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  GA4_READONLY_SCOPE,
  GSC_READONLY_SCOPE,
  WEBSITE_ANALYTICS_MEASUREMENT_ID,
  getGoogleAccountOverride,
  getGooglePropertyOverride,
  getSearchConsoleSiteOverride,
} from './config';
import {
  chooseGa4Property,
  chooseSearchConsoleSite,
  discoverGa4PropertiesDetailed,
  listSearchConsoleSites,
  normalizeGa4AccountId,
  normalizeGa4PropertyId,
  readGa4PropertyDetailed,
} from './providers/oauth';
import {
  AnalyticsProviderError,
  diagnosticFromError,
  diagnosticSummary,
  type ProviderErrorDiagnostic,
} from './providers/http';
import {
  getStoredConnection,
  markConnectionError,
  upsertConnection,
  type StoredConnection,
} from './store';
import { openSecret, sealSecret, type SealedSecret } from './tokenCrypto';
import type { AnalyticsProvider } from './types';

assertServerOnly('lib/analytics/website/discovery');

type GoogleProvider = Extract<AnalyticsProvider, 'google_analytics' | 'search_console'>;

export type GoogleDiscoveryStatus =
  'connected' | 'not_granted' | 'resource_not_found' | 'discovery_empty' | 'error';

export type GoogleDiscoveryResult = {
  provider: GoogleProvider;
  status: GoogleDiscoveryStatus;
  code: string | null;
  message: string | null;
  diagnostic: ProviderErrorDiagnostic | null;
  externalId: string | null;
  accountLabel: string | null;
};

type DiscoveryInput = {
  accessToken: string;
  scopes: string[];
  sealed?: SealedSecret | null;
  connectedBy?: string | null;
  measurementId?: string;
  propertyOverride?: string | null;
  accountOverride?: string | null;
  siteOverride?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function existingMeta(existing: StoredConnection | null): Record<string, unknown> {
  if (!isRecord(existing?.external_meta)) return {};
  const rest = { ...existing.external_meta };
  delete rest.error;
  return rest;
}

function existingDiscovery(existing: StoredConnection | null): Record<string, unknown> {
  const meta = existingMeta(existing);
  return isRecord(meta.discovery) ? meta.discovery : {};
}

function compactProperties(
  properties: Awaited<ReturnType<typeof discoverGa4PropertiesDetailed>>['properties']
) {
  return properties.slice(0, 100).map((property) => ({
    property_id: property.propertyId,
    display_name: property.displayName,
    property_type: property.propertyType,
    account_id: property.accountId,
    account_name: property.accountName,
    measurement_ids: property.measurementIds,
  }));
}

function discoveryErrorMeta(
  existing: StoredConnection | null,
  diagnostic: ProviderErrorDiagnostic,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const meta = existingMeta(existing);
  const previous = existingDiscovery(existing);

  return {
    ...meta,
    ...extra,
    discovery: {
      ...previous,
      provider: diagnostic.provider,
      status: 'error',
      stage: diagnostic.stage,
      checked_at: diagnostic.timestamp,
      code: diagnostic.code,
      http_status: diagnostic.httpStatus,
      google_error_code: diagnostic.googleErrorCode,
      google_error_message: diagnostic.googleErrorMessage,
      message: diagnostic.message,
      scope: diagnostic.scope,
      retryable: diagnostic.retryable,
      last_error_at: diagnostic.timestamp,
    },
  };
}

function discoverySuccessMeta(
  provider: GoogleProvider,
  existing: StoredConnection | null,
  input: {
    scopes: string[];
    extra: Record<string, unknown>;
  }
): Record<string, unknown> {
  const meta = existingMeta(existing);
  const previous = existingDiscovery(existing);
  const checkedAt = new Date().toISOString();

  return {
    ...meta,
    ...input.extra,
    discovery: {
      ...previous,
      provider,
      status: 'connected',
      stage: 'complete',
      checked_at: checkedAt,
      last_success_at: checkedAt,
      code: null,
      http_status: null,
      google_error_code: null,
      google_error_message: null,
      message: null,
      scope: null,
      retryable: false,
      scopes: input.scopes,
    },
  };
}

async function persistError(
  store: SupabaseClient,
  provider: GoogleProvider,
  existing: StoredConnection | null,
  input: DiscoveryInput,
  diagnostic: ProviderErrorDiagnostic,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const status =
    diagnostic.code === 'unauthorized' ||
    diagnostic.code === 'invalid_grant' ||
    diagnostic.code === 'needs_reauthorization'
      ? 'needs_reauthorization'
      : 'error';

  const shouldPersist = Boolean(existing || input.sealed);

  if (shouldPersist) {
    await upsertConnection(store, {
      provider,
      status,
      accountLabel:
        existing?.account_label ??
        (provider === 'google_analytics' ? 'Google Analytics' : 'Search Console'),
      externalId: existing?.external_id ?? null,
      externalMeta: discoveryErrorMeta(existing, diagnostic, extra),
      scopes: input.scopes,
      sealed: input.sealed ?? undefined,
      connectedBy: input.connectedBy ?? existing?.connected_by ?? null,
    });
  }

  await markConnectionError(store, provider, diagnostic.code, diagnosticSummary(diagnostic));
}

function errorFor(
  provider: GoogleProvider,
  code: string,
  message: string,
  stage: string,
  scope: string
): AnalyticsProviderError {
  return new AnalyticsProviderError({
    provider,
    code,
    message,
    stage,
    scope,
  });
}

export async function runGa4Discovery(
  store: SupabaseClient,
  input: DiscoveryInput
): Promise<GoogleDiscoveryResult> {
  const existing = await getStoredConnection(store, 'google_analytics').catch(() => null);

  if (!input.scopes.includes(GA4_READONLY_SCOPE)) {
    const diagnostic = diagnosticFromError(
      errorFor(
        'google_analytics',
        'insufficient_permissions',
        'Google did not grant the analytics.readonly scope.',
        'scope_check',
        GA4_READONLY_SCOPE
      ),
      { provider: 'google_analytics', stage: 'scope_check', scope: GA4_READONLY_SCOPE }
    );

    await persistError(store, 'google_analytics', existing, input, diagnostic);

    return {
      provider: 'google_analytics',
      status: 'not_granted',
      code: diagnostic.code,
      message: diagnostic.message,
      diagnostic,
      externalId: existing?.external_id ?? null,
      accountLabel: existing?.account_label ?? null,
    };
  }

  try {
    const measurementId = input.measurementId || WEBSITE_ANALYTICS_MEASUREMENT_ID;
    const override = normalizeGa4PropertyId(input.propertyOverride ?? getGooglePropertyOverride());
    const accountOverride = normalizeGa4AccountId(
      input.accountOverride ?? getGoogleAccountOverride()
    );

    // With an explicit property id, verify that one resource directly instead
    // of listing every property and its streams. Without an override, discover
    // all properties and match the browser measurement id.
    const discovery = override
      ? await (async () => {
          const direct = await readGa4PropertyDetailed(input.accessToken, override);
          return {
            properties: [direct.property],
            warnings: direct.warnings,
            accountCount: direct.property.accountId ? 1 : 0,
          };
        })()
      : await discoverGa4PropertiesDetailed(input.accessToken);

    const property = chooseGa4Property(discovery.properties, {
      measurementId,
      override,
      accountId: accountOverride,
    });

    if (!property) {
      const propertyById = override
        ? (discovery.properties.find((entry) => entry.propertyId === override) ?? null)
        : null;

      let code: string;
      let message: string;

      if (discovery.properties.length === 0) {
        code = 'discovery_empty';
        message = 'No GA4 properties are visible to this Google account.';
      } else if (override && !propertyById) {
        code = 'resource_not_found';
        message = `ANALYTICS_GA4_PROPERTY_ID points to ${override}, but this Google account cannot access it.`;
      } else if (override && accountOverride && propertyById?.accountId !== accountOverride) {
        code = 'account_mismatch';
        message = `GA4 property ${override} belongs to account ${
          propertyById?.accountId || 'unknown'
        }, not the configured account ${accountOverride}.`;
      } else if (override) {
        code = 'measurement_id_mismatch';
        message = `GA4 property ${override} has no web data stream with measurement id ${measurementId}. Property, account and measurement ids are not interchangeable.`;
      } else if (accountOverride) {
        code = 'resource_not_found';
        message = `No GA4 property in account ${accountOverride} exposes measurement id ${measurementId}.`;
      } else {
        code = 'resource_not_found';
        message = `No GA4 property exposes measurement id ${measurementId}.`;
      }

      const diagnostic = diagnosticFromError(
        errorFor('google_analytics', code, message, 'selection', GA4_READONLY_SCOPE),
        { provider: 'google_analytics', stage: 'selection', scope: GA4_READONLY_SCOPE }
      );

      await persistError(store, 'google_analytics', existing, input, diagnostic, {
        discovered_properties: compactProperties(discovery.properties),
        discovered_accounts: discovery.accountCount,
        requested_property_id: override,
        requested_account_id: accountOverride,
        measurement_id: measurementId,
        warnings: discovery.warnings,
      });

      return {
        provider: 'google_analytics',
        status: code === 'discovery_empty' ? 'discovery_empty' : 'resource_not_found',
        code,
        message,
        diagnostic,
        externalId: existing?.external_id ?? null,
        accountLabel: existing?.account_label ?? null,
      };
    }

    // chooseGa4Property already required the web stream to contain this exact
    // measurement id. Never fall back to another stream or to the Account ID.
    const matchedMeasurementId = measurementId;

    const accountLabel = property.accountName
      ? `${property.accountName} · ${property.displayName}`
      : property.displayName;

    await upsertConnection(store, {
      provider: 'google_analytics',
      status: 'connected',
      accountLabel,
      externalId: property.propertyId,
      externalMeta: discoverySuccessMeta('google_analytics', existing, {
        scopes: input.scopes,
        extra: {
          account_id: property.accountId,
          account_name: property.accountName,
          property_id: property.propertyId,
          property_display_name: property.displayName,
          property_type: property.propertyType,
          measurement_ids: property.measurementIds,
          matched_measurement_id: matchedMeasurementId,
          discovered_properties: compactProperties(discovery.properties),
          discovered_accounts: discovery.accountCount,
          warnings: discovery.warnings,
        },
      }),
      scopes: input.scopes,
      sealed: input.sealed ?? undefined,
      connectedBy: input.connectedBy ?? existing?.connected_by ?? null,
    });

    return {
      provider: 'google_analytics',
      status: 'connected',
      code: null,
      message: null,
      diagnostic: null,
      externalId: property.propertyId,
      accountLabel,
    };
  } catch (error) {
    const diagnostic = diagnosticFromError(error, {
      provider: 'google_analytics',
      stage: 'accountSummaries',
      scope: GA4_READONLY_SCOPE,
    });

    await persistError(store, 'google_analytics', existing, input, diagnostic);

    return {
      provider: 'google_analytics',
      status: 'error',
      code: diagnostic.code,
      message: diagnostic.message,
      diagnostic,
      externalId: existing?.external_id ?? null,
      accountLabel: existing?.account_label ?? null,
    };
  }
}

export async function runSearchConsoleDiscovery(
  store: SupabaseClient,
  input: DiscoveryInput
): Promise<GoogleDiscoveryResult> {
  const existing = await getStoredConnection(store, 'search_console').catch(() => null);

  if (!input.scopes.includes(GSC_READONLY_SCOPE)) {
    const diagnostic = diagnosticFromError(
      errorFor(
        'search_console',
        'insufficient_permissions',
        'Google did not grant the webmasters.readonly scope.',
        'scope_check',
        GSC_READONLY_SCOPE
      ),
      { provider: 'search_console', stage: 'scope_check', scope: GSC_READONLY_SCOPE }
    );

    await persistError(store, 'search_console', existing, input, diagnostic);

    return {
      provider: 'search_console',
      status: 'not_granted',
      code: diagnostic.code,
      message: diagnostic.message,
      diagnostic,
      externalId: existing?.external_id ?? null,
      accountLabel: existing?.account_label ?? null,
    };
  }

  try {
    const sites = await listSearchConsoleSites(input.accessToken);
    const override = input.siteOverride ?? getSearchConsoleSiteOverride();
    const site = chooseSearchConsoleSite(sites, { siteUrl: override });

    const compactSites = sites.slice(0, 100).map((entry) => ({
      site_url: entry.siteUrl,
      permission_level: entry.permissionLevel,
      verified: entry.permissionLevel !== 'siteUnverifiedUser',
    }));

    if (!site) {
      const code = sites.length === 0 ? 'discovery_empty' : 'resource_not_found';
      const message =
        sites.length === 0
          ? 'No Search Console sites are visible to this Google account.'
          : override
            ? `ANALYTICS_GSC_SITE_URL points to ${override}, but this Google account cannot access it.`
            : 'No Search Console property matches the configured site host.';

      const diagnostic = diagnosticFromError(
        errorFor('search_console', code, message, 'selection', GSC_READONLY_SCOPE),
        { provider: 'search_console', stage: 'selection', scope: GSC_READONLY_SCOPE }
      );

      await persistError(store, 'search_console', existing, input, diagnostic, {
        discovered_sites: compactSites,
        sites_available: sites.length,
        requested_site_url: override,
      });

      return {
        provider: 'search_console',
        status: code === 'discovery_empty' ? 'discovery_empty' : 'resource_not_found',
        code,
        message,
        diagnostic,
        externalId: existing?.external_id ?? null,
        accountLabel: existing?.account_label ?? null,
      };
    }

    await upsertConnection(store, {
      provider: 'search_console',
      status: 'connected',
      accountLabel: site.siteUrl,
      externalId: site.siteUrl,
      externalMeta: discoverySuccessMeta('search_console', existing, {
        scopes: input.scopes,
        extra: {
          site_url: site.siteUrl,
          selected_site_url: site.siteUrl,
          permission_level: site.permissionLevel,
          selection_strategy: override ? 'explicit_override' : 'host_and_permission',
          sites_available: sites.length,
          discovered_sites: compactSites,
        },
      }),
      scopes: input.scopes,
      sealed: input.sealed ?? undefined,
      connectedBy: input.connectedBy ?? existing?.connected_by ?? null,
    });

    return {
      provider: 'search_console',
      status: 'connected',
      code: null,
      message: null,
      diagnostic: null,
      externalId: site.siteUrl,
      accountLabel: site.siteUrl,
    };
  } catch (error) {
    const diagnostic = diagnosticFromError(error, {
      provider: 'search_console',
      stage: 'sites',
      scope: GSC_READONLY_SCOPE,
    });

    await persistError(store, 'search_console', existing, input, diagnostic);

    return {
      provider: 'search_console',
      status: 'error',
      code: diagnostic.code,
      message: diagnostic.message,
      diagnostic,
      externalId: existing?.external_id ?? null,
      accountLabel: existing?.account_label ?? null,
    };
  }
}

export async function runGoogleDiscovery(
  store: SupabaseClient,
  input: DiscoveryInput & { providers?: GoogleProvider[] }
): Promise<GoogleDiscoveryResult[]> {
  const providers = input.providers ?? ['google_analytics', 'search_console'];
  const results: GoogleDiscoveryResult[] = [];

  if (providers.includes('google_analytics')) {
    results.push(await runGa4Discovery(store, input));
  }

  if (providers.includes('search_console')) {
    results.push(await runSearchConsoleDiscovery(store, input));
  }

  return results;
}

type ExistingCredential = Pick<
  StoredConnection,
  'token_ciphertext' | 'token_iv' | 'token_tag' | 'token_key_version'
> | null;

/**
 * Google may omit refresh_token when the owner re-authorizes an existing
 * grant. Keep the old encrypted token in that case instead of replacing a
 * working connection with null.
 */
export function resolveGoogleRefreshCredential(input: {
  newRefreshToken: string | null | undefined;
  existing: ExistingCredential;
}): { refreshToken: string | null; sealed: SealedSecret | null } {
  if (input.newRefreshToken) {
    return {
      refreshToken: input.newRefreshToken,
      sealed: sealSecret(input.newRefreshToken),
    };
  }

  const refreshToken = openSecret({
    ciphertext: input.existing?.token_ciphertext,
    iv: input.existing?.token_iv,
    tag: input.existing?.token_tag,
  });

  if (!refreshToken) return { refreshToken: null, sealed: null };

  return {
    refreshToken,
    sealed:
      input.existing?.token_ciphertext && input.existing.token_iv && input.existing.token_tag
        ? {
            ciphertext: input.existing.token_ciphertext,
            iv: input.existing.token_iv,
            tag: input.existing.token_tag,
            keyVersion: input.existing.token_key_version || 'unknown',
          }
        : null,
  };
}
