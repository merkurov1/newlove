/** @jest-environment node */

import { detectOwnerTool } from '../ownerTools';

describe('Pierrot owner tool routing', () => {
  it('recognises explicit slash commands', () => {
    expect(detectOwnerTool('/stats')?.kind).toBe('stats');
    expect(detectOwnerTool('/rag')?.kind).toBe('rag');
    expect(detectOwnerTool('/brain')?.kind).toBe('brain');
    expect(detectOwnerTool('/graph')?.kind).toBe('graph');
    expect(detectOwnerTool('/research')?.kind).toBe('research');
    expect(detectOwnerTool('/diag')?.kind).toBe('diagnostics');
    expect(detectOwnerTool('/analytics')?.kind).toBe('analytics');
  });

  it('recognises natural owner requests', () => {
    expect(detectOwnerTool('Покажи статистику проекта')?.kind).toBe('stats');
    expect(detectOwnerTool('Сколько пользователей?')?.kind).toBe('stats');
    expect(detectOwnerTool('Какое состояние RAG?')?.kind).toBe('rag');
    expect(detectOwnerTool('Покажи состояние Brain')?.kind).toBe('brain');
    expect(detectOwnerTool('Что в Knowledge Graph?')?.kind).toBe('graph');
    expect(detectOwnerTool('Проведи brain research по теме')?.kind).toBe('research');
    expect(detectOwnerTool('Покажи диагностику workers')?.kind).toBe('diagnostics');
    expect(detectOwnerTool('Аналитика Pierrot за неделю')?.kind).toBe('analytics');
  });

  it('does not hijack ordinary questions', () => {
    expect(detectOwnerTool('Сколько стоит открытка?')).toBeNull();
    expect(detectOwnerTool('Расскажи о выставке')).toBeNull();
    expect(detectOwnerTool('Что ты думаешь о мозге?')).toBeNull();
  });
});
