/**
 * Safe provider-routing snapshot for admin diagnostics.
 *
 * Only booleans, model identifiers and endpoint hosts are returned. API keys,
 * tokens and full environment values never leave this function.
 */

type Env = Record<string, string | undefined>;

function flag(env: Env, name: string): boolean {
  return Boolean((env[name] || '').trim());
}

function model(env: Env, name: string, fallback: string): string {
  return (env[name] || '').trim() || fallback;
}

function host(env: Env, name: string, fallback: string): string {
  const raw = (env[name] || '').trim() || fallback;
  try {
    return new URL(raw).host;
  } catch {
    return 'invalid_url';
  }
}

export type ProviderRoutingReport = {
  generatedAt: string;
  web: {
    order: ['gemini', 'deepseek', 'openrouter'];
    effectiveFirstProvider: 'gemini' | 'deepseek';
    geminiConfigured: boolean;
    geminiModel: string;
    deepseekConfigured: boolean;
    deepseekModel: string;
    deepseekReasoningModel: string;
    deepseekHost: string;
    openrouterConfigured: boolean;
    openrouterModel: string;
    openrouterReasoningModel: string;
  };
  telegram: {
    replyProvider: 'deepseek';
    replyModel: string;
    replyHost: string;
    deepseekConfigured: boolean;
    researchProvider: 'gemini';
    researchAgent: string;
    researchConfigured: boolean;
    researchHost: string;
    channelEnhancementProvider: 'deepseek';
    channelEnhancementModel: string;
  };
  embeddings: {
    provider: 'openrouter';
    model: string;
    configured: boolean;
    pinnedProvider: string | null;
  };
  geminiPricing: {
    verifiedInputRateConfigured: boolean;
    verifiedOutputRateConfigured: boolean;
    verifiedCachedInputRateConfigured: boolean;
  };
  evaluation: {
    paidLiveRunAllowed: boolean;
  };
  telemetry: {
    serviceRoleConfigured: boolean;
    supabaseUrlConfigured: boolean;
  };
};

export function buildProviderRoutingReport(
  env: Env = process.env,
  now: Date = new Date()
): ProviderRoutingReport {
  const geminiConfigured = flag(env, 'GEMINI_API_KEY');

  return {
    generatedAt: now.toISOString(),
    web: {
      order: ['gemini', 'deepseek', 'openrouter'],
      effectiveFirstProvider: geminiConfigured ? 'gemini' : 'deepseek',
      geminiConfigured,
      geminiModel: 'gemini-3.5-flash',
      deepseekConfigured: flag(env, 'DEEPSEEK_API_KEY'),
      deepseekModel: model(env, 'DEEPSEEK_MODEL', 'deepseek-chat'),
      deepseekReasoningModel: 'deepseek-reasoner',
      deepseekHost: host(env, 'DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
      openrouterConfigured: flag(env, 'OPENROUTER_API_KEY'),
      openrouterModel: 'deepseek/deepseek-chat',
      openrouterReasoningModel: 'deepseek/deepseek-r1-0528',
    },
    telegram: {
      replyProvider: 'deepseek',
      replyModel: model(env, 'DEEPSEEK_MODEL', 'deepseek-chat'),
      replyHost: host(env, 'DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
      deepseekConfigured: flag(env, 'DEEPSEEK_API_KEY'),
      researchProvider: 'gemini',
      researchAgent: 'deep-research-pro-preview-12-2025',
      researchConfigured: flag(env, 'GOOGLE_KEY'),
      researchHost: 'generativelanguage.googleapis.com',
      channelEnhancementProvider: 'deepseek',
      channelEnhancementModel: 'deepseek-chat',
    },
    embeddings: {
      provider: 'openrouter',
      model: model(env, 'UNFRAMED_EMBEDDING_MODEL', 'baai/bge-m3'),
      configured: flag(env, 'OPENROUTER_API_KEY'),
      pinnedProvider: (env.UNFRAMED_EMBEDDING_PROVIDER || '').trim() || null,
    },
    geminiPricing: {
      verifiedInputRateConfigured: flag(env, 'GEMINI_INPUT_USD_PER_MILLION'),
      verifiedOutputRateConfigured: flag(env, 'GEMINI_OUTPUT_USD_PER_MILLION'),
      verifiedCachedInputRateConfigured: flag(env, 'GEMINI_CACHED_INPUT_USD_PER_MILLION'),
    },
    evaluation: {
      paidLiveRunAllowed:
        (env.ALLOW_PAID_AI_EVALUATION || '').trim().toLowerCase() === 'true',
    },
    telemetry: {
      serviceRoleConfigured: flag(env, 'SUPABASE_SERVICE_ROLE_KEY'),
      supabaseUrlConfigured:
        flag(env, 'NEXT_PUBLIC_SUPABASE_URL') || flag(env, 'SUPABASE_URL'),
    },
  };
}
