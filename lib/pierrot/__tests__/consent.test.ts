/** @jest-environment jsdom */

import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  getPierrotConsent,
  setPierrotConsent,
} from '../clientTelemetry';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Pierrot transcript consent', () => {
  it('treats no stored choice as pending, not as consent', () => {
    expect(getPierrotConsent().state).toBe('pending');
  });

  it('persists an explicit grant and revoke', () => {
    expect(setPierrotConsent('granted').state).toBe('granted');
    expect(getPierrotConsent().state).toBe('granted');

    expect(setPierrotConsent('denied').state).toBe('denied');
    expect(getPierrotConsent().state).toBe('denied');
  });

  it('keeps pending as pending', () => {
    expect(setPierrotConsent('pending').state).toBe('pending');
    expect(getPierrotConsent().state).toBe('pending');
  });
});
