import { describe, expect, it } from '@jest/globals';

import {
  buildTelegramStartParam,
  readTelegramStartParamFromUrl,
  resolveTelegramStartParam,
} from '../miniAppRoutes';

describe('Telegram Mini App deep links', () => {
  it('resolves only allowlisted first-party routes', () => {
    expect(resolveTelegramStartParam('lobby')).toBe('/lobby');
    expect(resolveTelegramStartParam('flow')).toBe('/flow');
    expect(resolveTelegramStartParam('journal')).toBe('/journal');
    expect(resolveTelegramStartParam('temple')).toBe('/temple');
    expect(resolveTelegramStartParam('selection')).toBe('/selection');
    expect(resolveTelegramStartParam('art')).toBe('/art-engine');
    expect(resolveTelegramStartParam('vigil')).toBe('/vigil');
    expect(resolveTelegramStartParam('cast')).toBe('/cast');
    expect(resolveTelegramStartParam('absolution')).toBe('/absolution');
    expect(resolveTelegramStartParam('admin')).toBeNull();
    expect(resolveTelegramStartParam('https://evil.example')).toBeNull();
    expect(resolveTelegramStartParam('//evil.example')).toBeNull();
  });

  it('round-trips ritual destinations through the typed allowlist', () => {
    for (const path of ['/vigil', '/cast', '/absolution', '/tribute']) {
      const param = buildTelegramStartParam(path);

      expect(param).toBeTruthy();
      expect(resolveTelegramStartParam(param)).toBe(path);
    }
  });

  it('falls back safely for malformed or unknown startapp payloads', () => {
    for (const payload of [
      null,
      undefined,
      123,
      '',
      '   ',
      'admin',
      'flow__not-valid-base64!!',
      'flow_',
      '../../etc/passwd',
      'a'.repeat(600),
    ]) {
      expect(resolveTelegramStartParam(payload)).toBeNull();
    }
  });

  it('round-trips a concrete published Flow slug', () => {
    const param = buildTelegramStartParam('/flow/structural-integrity');
    expect(param).toBe(`flow__${Buffer.from('structural-integrity').toString('base64url')}`);
    expect(resolveTelegramStartParam(param)).toBe('/flow/structural-integrity');
  });

  it('rejects unsafe Flow slugs and paths', () => {
    expect(resolveTelegramStartParam('flow__../admin')).toBeNull();
    expect(resolveTelegramStartParam('flow_..%2Fadmin')).toBeNull();
    expect(buildTelegramStartParam('/admin')).toBeNull();
    expect(buildTelegramStartParam('https://evil.example')).toBeNull();
    expect(buildTelegramStartParam('/flow/a/b')).toBeNull();
  });

  it('reads the start parameter from the documented URL fallback', () => {
    const param = buildTelegramStartParam('/flow/structural-integrity');

    expect(
      readTelegramStartParamFromUrl(`https://www.merkurov.love/lobby?tgWebAppStartParam=${param}`)
    ).toBe(param);
    expect(
      readTelegramStartParamFromUrl(
        `https://www.merkurov.love/lobby#tgWebAppData=signed&tgWebAppStartParam=${param}`
      )
    ).toBe(param);
    expect(readTelegramStartParamFromUrl('https://www.merkurov.love/lobby')).toBeNull();
    expect(readTelegramStartParamFromUrl('not a url')).toBeNull();
  });
});
