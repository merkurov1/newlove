import {
  isTributeSessionId,
  parseTributeReturn,
} from '@/lib/tributes/returnFlow';

describe('Tribute checkout return contract', () => {
  it('treats a success URL as a hint with a verifiable session id', () => {
    expect(
      parseTributeReturn('?status=success&session_id=cs_test_1234567890')
    ).toEqual({ kind: 'success', sessionId: 'cs_test_1234567890' });
  });

  it('never invents a session id from a malformed return', () => {
    expect(
      parseTributeReturn('?status=success&session_id=not-a-session')
    ).toEqual({ kind: 'success', sessionId: null });
  });

  it('recognises cancellation without confirming a payment', () => {
    expect(parseTributeReturn('?status=cancel')).toEqual({
      kind: 'cancel',
      sessionId: null,
    });
  });

  it('treats a bare visit as pending recovery, not a donation', () => {
    expect(parseTributeReturn(null)).toEqual({
      kind: 'pending',
      sessionId: null,
    });
    expect(parseTributeReturn('?status=weird')).toEqual({
      kind: 'pending',
      sessionId: null,
    });
  });

  it('validates Stripe checkout session ids', () => {
    expect(isTributeSessionId('cs_test_1234567890')).toBe(true);
    expect(isTributeSessionId('pk_test_1234567890')).toBe(false);
    expect(isTributeSessionId(null)).toBe(false);
  });
});
