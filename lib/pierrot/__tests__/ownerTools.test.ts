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
    expect(detectOwnerTool('Сколько реальных посетителей общалось со мной за неделю?')?.kind).toBe(
      'website'
    );
    expect(detectOwnerTool('Сколько сессий пока невозможно классифицировать?')?.kind).toBe(
      'analytics'
    );
    expect(detectOwnerTool('Какие диалоги принадлежат мне и должны быть исключены?')?.kind).toBe(
      'analytics'
    );
  });

  it('routes explicit Media catalogue and analysis requests to the Media tool', () => {
    expect(detectOwnerTool('Сделай анализ медиа за 2026 год')?.kind).toBe('media');
    expect(detectOwnerTool('Сделай анализ медиа за 2026 год')?.mediaKind).toBe('analysis');
    expect(detectOwnerTool('Поищи по базе медиа')?.kind).toBe('media');
    expect(
      detectOwnerTool('Посмотри в базу медиа какие последние записи')?.kind
    ).toBe('media');
    expect(detectOwnerTool('Сколько у меня упоминаний в прессе?')?.kind).toBe('media');
  });

  it('routes commercial performance questions to the commercial analyst', () => {
    expect(detectOwnerTool('Сколько мы заработали?')?.kind).toBe('commercial');
    expect(detectOwnerTool('Сколько продаж пришло благодаря Пьеро?')?.kind).toBe('commercial');
    expect(detectOwnerTool('Почему так мало?')?.kind).toBe('commercial');
    expect(detectOwnerTool('Сколько новых подписчиков Flow?')?.kind).toBe('commercial');
    expect(detectOwnerTool('Сколько пожертвований получил Temple?')?.kind).toBe('commercial');
    expect(detectOwnerTool('Пьеро, как у нас дела?')?.kind).toBe('commercial');
    expect(detectOwnerTool('/commercial')?.kind).toBe('commercial');
  });

  it('does not hijack ordinary questions', () => {
    expect(detectOwnerTool('Сколько стоит открытка?')).toBeNull();
    expect(detectOwnerTool('Расскажи о выставке')).toBeNull();
    expect(detectOwnerTool('Что ты думаешь о мозге?')).toBeNull();
    expect(detectOwnerTool('How do I order a postcard?')).toBeNull();
    expect(detectOwnerTool('Сколько подписчиков?')?.kind).toBe('stats');
  });

  it('does not treat biography as a graph request', () => {
    expect(detectOwnerTool('Расскажи мою биографию')).toBeNull();
    expect(detectOwnerTool('What is my biography?')).toBeNull();
    expect(detectOwnerTool('Покажи граф знаний')?.kind).toBe('graph');
  });
});
