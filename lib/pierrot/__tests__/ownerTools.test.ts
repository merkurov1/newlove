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
    expect(detectOwnerTool('/youtube')?.kind).toBe('youtube');
    expect(detectOwnerTool('/yt')?.kind).toBe('youtube');
  });

  it('routes the same shared-channel analytics question from both projects', () => {
    expect(detectOwnerTool('Pierrot: статистика YouTube-канала за 30 дней')?.kind).toBe(
      'youtube'
    );
    expect(detectOwnerTool('UNFRAMED: статистика YouTube-канала за 30 дней')?.kind).toBe(
      'youtube'
    );
    expect(
      detectOwnerTool('Сравни ролики The Spectral Tiger и Step Out of the Physical Container')?.kind
    ).toBe('youtube');
    expect(detectOwnerTool('Откуда трафик на YouTube за неделю?')?.kind).toBe('youtube');
  });

  it('does not treat a bare YouTube URL as YouTube analytics intake', () => {
    // The URL-intake branch runs before owner tools, so this must not become a
    // YouTube analytics request. It may still be classified by other detectors.
    expect(detectOwnerTool('https://youtu.be/TmC6Lr5K4R8')?.kind).not.toBe('youtube');
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

  it('distinguishes a graph demonstration from graph status', () => {
    expect(detectOwnerTool('Покажи, как работает граф')?.kind).toBe('graph_demo');
    expect(detectOwnerTool('Пройди по связям и покажи evidence')?.kind).toBe('graph_demo');
    expect(detectOwnerTool('Покажи состояние графа')?.kind).toBe('graph');
  });

  it('recovers the original analytics tool for a correction', () => {
    const tool = detectOwnerTool('Ты выдумал статистику', {
      queryPlan: { intent: 'general', correction: true, followUp: false },
      contextMessages: ['Покажи статистику по Bluesky'],
    });

    expect(tool?.kind).toBe('website');
    expect(tool?.query).toBe('Покажи статистику по Bluesky');
    expect(tool?.recoveredFromContext).toBe(true);
  });

  it('does not recover an old tool for a new independent request', () => {
    const tool = detectOwnerTool('Как у меня дела?', {
      queryPlan: { intent: 'personal_analysis', correction: false, followUp: false },
      contextMessages: ['Покажи статистику по Bluesky'],
    });

    expect(tool).toBeNull();
  });
});
