/** @jest-environment jsdom */

import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  getPierrotConsent,
  getPierrotSessionId,
  getPierrotVisitorId,
  rotatePierrotVisitorId,
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

describe('Pierrot visitor pseudonym', () => {
  it('does not create a visitor id without granted consent', () => {
    expect(getPierrotVisitorId()).toBeNull();
    setPierrotConsent('denied');
    expect(getPierrotVisitorId()).toBeNull();
  });

  it('keeps one visitor id across sessions but separates sessions', () => {
    setPierrotConsent('granted');
    const visitor = getPierrotVisitorId();
    const firstSession = getPierrotSessionId();

    window.sessionStorage.clear();
    const secondSession = getPierrotSessionId();

    expect(visitor).toBeTruthy();
    expect(getPierrotVisitorId()).toBe(visitor);
    expect(secondSession).not.toBe(firstSession);
  });

  it('creates a different visitor after storage is cleared or rotated', () => {
    setPierrotConsent('granted');
    const first = getPierrotVisitorId();

    window.localStorage.clear();
    setPierrotConsent('granted');
    const second = getPierrotVisitorId();

    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    const rotated = rotatePierrotVisitorId();
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(second);
  });
});
