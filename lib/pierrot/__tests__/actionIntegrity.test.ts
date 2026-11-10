/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  configurationWriteRefusal,
  detectConfigurationWriteRequest,
  detectConfigurationWriteRequestWithContext,
  guardUnverifiedActionClaims,
  recoverArtEngineAction,
} from '../actionIntegrity';

const gaValues = [
  'Account ID: 176791840',
  'Property ID: 244838264',
  'Measurement ID: G-J1F4ZTK9ND',
].join('\n');

describe('Pierrot action integrity', () => {
  it('detects a GA4 configuration write request with real IDs', () => {
    const request = detectConfigurationWriteRequest(`Вставь сам:\n${gaValues}`);

    expect(request).not.toBeNull();
    expect(request?.status).toBe('unsupported');
    expect(request?.writeToolAvailable).toBe(false);
    expect(request?.values.accountId).toBe('176791840');
    expect(request?.values.propertyId).toBe('244838264');
    expect(request?.values.measurementId).toBe('G-J1F4ZTK9ND');
  });

  it('recovers “вставь сам” when the IDs were supplied in the previous turn', () => {
    const request = detectConfigurationWriteRequestWithContext('Вставь сам', [
      { role: 'user', content: gaValues },
    ]);

    expect(request?.kind).toBe('analytics_configuration');
    expect(request?.values.measurementId).toBe('G-J1F4ZTK9ND');
  });

  it('does not treat a read-only status question as a write request', () => {
    expect(
      detectConfigurationWriteRequest('Покажи статус подключения Google Analytics')
    ).toBeNull();
  });

  it('refuses to claim a configuration write when no write tool exists', () => {
    const request = detectConfigurationWriteRequest(`Вставь сам:\n${gaValues}`)!;
    const text = configurationWriteRefusal(request, 'ru');

    expect(text).toContain('Я не изменял конфигурацию');
    expect(text).toContain('не значит применить');
    expect(text).toContain('Ничего не записано');
    expect(text).toContain('read-only');
  });

  it.each([
    'Обновил конфигурацию Google Analytics.',
    'Я изменил настройки и подключил Measurement ID.',
    'I updated the analytics configuration.',
    'Committed and pushed the repository change.',
    'Готово. Конфигурация обновлена.',
    'The analytics configuration has been updated.',
  ])('blocks an unverified write confirmation: %s', (reply) => {
    const guarded = guardUnverifiedActionClaims({
      reply,
      verifiedWrite: false,
      request: 'Вставь сам Account ID 176791840',
      language: 'ru',
    });

    expect(guarded.blocked).toBe(true);
    expect(guarded.reply).toContain('не выполнял');
    expect(guarded.reply).not.toContain('Обновил конфигурацию');
  });

  it('leaves a verified write confirmation alone', () => {
    const guarded = guardUnverifiedActionClaims({
      reply: 'Обновил конфигурацию после успешной записи.',
      verifiedWrite: true,
      request: 'Вставь сам Account ID 176791840',
      language: 'ru',
    });

    expect(guarded.blocked).toBe(false);
    expect(guarded.reply).toContain('Обновил конфигурацию');
  });

  it('recovers an ignored Art Engine command after a correction', () => {
    const recovered = recoverArtEngineAction(
      'Еще раз сделай то, что тебя просят',
      [{ role: 'user', content: 'Включи art engine' }],
      'ru'
    );

    expect(recovered?.kind).toBe('art_engine_enter');
    expect(recovered?.clientAction.type).toBe('enter_art_engine');
    expect(recovered?.text).toContain('Art Engine');
    expect(recovered?.text).toContain('клиентский режим');
  });

  it('does not recover Art Engine for an unrelated correction', () => {
    expect(
      recoverArtEngineAction('Еще раз посмотри в базу медиа', [
        { role: 'user', content: 'Сделай анализ медиа за 2026 год' },
      ], 'ru')
    ).toBeNull();
  });
});
