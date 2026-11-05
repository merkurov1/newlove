import { isRefreshStatusCommand } from '../refreshCommand';

describe('refresh status command', () => {
  it('accepts the documented standalone commands', () => {
    expect(isRefreshStatusCommand('Обнови состояние')).toBe(true);
    expect(isRefreshStatusCommand('обнови сводку')).toBe(true);
    expect(isRefreshStatusCommand('  Обнови   статистику.  ')).toBe(true);
    expect(isRefreshStatusCommand('Refresh status')).toBe(true);
    expect(isRefreshStatusCommand('refresh overview!')).toBe(true);
  });

  it('does not intercept ordinary messages that mention the words', () => {
    expect(isRefreshStatusCommand('Пожалуйста, обнови состояние')).toBe(false);
    expect(isRefreshStatusCommand('Как обнови состояние памяти?')).toBe(false);
    expect(isRefreshStatusCommand('Обнови состояние и покажи Flow')).toBe(false);
    expect(isRefreshStatusCommand('refresh status please')).toBe(false);
    expect(isRefreshStatusCommand('')).toBe(false);
  });
});
