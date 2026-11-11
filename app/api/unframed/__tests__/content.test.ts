/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UNFRAMED_EXPECTED_SHA256 } from '@/lib/knowledge/unframed';

const MANUSCRIPT = readFileSync(path.join(process.cwd(), 'app/unframed/Unframed.markdown'), 'utf8');

const mockReadFile = jest.fn();
const mockVerify = jest.fn();

jest.mock('fs/promises', () => ({
  __esModule: true,
  default: { readFile: mockReadFile },
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({
    get: (name: string) => ({ value: name }),
  })),
}));

jest.mock('@/lib/unframed/access', () => ({
  verifyUnframedToken: (...args: unknown[]) => mockVerify(...args),
}));

const { GET } = require('../content/route') as {
  GET: () => Promise<Response>;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue(true);
  mockReadFile.mockResolvedValue(MANUSCRIPT);
});

describe('GET /api/unframed/content', () => {
  it('serves the canonical manuscript with its version hash', async () => {
    const response = await GET();
    const body = (await response.json()) as { content: string; version: string };

    expect(response.status).toBe(200);
    expect(body.content).toBe(MANUSCRIPT);
    expect(body.version).toBe(UNFRAMED_EXPECTED_SHA256);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('requires a valid access or admin token', async () => {
    mockVerify.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('refuses to serve a manuscript whose hash does not match the expected source', async () => {
    mockReadFile.mockResolvedValue('# tampered manuscript');

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Manuscript integrity check failed',
    });
  });

  it('returns a clear 404 when the manuscript file is missing', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const response = await GET();

    expect(response.status).toBe(404);
  });
});
