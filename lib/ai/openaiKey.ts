/**
 * Vercel environment variable names are case-sensitive. The owner configured
 * the OpenAI credential as `openai_api_key`; earlier code only read the
 * upper-case spelling, so transcription silently degraded to "not configured".
 *
 * Read both spellings, server-side only. The value is never logged, returned to
 * a client or copied into an artifact.
 */
export function openAIApiKeyFromEnv(
  env: Partial<Record<string, string | undefined>> = process.env
): string | undefined {
  const value = env.OPENAI_API_KEY ?? env.openai_api_key;
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || undefined;
}
