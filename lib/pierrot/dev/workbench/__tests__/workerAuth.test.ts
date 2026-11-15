/** @jest-environment node */

import {
  WORKER_TOKEN_ENV,
  isWorkerAuthConfigured,
  readJsonBody,
  requireWorker,
  verifyWorkerToken,
} from '../workerAuth';

const TOKEN = 'a'.repeat(48);

describe('worker authentication', () => {
  const original = process.env[WORKER_TOKEN_ENV];

  afterEach(() => {
    if (original === undefined) delete process.env[WORKER_TOKEN_ENV];
    else process.env[WORKER_TOKEN_ENV] = original;
  });

  it('reports missing configuration instead of accepting any token', () => {
    delete process.env[WORKER_TOKEN_ENV];
    expect(isWorkerAuthConfigured()).toBe(false);
    expect(verifyWorkerToken('anything')).toBe(false);
    expect(() => requireWorker(new Request('http://localhost'))).toThrow(
      /not configured/
    );
  });

  it('rejects short tokens even if they match', () => {
    process.env[WORKER_TOKEN_ENV] = 'short';
    expect(isWorkerAuthConfigured()).toBe(false);
    expect(verifyWorkerToken('short')).toBe(false);
  });

  it('accepts only the exact token via header or bearer', () => {
    process.env[WORKER_TOKEN_ENV] = TOKEN;
    expect(verifyWorkerToken(TOKEN)).toBe(true);
    expect(verifyWorkerToken(`${TOKEN}x`)).toBe(false);

    expect(() =>
      requireWorker(
        new Request('http://localhost', {
          headers: { 'x-pierrot-worker-token': TOKEN },
        })
      )
    ).not.toThrow();

    expect(() =>
      requireWorker(
        new Request('http://localhost', {
          headers: { authorization: `Bearer ${TOKEN}` },
        })
      )
    ).not.toThrow();

    expect(() =>
      requireWorker(
        new Request('http://localhost', {
          headers: { authorization: 'Bearer wrong' },
        })
      )
    ).toThrow(/authentication failed/i);
  });
});

describe('worker body limits', () => {
  it('rejects oversized bodies before JSON parsing', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(2000) }),
    });
    await expect(readJsonBody(request, 100)).rejects.toThrow(/too large/i);
  });

  it('rejects non-object JSON', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify(['not', 'an', 'object']),
    });
    await expect(readJsonBody(request, 1000)).rejects.toThrow(/Invalid JSON/i);
  });
});
