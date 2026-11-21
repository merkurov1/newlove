/** @jest-environment node */

import { buildProviderRoutingReport } from '../providerRouting';

describe('provider routing report', () => {
  it('reports routing and model names without exposing secret values', () => {
    const env = {
      GEMINI_API_KEY: 'super-secret-gemini',
      DEEPSEEK_API_KEY: 'super-secret-deepseek',
      OPENROUTER_API_KEY: 'super-secret-openrouter',
      GOOGLE_KEY: 'super-secret-google',
      DEEPSEEK_MODEL: 'deepseek-chat',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
      UNFRAMED_EMBEDDING_MODEL: 'baai/bge-m3',
      UNFRAMED_EMBEDDING_PROVIDER: 'deepinfra',
      GEMINI_INPUT_USD_PER_MILLION: '0.3',
      GEMINI_OUTPUT_USD_PER_MILLION: '2.5',
      ALLOW_PAID_AI_EVALUATION: 'false',
      SUPABASE_SERVICE_ROLE_KEY: 'super-secret-service-role',
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    };

    const report = buildProviderRoutingReport(env, new Date('2026-11-21T00:00:00.000Z'));

    expect(report.generatedAt).toBe('2026-11-21T00:00:00.000Z');
    expect(report.web.effectiveFirstProvider).toBe('gemini');
    expect(report.web.geminiModel).toBe('gemini-3.5-flash');
    expect(report.web.deepseekModel).toBe('deepseek-chat');
    expect(report.web.deepseekHost).toBe('api.deepseek.com');
    expect(report.web.openrouterModel).toBe('deepseek/deepseek-chat');
    expect(report.telegram.replyProvider).toBe('deepseek');
    expect(report.telegram.researchProvider).toBe('gemini');
    expect(report.embeddings.model).toBe('baai/bge-m3');
    expect(report.embeddings.pinnedProvider).toBe('deepinfra');
    expect(report.geminiPricing.verifiedInputRateConfigured).toBe(true);
    expect(report.geminiPricing.verifiedOutputRateConfigured).toBe(true);
    expect(report.evaluation.paidLiveRunAllowed).toBe(false);
    expect(report.telemetry.serviceRoleConfigured).toBe(true);

    const serialized = JSON.stringify(report);
    for (const secret of [
      'super-secret-gemini',
      'super-secret-deepseek',
      'super-secret-openrouter',
      'super-secret-google',
      'super-secret-service-role',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('does not treat a disabled Gemini key as the effective first provider', () => {
    const report = buildProviderRoutingReport({}, new Date('2026-11-21T00:00:00.000Z'));

    expect(report.web.effectiveFirstProvider).toBe('deepseek');
    expect(report.web.geminiConfigured).toBe(false);
    expect(report.embeddings.pinnedProvider).toBeNull();
  });
});
