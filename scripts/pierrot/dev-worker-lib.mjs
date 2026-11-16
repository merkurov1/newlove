/**
 * Pure helpers for the Pierrot Dev worker. Kept separate from the worker entry
 * point so readiness, version comparison and OpenCode cost parsing can be
 * tested without starting the polling loop.
 */

export function parseVersion(value) {
  const match = String(value || '').match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isVersionAtLeast(actual, minimum) {
  const a = parseVersion(actual);
  const b = parseVersion(minimum);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return true;
}

export function providerFromModel(model) {
  const value = String(model || '').trim();
  if (!value || !value.includes('/')) return null;
  return value.split('/')[0].trim().toLowerCase() || null;
}

/**
 * OpenCode `--format json` emits step_finish events with the provider-reported
 * cost and token counts. Only those events are trusted as actual usage.
 */
export function parseOpenCodeCost(output) {
  const result = {
    provider: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    costUsd: null,
    steps: 0,
    provenance: 'unavailable:opencode-did-not-report-cost',
  };
  const text = String(output || '');
  if (!text) return result;

  let costSum = 0;
  let costSeen = false;
  let tokensSeen = false;
  const add = (current, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return current;
    return (current ?? 0) + value;
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const type = String(event?.type || '').toLowerCase().replace(/-/g, '_');
    if (type !== 'step_finish') continue;
    const part = event.part && typeof event.part === 'object' ? event.part : event;
    result.steps += 1;

    if (typeof part.cost === 'number' && Number.isFinite(part.cost)) {
      costSeen = true;
      costSum += part.cost;
    }
    const tokens = part.tokens && typeof part.tokens === 'object' ? part.tokens : null;
    if (tokens) {
      tokensSeen = true;
      result.inputTokens = add(result.inputTokens, tokens.input);
      result.outputTokens = add(result.outputTokens, tokens.output);
      result.reasoningTokens = add(result.reasoningTokens, tokens.reasoning);
      if (tokens.cache && typeof tokens.cache === 'object') {
        result.cacheReadTokens = add(result.cacheReadTokens, tokens.cache.read);
        result.cacheWriteTokens = add(result.cacheWriteTokens, tokens.cache.write);
      }
    }
    if (!result.provider) {
      const provider =
        part.providerID || part.providerId || part.provider || event.providerID || event.provider;
      if (typeof provider === 'string' && provider.trim()) {
        result.provider = provider.trim().slice(0, 80);
      }
    }
    if (!result.model) {
      const model = part.modelID || part.modelId || part.model || event.modelID || event.model;
      if (typeof model === 'string' && model.trim()) {
        result.model = model.trim().slice(0, 120);
      }
    }
  }

  if (costSeen) {
    result.costUsd = Math.round(costSum * 1e9) / 1e9;
    result.provenance = 'opencode-step-finish';
  } else if (tokensSeen) {
    result.provenance = 'unavailable:opencode-did-not-report-cost';
  }
  return result;
}

/**
 * Parse `opencode auth list`. Environment credentials are intentionally not
 * accepted: the worker requires a stored login so no provider secret has to be
 * forwarded through the process environment.
 */
export function parseStoredAuth(output, expectedProvider) {
  const text = String(output || '');
  const providers = [];
  for (const line of text.split('\n')) {
    if (!/\bstored\b/i.test(line)) continue;
    const name = line.trim().split(/\s+/)[0];
    if (name) providers.push(name.toLowerCase());
  }
  const wanted = String(expectedProvider || '').trim().toLowerCase();
  const matched = wanted
    ? providers.some((provider) => provider.includes(wanted) || wanted.includes(provider))
    : providers.length > 0;
  return {
    authenticated: matched,
    providers,
  };
}

export function computeReadiness(input) {
  const minimumVersion = String(input.minimumVersion || '2.1.4');
  const versionOk = Boolean(
    input.opencodeAvailable && isVersionAtLeast(input.opencodeVersion, minimumVersion)
  );
  const opencodeOk = Boolean(input.opencodeAvailable && versionOk);
  const authOk = input.authenticated === true;
  const reasons = [];
  if (!input.configOk) reasons.push('Worker configuration is incomplete.');
  if (!input.apiOk) reasons.push('Pierrot worker API is unreachable.');
  if (!input.supabaseOk) reasons.push('Supabase is unreachable through the worker API.');
  if (!input.opencodeAvailable) reasons.push('OpenCode CLI is missing.');
  else if (!versionOk) {
    reasons.push(
      `OpenCode ${input.opencodeVersion || 'unknown'} is older than the required ${minimumVersion}.`
    );
  }
  if (!authOk) {
    reasons.push(
      `No stored ${input.provider || 'provider'} authentication was found (run opencode auth login).`
    );
  }
  return {
    ready: reasons.length === 0,
    configOk: Boolean(input.configOk),
    apiOk: Boolean(input.apiOk),
    supabaseOk: Boolean(input.supabaseOk),
    opencodeOk,
    versionOk,
    authOk,
    minimumVersion,
    provider: input.provider || null,
    reasons,
    checkedAt: new Date().toISOString(),
  };
}
