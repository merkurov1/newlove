/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  TELEGRAM_RESEARCH_FORBIDDEN_PATH,
  TELEGRAM_RESEARCH_LOGIN_PATH,
  telegramResearchAccessDecision,
  telegramResearchAccessRedirect,
} from '../access';

describe('Telegram Research access policy', () => {
  it('sends unauthenticated visitors to the existing login page', () => {
    expect(telegramResearchAccessDecision(null)).toBe('login');
    expect(telegramResearchAccessRedirect(null)).toBe(TELEGRAM_RESEARCH_LOGIN_PATH);
    expect(TELEGRAM_RESEARCH_LOGIN_PATH).toBe('/login?next=%2Fresearch%2Ftelegram');
  });

  it('denies an authenticated ordinary user', () => {
    expect(telegramResearchAccessDecision({ role: 'USER' })).toBe('forbidden');
    expect(telegramResearchAccessRedirect({ role: 'USER' })).toBe(
      TELEGRAM_RESEARCH_FORBIDDEN_PATH
    );
  });

  it('allows the owner-level ADMIN role', () => {
    expect(telegramResearchAccessDecision({ role: 'ADMIN' })).toBe('allow');
    expect(telegramResearchAccessRedirect({ role: 'ADMIN' })).toBeNull();
  });

  it('does not treat an empty or unknown role as admin', () => {
    expect(telegramResearchAccessDecision({ role: '' })).toBe('forbidden');
    expect(telegramResearchAccessDecision({ role: 'admin' })).toBe('forbidden');
    expect(telegramResearchAccessDecision({ role: null })).toBe('forbidden');
  });
});
