#!/usr/bin/env node
/**
 * Safe provider-routing report.
 *
 * Prints only booleans, model identifiers and endpoint hosts. It never prints
 * an API key, token or full environment value, so it can be run in a
 * production shell or compared with Vercel's variable list.
 *
 * Usage: node scripts/ai/provider-routing-report.mjs
 */

function flag(name) {
  return Boolean((process.env[name] || '').trim());
}

function model(name, fallback) {
  return (process.env[name] || '').trim() || fallback;
}

function host(name, fallback) {
  const raw = (process.env[name] || '').trim() || fallback;
  try {
    return new URL(raw).host;
  } catch {
    return 'invalid_url';
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  web: {
    // app/api/pierrot-web -> lib/pierrot/model.ts
    order: ['gemini', 'deepseek', 'openrouter'],
    effectiveFirstProvider: flag('GEMINI_API_KEY') ? 'gemini' : 'deepseek',
    geminiConfigured: flag('GEMINI_API_KEY'),
    geminiModel: 'gemini-3.5-flash',
    deepseekConfigured: flag('DEEPSEEK_API_KEY'),
    deepseekModel: model('DEEPSEEK_MODEL', 'deepseek-chat'),
    deepseekReasoningModel: 'deepseek-reasoner',
    deepseekHost: host('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
    openrouterConfigured: flag('OPENROUTER_API_KEY'),
    openrouterModel: 'deepseek/deepseek-chat',
    openrouterReasoningModel: 'deepseek/deepseek-r1-0528',
  },
  telegram: {
    // app/api/bot/route.ts: ordinary replies
    replyProvider: 'deepseek',
    replyModel: model('DEEPSEEK_MODEL', 'deepseek-chat'),
    replyHost: host('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
    deepseekConfigured: flag('DEEPSEEK_API_KEY'),
    // app/api/bot/route.ts: deep-research command
    researchProvider: 'gemini',
    researchAgent: 'deep-research-pro-preview-12-2025',
    researchConfigured: flag('GOOGLE_KEY'),
    researchHost: 'generativelanguage.googleapis.com',
    // lib/telegram.ts channel enhancement
    channelEnhancementProvider: 'deepseek',
    channelEnhancementModel: 'deepseek-chat',
  },
  embeddings: {
    // lib/knowledge/rag/embeddings.ts
    provider: 'openrouter',
    model: model('UNFRAMED_EMBEDDING_MODEL', 'baai/bge-m3'),
    configured: flag('OPENROUTER_API_KEY'),
    pinnedProvider: (process.env.UNFRAMED_EMBEDDING_PROVIDER || '').trim() || null,
  },
  geminiPricing: {
    verifiedInputRateConfigured: flag('GEMINI_INPUT_USD_PER_MILLION'),
    verifiedOutputRateConfigured: flag('GEMINI_OUTPUT_USD_PER_MILLION'),
    verifiedCachedInputRateConfigured: flag('GEMINI_CACHED_INPUT_USD_PER_MILLION'),
    note: 'Rates are read only from an owner-supplied Google Cloud Billing value. Missing rates stay unknown.',
  },
  evaluation: {
    paidLiveRunAllowed:
      (process.env.ALLOW_PAID_AI_EVALUATION || '').trim().toLowerCase() === 'true',
  },
  telemetry: {
    serviceRoleConfigured: flag('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseUrlConfigured: flag('NEXT_PUBLIC_SUPABASE_URL') || flag('SUPABASE_URL'),
    note: 'Run SELECT count(*) FROM public.pierrot_llm_calls after applying the migration.',
  },
};

console.log(JSON.stringify(report, null, 2));
