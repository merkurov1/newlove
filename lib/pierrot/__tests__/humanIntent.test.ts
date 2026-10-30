/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { detectHumanPresenceIntent } from '../humanIntent';

describe('detectHumanPresenceIntent', () => {
  it.each([
    'Позови Антона',
    'позови, пожалуйста, антона',
    'Можно позвать Антона?',
    'Хочу поговорить с Антоном',
    'Соедини меня с Антоном',
    'Антон может подойти?',
    'Антон здесь?',
    'Антон тут?',
    'Can I speak with Anton?',
    'call Anton',
    'I want to talk to Anton',
    'is Anton available?',
    'Can Anton call me?',
    'let me talk to Anton',
    'Anton, can you join?',
  ])('recognises a request: %s', (text) => {
    expect(detectHumanPresenceIntent(text).requested).toBe(true);
  });

  it.each([
    'Расскажи про Антона',
    'Кто такой Антон?',
    'расскажи, кто такой Антон',
    'Что известно об Антоне?',
    'Хочу поговорить об Антоне',
    'не зови Антона',
    'tell me about Anton',
    'who is Anton?',
    "I want to talk about Anton's work",
    'What do you know about Anton?',
    'How much is this?',
    'Tell me about the archive.',
  ])('does not mistake a question about Anton for a request: %s', (text) => {
    expect(detectHumanPresenceIntent(text).requested).toBe(false);
  });

  it('handles empty and non-string input', () => {
    expect(detectHumanPresenceIntent('').requested).toBe(false);
    expect(detectHumanPresenceIntent('   ').requested).toBe(false);
    expect(detectHumanPresenceIntent(null as unknown as string).requested).toBe(false);
  });
});
