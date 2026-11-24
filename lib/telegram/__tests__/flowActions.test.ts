import { describe, expect, it } from '@jest/globals';

import { resolveTelegramStartParam } from '../miniAppRoutes';

describe('Flow deep links', () => {
  it('accepts only Flow and allowlisted Flow slugs', () => {
    expect(resolveTelegramStartParam('flow')).toBe('/flow');
    expect(resolveTelegramStartParam('flow__c3RydWN0dXJhbA')).toBe('/flow/structural');
    expect(resolveTelegramStartParam('flow__aHR0cHM6Ly9ldmlsLmV4YW1wbGU')).toBeNull();
    expect(resolveTelegramStartParam('flow__Li4vYWRtaW4')).toBeNull();
    expect(resolveTelegramStartParam('flow__L2FkbWlu')).toBeNull();
  });
});
