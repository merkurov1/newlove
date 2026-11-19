/**
 * Telegram surface policy for the isolated personal assistant.
 *
 * The allowlist is intentionally tiny. Owner, Flow, human-presence, project,
 * notification, admin and callback surfaces are never reachable from this
 * profile.
 */

export const PERSONAL_ASSISTANT_ALLOWED_COMMANDS = [
  '/start',
  '/help',
  '/privacy',
  '/memory',
] as const;

export type PersonalAssistantCommand = (typeof PERSONAL_ASSISTANT_ALLOWED_COMMANDS)[number];

export function normalizeTelegramCommand(text: string): string | null {
  const first = String(text || '')
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase()
    .split('@')[0];

  return first || null;
}

export function isPersonalAssistantCommandAllowed(
  command: string | null
): command is PersonalAssistantCommand {
  return Boolean(
    command && (PERSONAL_ASSISTANT_ALLOWED_COMMANDS as readonly string[]).includes(command)
  );
}

export function personalAssistantHelpText(): string {
  return [
    'Я простой ИИ-помощник. Напишите вопрос — отвечу на русском или на том языке, на котором вы пишете.',
    '',
    'Могу искать актуальную информацию в интернете и указывать источники.',
    '',
    'Что запомнить: «Запомни, что…».',
    'Что я помню: «Что ты помнишь?».',
    'Забыть запись: «Забудь…».',
    'Отключить память: «Отключи память».',
    '',
    'О приватности: /privacy.',
  ].join('\n');
}

export function personalAssistantUnknownCommandText(): string {
  return 'Неизвестная команда. Напишите вопрос или используйте /help.';
}
