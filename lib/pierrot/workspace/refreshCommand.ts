/**
 * Deterministic owner-only refresh command detection.
 *
 * Only a standalone command is intercepted. A normal question that merely
 * contains the words "обнови" or "refresh" must continue to reach Pierrot.
 */

const REFRESH_COMMANDS = new Set([
  'обнови состояние',
  'обнови сводку',
  'обнови статистику',
  'refresh status',
  'refresh overview',
]);

function normalizeCommand(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?…]+$/u, '')
    .trim()
    .toLowerCase();
}

export function isRefreshStatusCommand(value: string): boolean {
  if (typeof value !== 'string') return false;
  return REFRESH_COMMANDS.has(normalizeCommand(value));
}

export const REFRESH_STATUS_COMMANDS = Array.from(REFRESH_COMMANDS);
