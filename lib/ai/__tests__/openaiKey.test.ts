import { openAIApiKeyFromEnv } from '../openaiKey';

describe('openAIApiKeyFromEnv', () => {
  it('accepts the upper-case spelling used by older deployments', () => {
    expect(openAIApiKeyFromEnv({ OPENAI_API_KEY: ' upper ' })).toBe('upper');
  });

  it('accepts the lower-case spelling configured in Vercel', () => {
    expect(openAIApiKeyFromEnv({ openai_api_key: ' lower ' })).toBe('lower');
  });

  it('prefers the upper-case value when both exist', () => {
    expect(
      openAIApiKeyFromEnv({ OPENAI_API_KEY: 'upper', openai_api_key: 'lower' })
    ).toBe('upper');
  });

  it('treats blank values as not configured', () => {
    expect(openAIApiKeyFromEnv({})).toBeUndefined();
    expect(openAIApiKeyFromEnv({ OPENAI_API_KEY: '   ', openai_api_key: '' })).toBeUndefined();
  });
});
