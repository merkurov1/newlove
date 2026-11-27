/** @jest-environment node */

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
}));

jest.mock('@/lib/flow/proofreadProvider', () => ({
  proofreadFlowText: jest.fn(),
}));

import { NextResponse } from 'next/server';

import { FLOW_PROOFREAD_MAX_INPUT_CHARS, FlowProofreadError } from '@/lib/flow/proofread';

const { POST } = require('../route') as {
  POST: (req: Request) => Promise<Response>;
};

const { requireAdminFromRequest } = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};
const { checkRateLimit } = require('@/lib/rateLimit') as {
  checkRateLimit: jest.Mock;
};
const { proofreadFlowText } = require('@/lib/flow/proofreadProvider') as {
  proofreadFlowText: jest.Mock;
};

function jsonRequest(
  body: unknown,
  options: { headers?: Record<string, string>; raw?: boolean } = {},
): Request {
  return new Request('https://www.merkurov.love/api/flow/proofread', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
    body:
      options.raw && typeof body === 'string'
        ? body
        : JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminFromRequest.mockResolvedValue({
    id: 'owner-1',
    role: 'ADMIN',
  });
  checkRateLimit.mockReturnValue(null);
});

describe('POST /api/flow/proofread', () => {
  it('returns the proofread text for an authenticated owner', async () => {
    proofreadFlowText.mockResolvedValue({
      text: 'Исправленный текст.',
      model: 'deepseek-chat',
    });

    const response = await POST(jsonRequest({ text: 'Исправленый текст.' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(requireAdminFromRequest).toHaveBeenCalledTimes(1);
    expect(proofreadFlowText).toHaveBeenCalledWith('Исправленый текст.');
    expect(json).toEqual({
      text: 'Исправленный текст.',
      unchanged: false,
    });
  });

  it('reports an unchanged result and uses only the owner id for rate limiting', async () => {
    proofreadFlowText.mockResolvedValue({
      text: 'Исправленный текст.',
      model: 'deepseek-chat',
    });

    const response = await POST(jsonRequest({ text: 'Исправленный текст.' }));

    expect(await response.json()).toEqual({
      text: 'Исправленный текст.',
      unchanged: true,
    });
    expect(checkRateLimit).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({
        interval: 60_000,
        maxRequests: 10,
        keyPrefix: 'flow-proofread',
      }),
    );
  });

  it('rejects unauthenticated requests before reading the payload', async () => {
    requireAdminFromRequest.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await POST(jsonRequest({ text: 'Secret draft text.' }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('unauthorized');
    expect(proofreadFlowText).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'wrong content type',
      build: () =>
        jsonRequest({ text: 'Hello' }, { headers: { 'content-type': 'text/plain' } }),
      status: 415,
      error: 'unsupported_media_type',
    },
    {
      label: 'invalid JSON',
      build: () => jsonRequest('{broken', { raw: true }),
      status: 400,
      error: 'invalid_json',
    },
    {
      label: 'array payload',
      build: () => jsonRequest([{ text: 'Hello' }]),
      status: 400,
      error: 'invalid_payload',
    },
    {
      label: 'missing text',
      build: () => jsonRequest({ body: 'Hello' }),
      status: 400,
      error: 'invalid_payload',
    },
    {
      label: 'non-string text',
      build: () => jsonRequest({ text: 42 }),
      status: 400,
      error: 'invalid_payload',
    },
    {
      label: 'empty text',
      build: () => jsonRequest({ text: '   \n  ' }),
      status: 400,
      error: 'empty_input',
    },
    {
      label: 'oversized input',
      build: () =>
        jsonRequest({ text: 'x'.repeat(FLOW_PROOFREAD_MAX_INPUT_CHARS + 1) }),
      status: 413,
      error: 'input_too_long',
    },
  ])('rejects $label without calling DeepSeek', async ({ build, status, error }) => {
    const response = await POST(build());

    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(error);
    expect(proofreadFlowText).not.toHaveBeenCalled();
  });

  it('returns the rate limiter response and does not call DeepSeek', async () => {
    checkRateLimit.mockReturnValueOnce(
      NextResponse.json(
        { error: 'Too many requests', retryAfter: 30 },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
    );

    const response = await POST(jsonRequest({ text: 'Some text.' }));

    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe('Too many requests');
    expect(proofreadFlowText).not.toHaveBeenCalled();
  });

  it.each([
    {
      code: 'provider_timeout',
      status: 504,
    },
    {
      code: 'provider_rate_limited',
      status: 429,
    },
    {
      code: 'provider_error',
      status: 502,
    },
    {
      code: 'empty_output',
      status: 422,
    },
    {
      code: 'invalid_output',
      status: 422,
    },
  ] as const)('maps $code to HTTP $status with a machine-readable error', async ({ code, status }) => {
    proofreadFlowText.mockRejectedValueOnce(new FlowProofreadError(code));

    const response = await POST(jsonRequest({ text: 'Private draft text.' }));
    const json = await response.json();

    expect(response.status).toBe(status);
    expect(json.error).toBe(code);
    expect(json.message).toEqual(expect.any(String));
    expect(JSON.stringify(json)).not.toContain('Private draft text');
    expect(JSON.stringify(json)).not.toContain('DEEPSEEK');
  });

  it('does not leak the draft or provider details on an unexpected failure', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    proofreadFlowText.mockRejectedValueOnce(
      new Error('provider body containing Private draft text'),
    );

    try {
      const response = await POST(jsonRequest({ text: 'Private draft text.' }));
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toBe('internal_error');
      expect(JSON.stringify(json)).not.toContain('Private draft text');
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    }
  });
});
