import { describe, expect, it } from '@jest/globals';

import { resolveFlowPrimaryAction } from '../flowActions';
import { resolveTelegramStartParam } from '../miniAppRoutes';

describe('Flow owner primary action', () => {
  const base = {
    isTelegram: true,
    isAdmin: true,
    bottomButtonAvailable: true,
    editing: false,
    composerOpen: false,
  };

  it('shows the native WRITE action only for an owner in Telegram', () => {
    expect(resolveFlowPrimaryAction(base)).toEqual({ kind: 'native-write', label: 'WRITE' });
  });

  it('never shows a publishing action to non-owners or ordinary web visitors', () => {
    expect(resolveFlowPrimaryAction({ ...base, isAdmin: false })).toEqual({
      kind: 'hidden',
      reason: 'not-owner',
    });
    expect(resolveFlowPrimaryAction({ ...base, isTelegram: false })).toEqual({
      kind: 'hidden',
      reason: 'not-telegram',
    });
  });

  it('uses an in-page fallback when the native button is unavailable', () => {
    expect(resolveFlowPrimaryAction({ ...base, bottomButtonAvailable: false })).toEqual({
      kind: 'fallback-write',
      label: 'WRITE',
    });
  });

  it('hides the action while editing or while the composer is already open', () => {
    expect(resolveFlowPrimaryAction({ ...base, editing: true })).toEqual({
      kind: 'hidden',
      reason: 'editing',
    });
    expect(resolveFlowPrimaryAction({ ...base, composerOpen: true })).toEqual({
      kind: 'hidden',
      reason: 'editing',
    });
  });
});

describe('Flow deep links', () => {
  it('accepts only Flow and allowlisted Flow slugs', () => {
    expect(resolveTelegramStartParam('flow')).toBe('/flow');
    expect(resolveTelegramStartParam('flow__c3RydWN0dXJhbA')).toBe('/flow/structural');
    expect(resolveTelegramStartParam('flow__aHR0cHM6Ly9ldmlsLmV4YW1wbGU')).toBeNull();
    expect(resolveTelegramStartParam('flow__Li4vYWRtaW4')).toBeNull();
    expect(resolveTelegramStartParam('flow__L2FkbWlu')).toBeNull();
  });
});
