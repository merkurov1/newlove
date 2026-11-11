/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { buildPierrotExecutionPlan } from '../executionPlan';

const history = (content: string) => [{ role: 'user' as const, content }];

describe('Pierrot execution plan routing', () => {
  it('routes “Найди в RAG рецепты еды” to brain.search, not RAG stats', () => {
    const plan = buildPierrotExecutionPlan('Найди в RAG рецепты еды', { ownerMode: true });

    expect(plan.operation).toBe('brain.search');
    expect(plan.ownerTool).toBeNull();
    expect(plan.tool).toBe('brain');
  });

  it('routes “Поищи в Brain рецепты еды” to brain.search', () => {
    const plan = buildPierrotExecutionPlan('Поищи в Brain рецепты еды', { ownerMode: true });
    expect(plan.operation).toBe('brain.search');
  });

  it('keeps explicit RAG statistics as stats', () => {
    const plan = buildPierrotExecutionPlan('Статистика RAG', { ownerMode: true });
    expect(plan.operation).toBe('brain.stats');
    expect(plan.ownerTool?.kind).toBe('rag');
  });

  it('treats “Сколько документов в Brain?” as stats', () => {
    const plan = buildPierrotExecutionPlan('Сколько документов в Brain?', { ownerMode: true });
    expect(plan.operation).toBe('brain.stats');
  });

  it.each([
    'Последние тексты из Новой газеты',
    'Покажи последние публикации',
    'Найди мои статьи про ИИ',
    'Что я писал про регулирование интернета?',
    'Все материалы о Sotheby’s',
    'Покажи публикации за последнюю неделю',
    'Найди тексты, где я упоминал Vitalik',
    'Что у меня есть в Brain про искусство?',
    'Найди все рецепты',
    'Что нового в моём архиве?',
  ])('routes “%s” to brain.search', (query) => {
    const plan = buildPierrotExecutionPlan(query, { ownerMode: true });
    expect(plan.operation).toBe('brain.search');
  });

  it('keeps an explicit internet request on web search', () => {
    const plan = buildPierrotExecutionPlan('Найди последние новости о Sotheby’s в интернете', {
      ownerMode: true,
    });
    expect(plan.operation).toBe('web.search');
  });

  it.each([
    'Найди в интернете последние новости о Sotheby’s',
    'Поищи в сети информацию о Sotheby’s',
    'Посмотри в сети последние результаты аукционов',
    'Проверь в интернете, что нового у Sotheby’s',
    'Search the web for the latest Sotheby’s results',
  ])('keeps explicit web command %s on web.search', (query) => {
    const plan = buildPierrotExecutionPlan(query, { ownerMode: true });
    expect(plan.operation).toBe('web.search');
    expect(plan.tool).toBe('web');
    expect(plan.ownerTool).toBeNull();
  });

  it('keeps an explicit Brain request on Brain even when it contains a search verb', () => {
    const plan = buildPierrotExecutionPlan('Найди в Brain заметку о Sotheby’s', {
      ownerMode: true,
    });
    expect(plan.operation).toBe('brain.search');
    expect(plan.ownerTool).toBeNull();
  });

  it.each([
    'Сделай анализ медиа за 2026 год',
    'Поищи по базе медиа',
    'Посмотри в базу медиа какие последние записи',
    'Сколько у меня упоминаний в прессе?',
    'Покажи все публикации за 2026 год',
  ])('routes explicit Media request “%s” to Media, never Brain/general', (query) => {
    const plan = buildPierrotExecutionPlan(query, { ownerMode: true });
    expect(plan.tool).toBe('media');
    expect(plan.operation === 'media.search' || plan.operation === 'media.stats').toBe(true);
    expect(plan.operation).not.toBe('brain.search');
    expect(plan.operation).not.toBe('general');
    expect(plan.ownerTool?.kind).toBe('media');
  });

  it('recovers the original Media task across the correction sequence', () => {
    const first = 'Сделай анализ медиа за 2026 год';
    const second = 'Нет, ты всё выдумал, поищи по базе медиа';
    const third = 'Ещё раз посмотри в базу медиа какие последние записи';

    const secondPlan = buildPierrotExecutionPlan(second, {
      ownerMode: true,
      history: history(first),
    });
    const thirdPlan = buildPierrotExecutionPlan(third, {
      ownerMode: true,
      history: [
        { role: 'user' as const, content: first },
        { role: 'user' as const, content: second },
      ],
    });

    expect(secondPlan.tool).toBe('media');
    expect(secondPlan.ownerTool?.kind).toBe('media');
    expect(thirdPlan.tool).toBe('media');
    expect(thirdPlan.ownerTool?.kind).toBe('media');
    expect(secondPlan.operation).not.toBe('brain.search');
    expect(thirdPlan.operation).not.toBe('brain.search');
  });

  it('routes “Покажи последние материалы из Media Archive” to media.search', () => {
    const plan = buildPierrotExecutionPlan('Покажи последние материалы из Media Archive', {
      ownerMode: true,
    });
    expect(plan.operation).toBe('media.search');
    expect(plan.tool).toBe('media');
  });

  it('keeps explicit Media Archive statistics on media.stats', () => {
    const plan = buildPierrotExecutionPlan('Статистика Media Archive', { ownerMode: true });
    expect(plan.operation).toBe('media.stats');
  });

  it('asks for scope when a publication count is ambiguous', () => {
    const plan = buildPierrotExecutionPlan('Сколько у меня публикаций?', { ownerMode: true });
    expect(plan.operation).toBe('clarify.publications');
  });

  it('routes “Много продал?” to Commercial', () => {
    const plan = buildPierrotExecutionPlan('Много продал?', { ownerMode: true });
    expect(plan.operation).toBe('commercial.report');
    expect(plan.tool).toBe('commercial');
  });

  it('routes media mention requests to media.search', () => {
    const plan = buildPierrotExecutionPlan('Покажи публикации обо мне', { ownerMode: true });
    expect(plan.operation).toBe('media.search');
  });

  it('routes system health explicitly', () => {
    const plan = buildPierrotExecutionPlan('Покажи состояние системы', { ownerMode: true });
    expect(plan.operation).toBe('system.health');
  });

  it('continues a Brain search across a follow-up', () => {
    const plan = buildPierrotExecutionPlan('А теперь все рецепты недели', {
      ownerMode: true,
      history: history('Найди рецепты в Brain'),
    });

    expect(plan.operation).toBe('brain.search');
    expect(plan.requiresConversationContext).toBe(true);
    expect(plan.searchQuery).toContain('рецепты');
  });

  it('routes Bluesky statistics to the Bluesky analytics tool, not the site report', () => {
    const plan = buildPierrotExecutionPlan('Покажи статистику по Bluesky', { ownerMode: true });

    expect(plan.ownerTool?.kind).toBe('website');
    expect(plan.operation).toBe('website.report');
    expect(plan.operation).not.toBe('system.stats');
    expect(plan.ownerTool?.query).toBe('Покажи статистику по Bluesky');
  });

  it('continues a Bluesky report on “А подробнее?” from the original request', () => {
    const plan = buildPierrotExecutionPlan('А подробнее?', {
      ownerMode: true,
      history: history('Покажи статистику по Bluesky'),
    });

    expect(plan.ownerTool?.kind).toBe('website');
    expect(plan.ownerTool?.query).toBe('Покажи статистику по Bluesky');
    expect(plan.recoveredFromContext).toBe(true);
  });

  it('re-reads the source on “Ты выдумал статистику” instead of returning site stats', () => {
    const plan = buildPierrotExecutionPlan('Ты выдумал статистику', {
      ownerMode: true,
      history: history('Покажи статистику по Bluesky'),
    });

    expect(plan.ownerTool?.kind).toBe('website');
    expect(plan.ownerTool?.query).toBe('Покажи статистику по Bluesky');
    expect(plan.operation).toBe('website.report');
    expect(plan.operation).not.toBe('system.stats');
  });

  it('keeps “Посещаемость /flow” as exact page analytics, not Flow entries', () => {
    const plan = buildPierrotExecutionPlan('Посещаемость /flow', { ownerMode: true });

    expect(plan.queryPlan.sources.flow).toBe(false);
    expect(plan.ownerTool?.kind).toBe('website');
    expect(plan.operation).toBe('website.report');
  });

  it('runs real graph demo retrieval for “Покажи, как работает граф”', () => {
    const plan = buildPierrotExecutionPlan('Покажи, как работает граф', { ownerMode: true });

    expect(plan.ownerTool?.kind).toBe('graph_demo');
    expect(plan.operation).toBe('graph.demo');
    expect(plan.operation).not.toBe('graph.report');
  });

  it('re-runs the original graph demonstration after a correction', () => {
    const plan = buildPierrotExecutionPlan('Ты выдумал связи', {
      ownerMode: true,
      history: history('Покажи, как работает граф по теме Digital Temple'),
    });

    expect(plan.ownerTool?.kind).toBe('graph_demo');
    expect(plan.ownerTool?.query).toBe('Покажи, как работает граф по теме Digital Temple');
    expect(plan.operation).toBe('graph.demo');
  });

  it('keeps a Bluesky activity follow-up on Bluesky, not general personal context', () => {
    const plan = buildPierrotExecutionPlan('Что я публиковал за неделю?', {
      ownerMode: true,
      history: history('Покажи статистику Bluesky'),
    });

    expect(plan.ownerTool?.kind).toBe('website');
    expect(plan.ownerTool?.query).toContain('Bluesky');
    expect(plan.ownerTool?.query).toContain('публиковал');
    expect(plan.operation).toBe('website.report');
  });

  it('keeps a “most notable posts” follow-up on Bluesky', () => {
    const plan = buildPierrotExecutionPlan('Какие посты наиболее заметные?', {
      ownerMode: true,
      history: history('Покажи статистику Bluesky'),
    });

    expect(plan.ownerTool?.kind).toBe('website');
    expect(plan.ownerTool?.query).toContain('Bluesky');
  });

  it('does not hijack a Flow publication question after a Bluesky question', () => {
    const plan = buildPierrotExecutionPlan('Что я публиковал в Flow за неделю?', {
      ownerMode: true,
      history: history('Покажи статистику Bluesky'),
    });

    expect(plan.ownerTool).toBeNull();
    expect(plan.queryPlan.sources.flow).toBe(true);
  });

  it('keeps the Journal inventory on the Journal source', () => {
    const plan = buildPierrotExecutionPlan('Покажи статистику Journal', { ownerMode: true });

    expect(plan.queryPlan.intent).toBe('journal');
    expect(plan.queryPlan.sources.journal).toBe(true);
    expect(plan.ownerTool).toBeNull();
    expect(plan.operation).toBe('journal.search');
  });

  it('re-reads Journal data after a correction instead of switching to website stats', () => {
    const plan = buildPierrotExecutionPlan('Ты выдумал статистику', {
      ownerMode: true,
      history: history('Покажи статистику Journal'),
    });

    expect(plan.queryPlan.intent).toBe('journal');
    expect(plan.ownerTool).toBeNull();
    expect(plan.operation).toBe('journal.search');
  });

  it('sends “публикации в СМИ за 2026 год” to the complete Media catalogue', () => {
    const plan = buildPierrotExecutionPlan('Публикации в СМИ за 2026 год', {
      ownerMode: true,
    });

    expect(plan.ownerTool?.kind).toBe('media');
    expect(plan.ownerTool?.mediaKind).toBe('list');
    expect(plan.operation).toBe('media.search');
  });

  it('does not continue the previous Bluesky tool after a topic change', () => {
    const plan = buildPierrotExecutionPlan('Как у меня дела?', {
      ownerMode: true,
      history: history('Покажи статистику по Bluesky'),
    });

    expect(plan.ownerTool).toBeNull();
    expect(plan.queryPlan.intent).toBe('personal_analysis');
    expect(plan.requiresConversationContext).toBe(false);
  });

  it('continues a source search with a date filter request', () => {
    const plan = buildPierrotExecutionPlan('А за 2025 год?', {
      ownerMode: true,
      history: history('Найди статьи о Sotheby’s'),
    });

    expect(plan.operation).toBe('brain.search');
    expect(plan.queryPlan.sources.brain).toBe(true);
  });
});
