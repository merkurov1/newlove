/**
 * Facebook Page configuration shared by the publishing adapter and OAuth flow.
 *
 * Environment credentials remain supported as a legacy fallback. The admin
 * OAuth flow stores its Page token encrypted in the database and takes
 * precedence over `META_FACEBOOK_PAGE_ACCESS_TOKEN`, so reconnecting a Page
 * does not require editing environment variables or redeploying.
 */

import { readString } from './http';

export const DEFAULT_FACEBOOK_GRAPH_VERSION = 'v26.0';

export type FacebookConfig = {
  pageId: string | null;
  accessToken: string | null;
  version: string;
  configured: boolean;
};

export function normalizeFacebookGraphVersion(value: string | undefined): string {
  const version = (value ?? '').trim();

  if (!version) return DEFAULT_FACEBOOK_GRAPH_VERSION;

  return /^v\d+\.\d+$/.test(version) ? version : DEFAULT_FACEBOOK_GRAPH_VERSION;
}

export function readFacebookEnvConfig(
  env: Record<string, string | undefined> = process.env
): FacebookConfig {
  const pageId = readString(env.META_FACEBOOK_PAGE_ID);
  const accessToken = readString(env.META_FACEBOOK_PAGE_ACCESS_TOKEN);
  const version = normalizeFacebookGraphVersion(env.META_GRAPH_API_VERSION);

  return {
    pageId,
    accessToken,
    version,
    configured: Boolean(pageId && accessToken),
  };
}
