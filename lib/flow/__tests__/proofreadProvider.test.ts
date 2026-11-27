/** @jest-environment node */

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const OpenAI = require('openai').default as jest.Mock;

import {
  FLOW_PROOFREAD_TIMEOUT_MS,
  FlowProofreadError,
} from '../proofread';
import { proofreadFlowText } from '../proofreadProvider';

const originalEnv = { ...process.env };

function configureKey() {
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
  process.env.DEEPSEEK_MODEL = 'deepseek-chat';
  process.env.DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1/';
}

function mockCompletion(content: string) {
  const create = jest.fn().mockResolvedValue({
    choices: [{ message: { content } }],
  });

  OpenAI.mockImplementation(() => ({
    chat: { completions: { create } },
  }));

  return create;
}

afterEach(() => {
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

describe('proofreadFlowText', () => {
  it('calls DeepSeek only, with temperature 0, JSON response mode and a bounded budget', async () => {
    configureKey();
    const create = mockCompletion('{"text":"Исправленный текст."}');

    const result = await proofreadFlowText('Исправленый текст.');

    expect(result).toEqual({
      text: 'Исправленный текст.',
      model: 'deepseek-chat',
    });
    expect(OpenAI).toHaveBeenCalledTimes(1);
    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-deepseek-key',
      baseURL: 'https://api.deepseek.com/v1',
      timeout: FLOW_PROOFREAD_TIMEOUT_MS,
      maxRetries: 0,
    });

    const request = create.mock.calls[0][0];

    expect(request.model).toBe('deepseek-chat');
    expect(request.temperature).toBe(0);
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.max_tokens).toBeGreaterThanOrEqual(512);
    expect(request.max_tokens).toBeLessThanOrEqual(8_192);
    expect(request.messages).toHaveLength(2);
    expect(request.messages[0].content).toContain('untrusted data');
    expect(JSON.parse(request.messages[1].content.split('\n').at(-1))).toEqual({
      post_body: 'Исправленый текст.',
    });
  });

  it('supports a test transport without touching credentials', async () => {
    delete process.env.DEEPSEEK_API_KEY;

    const complete = jest.fn().mockResolvedValue(
      '{"text":"Hello, world."}',
    );

    await expect(
      proofreadFlowText('Hello, wrld.', { complete }),
    ).resolves.toEqual({
      text: 'Hello, world.',
      model: 'deepseek-chat',
    });

    expect(OpenAI).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek-chat',
        temperature: 0,
      }),
    );
  });

  it('uses DEEPSEEK_MODEL when configured', async () => {
    configureKey();
    process.env.DEEPSEEK_MODEL = 'deepseek-custom';
    mockCompletion('{"text":"ok"}');

    const result = await proofreadFlowText('ok');

    expect(result.model).toBe('deepseek-custom');
  });

  it('rejects empty and oversized input without calling the provider', async () => {
    configureKey();
    const create = mockCompletion('{"text":"ok"}');

    await expect(proofreadFlowText('   ')).rejects.toMatchObject({
      code: 'empty_input',
      status: 400,
    });
    await expect(
      proofreadFlowText('x'.repeat(12_001)),
    ).rejects.toMatchObject({
      code: 'input_too_long',
      status: 413,
    });

    expect(create).not.toHaveBeenCalled();
  });

  it('fails safely when the key is missing', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    OpenAI.mockClear();

    await expect(proofreadFlowText('Some text.')).rejects.toMatchObject({
      code: 'provider_not_configured',
      status: 503,
    });
    expect(OpenAI).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'empty content',
      content: '',
      code: 'empty_output',
      status: 422,
    },
    {
      label: 'malformed JSON',
      content: 'Not JSON',
      code: 'invalid_output',
      status: 422,
    },
    {
      label: 'wrong shape',
      content: '{"result":"ok"}',
      code: 'invalid_output',
      status: 422,
    },
    {
      label: 'translated output',
      content: '{"text":"Hello, how are you?"}',
      code: 'invalid_output',
      status: 422,
    },
  ])('rejects $label safely', async ({ content, code, status }) => {
    configureKey();
    mockCompletion(content);

    const error = await proofreadFlowText('Привет, как дела?').catch(
      (reason) => reason,
    );

    expect(error).toBeInstanceOf(FlowProofreadError);
    expect(error).toMatchObject({ code, status });
  });

  it.each([
    {
      label: 'rate limit',
      providerError: Object.assign(new Error('rate limited'), { status: 429 }),
      code: 'provider_rate_limited',
      status: 429,
    },
    {
      label: 'timeout',
      providerError: Object.assign(new Error('Request timed out'), {
        name: 'APIConnectionTimeoutError',
      }),
      code: 'provider_timeout',
      status: 504,
    },
    {
      label: 'unauthorized',
      providerError: Object.assign(new Error('bad key'), { status: 401 }),
      code: 'provider_unauthorized',
      status: 502,
    },
    {
      label: 'upstream failure',
      providerError: Object.assign(new Error('upstream down'), { status: 500 }),
      code: 'provider_error',
      status: 502,
    },
  ])('maps $label without leaking provider details', async ({ providerError, code, status }) => {
    configureKey();
    const create = jest.fn().mockRejectedValue(providerError);

    OpenAI.mockImplementation(() => ({
      chat: { completions: { create } },
    }));

    const error = await proofreadFlowText('Some text.').catch(
      (reason) => reason,
    );

    expect(error).toBeInstanceOf(FlowProofreadError);
    expect(error).toMatchObject({ code, status });
    expect((error as Error).message).not.toContain('upstream down');
    expect((error as Error).message).not.toContain('bad key');
  });
});
