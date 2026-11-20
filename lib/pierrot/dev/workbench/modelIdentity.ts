import executorModel from '@/lib/pierrot/dev/executorModel.json';

/**
 * The executor model is a configuration contract, not a guess. The workflow,
 * the preflight, the worker and the cost ledger all read this registry (with an
 * explicit environment override). Keeping one source of truth prevents the
 * health check, the model actually invoked and cost telemetry from drifting
 * apart.
 */
export const DEV_EXECUTOR_PROVIDER = String(executorModel.provider || 'deepseek').toLowerCase();
export const DEV_EXECUTOR_MODEL = String(executorModel.model || 'deepseek/deepseek-flash');
export const DEV_EXECUTOR_MIN_OPENCODE_VERSION = String(
  executorModel.minimumOpencodeVersion || '2.1.4'
);

export type ModelIdentity = {
  provider: string | null;
  model: string | null;
};

/** Split `provider/model` without inventing a provider for a bare model id. */
export function splitModelIdentity(value: string | null | undefined): ModelIdentity {
  const text = String(value || '')
    .trim()
    .replace(/\s+/g, '');
  if (!text) return { provider: null, model: null };
  const slash = text.indexOf('/');
  if (slash <= 0 || slash === text.length - 1) {
    return { provider: null, model: text.toLowerCase() };
  }
  return {
    provider: text.slice(0, slash).toLowerCase(),
    model: text.slice(slash + 1).toLowerCase(),
  };
}

/**
 * Compare a configured identity with a provider-reported one. A bare model id
 * is accepted when a provider is known, because OpenCode may report only the
 * model name. Different model names (for example `deepseek-chat` vs
 * `deepseek-flash`) are never treated as the same model.
 */
export function sameModelIdentity(
  configured: string | null | undefined,
  reported: string | null | undefined
): boolean {
  const left = splitModelIdentity(configured);
  const right = splitModelIdentity(reported);
  if (!left.model || !right.model) return false;
  if (left.model !== right.model) return false;
  if (left.provider && right.provider && left.provider !== right.provider) return false;
  return true;
}

export type ModelIdentityVerdict = 'match' | 'mismatch' | 'unreported' | 'unconfigured';

export function compareModelIdentities(input: {
  configuredProvider?: string | null;
  configuredModel?: string | null;
  reportedProvider?: string | null;
  reportedModel?: string | null;
}): {
  verdict: ModelIdentityVerdict;
  configured: string | null;
  reported: string | null;
} {
  const configuredModel = input.configuredModel || null;
  const reportedModel = input.reportedModel || null;
  const configured = configuredModel
    ? `${input.configuredProvider || splitModelIdentity(configuredModel).provider || ''}/${
        splitModelIdentity(configuredModel).model || ''
      }`.replace(/^\//, '')
    : null;
  const reported = reportedModel
    ? `${input.reportedProvider || splitModelIdentity(reportedModel).provider || ''}/${
        splitModelIdentity(reportedModel).model || ''
      }`.replace(/^\//, '')
    : null;
  if (!configuredModel) return { verdict: 'unconfigured', configured, reported };
  if (!reportedModel) return { verdict: 'unreported', configured, reported };
  return {
    verdict: sameModelIdentity(configuredModel, reportedModel) ? 'match' : 'mismatch',
    configured,
    reported,
  };
}
