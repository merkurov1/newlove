import {
  isTributeTempleLogEvent,
  tributeSignalDonorName,
} from '@/lib/tributes/realtime';

describe('Tribute realtime signal', () => {
  it('accepts only TRIBUTE temple-log rows', () => {
    expect(isTributeTempleLogEvent({ event_type: 'TRIBUTE' })).toBe(true);
    expect(isTributeTempleLogEvent({ event_type: 'tribute' })).toBe(true);
    expect(isTributeTempleLogEvent({ event_type: 'VIGIL_SPARK' })).toBe(false);
    expect(isTributeTempleLogEvent({})).toBe(false);
    expect(isTributeTempleLogEvent(null)).toBe(false);
  });

  it('exposes only the donor display name and never payment data', () => {
    expect(
      tributeSignalDonorName({
        event_type: 'TRIBUTE',
        author: '  Anna  ',
        amount_cents: 5000,
        stripe_session_id: 'cs_test_secret',
      })
    ).toBe('Anna');

    expect(tributeSignalDonorName({ author: '   ' })).toBe('PILGRIM');
    expect(tributeSignalDonorName(null)).toBe('PILGRIM');
  });
});
