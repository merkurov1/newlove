/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

const { POST } = require('../route') as { POST: (request: Request) => Promise<Response> };

describe('POST /api/request-variant', () => {
  it('never reports a reservation before the flow exists', async () => {
    const response = await POST(
      new Request('http://localhost/api/request-variant', {
        method: 'POST',
        body: JSON.stringify({ wallet_address: '0xabc', variant: 'Angel' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(501);
    expect(payload).toEqual({ ok: false, error: 'variant_reservation_not_implemented' });
  });
});
