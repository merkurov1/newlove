/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { detectAssistantLanguage } from '../language';
import { parsePersonalAssistantMemoryCommand } from '../memoryCommands';

describe('personal assistant multilingual language hint', () => {
  it('detects Russian, English, Spanish, French and German', () => {
    expect(detectAssistantLanguage('Здравствуйте, как дела?')).toBe('ru');
    expect(detectAssistantLanguage('What is the latest news today?')).toBe('en');
    expect(detectAssistantLanguage('¿Qué recuerdas de la memoria de hoy?')).toBe('es');
    expect(detectAssistantLanguage('Qu’est-ce que tu te souviens de la mémoire ?')).toBe('fr');
    expect(detectAssistantLanguage('Was erinnerst du dich im Gedächtnis?')).toBe('de');
  });

  it('does not restrict the model to ru/en', () => {
    // The detector may fall back for scripts it does not know, but it must not
    // claim that a non-ru/en language is unsupported.
    expect(detectAssistantLanguage('مرحبا كيف حالك')).toBe('en');
  });
});

describe('personal assistant memory commands', () => {
  it('parses remember, update, forget, disable, enable, list and privacy in multiple languages', () => {
    expect(parsePersonalAssistantMemoryCommand('Запомни, что я люблю сирень')).toEqual({
      kind: 'remember',
      content: 'я люблю сирень',
    });
    expect(parsePersonalAssistantMemoryCommand('Remember that I prefer morning calls')).toEqual({
      kind: 'remember',
      content: 'I prefer morning calls',
    });
    expect(parsePersonalAssistantMemoryCommand('Recuerda que vivo en Madrid')).toEqual({
      kind: 'remember',
      content: 'vivo en Madrid',
    });
    expect(parsePersonalAssistantMemoryCommand('Merke dir, dass ich Tee mag')).toEqual({
      kind: 'remember',
      content: 'ich Tee mag',
    });
    expect(parsePersonalAssistantMemoryCommand('Souviens-toi que j’aime Paris')).toEqual({
      kind: 'remember',
      content: 'j’aime Paris',
    });

    expect(parsePersonalAssistantMemoryCommand('Обнови память: я люблю пионы')).toEqual({
      kind: 'update',
      content: 'я люблю пионы',
    });
    expect(parsePersonalAssistantMemoryCommand('Forget the phone number')).toEqual({
      kind: 'forget',
      query: 'the phone number',
    });
    expect(parsePersonalAssistantMemoryCommand('Забудь это')).toEqual({
      kind: 'forget',
      query: null,
    });

    expect(parsePersonalAssistantMemoryCommand('Отключи память')).toEqual({ kind: 'disable' });
    expect(parsePersonalAssistantMemoryCommand('Enable memory')).toEqual({ kind: 'enable' });
    expect(parsePersonalAssistantMemoryCommand('Что ты помнишь?')).toEqual({ kind: 'list' });
    expect(parsePersonalAssistantMemoryCommand('What do you remember?')).toEqual({ kind: 'list' });
    expect(parsePersonalAssistantMemoryCommand('Приватность')).toEqual({ kind: 'privacy' });
  });

  it('does not treat an ordinary question as a memory mutation', () => {
    expect(parsePersonalAssistantMemoryCommand('Расскажи, что такое память человека')).toBeNull();
    expect(parsePersonalAssistantMemoryCommand('Tell me a joke about memory')).toBeNull();
    expect(parsePersonalAssistantMemoryCommand('What is the weather today?')).toBeNull();
  });
});
