/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  PERSONAL_ASSISTANT_ALLOWED_COMMANDS,
  isPersonalAssistantCommandAllowed,
  normalizeTelegramCommand,
  personalAssistantHelpText,
} from '../telegramPolicy';

describe('personal assistant Telegram command policy', () => {
  it('allows only start, help, privacy and memory', () => {
    expect(PERSONAL_ASSISTANT_ALLOWED_COMMANDS).toEqual(['/start', '/help', '/privacy', '/memory']);

    for (const command of [
      '/flow',
      '/cancel',
      '/end',
      '/status',
      '/human',
      '/settings',
      '/delete',
    ]) {
      expect(isPersonalAssistantCommandAllowed(command)).toBe(false);
    }

    for (const command of ['/start', '/help', '/privacy', '/memory']) {
      expect(isPersonalAssistantCommandAllowed(command)).toBe(true);
    }
  });

  it('normalises bot-suffixed commands', () => {
    expect(normalizeTelegramCommand('/start@SomeBot')).toBe('/start');
    expect(normalizeTelegramCommand('  /help  ')).toBe('/help');
    expect(normalizeTelegramCommand('plain text')).toBe('plain');
    expect(normalizeTelegramCommand('')).toBeNull();
  });

  it('help reveals no owner, site, project or admin features', () => {
    const help = personalAssistantHelpText().toLowerCase();

    for (const forbidden of [
      '/flow',
      '/status',
      '/settings',
      '/human',
      '/end',
      '/delete',
      'lobby',
      'journal',
      'art engine',
      'selection',
      'heart & angel',
      'temple',
      'project',
      'admin',
      'brain',
      'anton',
    ]) {
      expect(help).not.toContain(forbidden);
    }

    expect(help).toContain('/privacy');
    expect(help).toContain('память');
  });
});
